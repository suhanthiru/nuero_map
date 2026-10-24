//! Word .docx documents as markdown. Google Docs' "Download → Microsoft Word" makes the
//! same format, so both read the same way: headings, paragraphs, bold/italic/strikethrough,
//! links, nested lists and tables. Images, footnotes, comments and deleted text are left out.

use std::collections::HashMap;
use std::io::{Read, Seek};

use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::{BytesRef, BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use zip::ZipArchive;

#[derive(Debug, PartialEq)]
pub enum DocxError {
    /// A part is bigger than the cap once decompressed.
    TooLarge,
    /// Not a readable .docx: not a zip, no document part, or broken XML.
    Invalid(String),
}

fn invalid(e: impl std::fmt::Display) -> DocxError {
    DocxError::Invalid(e.to_string())
}

/// Converts a .docx. `max_part_bytes` caps each XML part read, decompressed.
pub fn to_markdown<R: Read + Seek>(reader: R, max_part_bytes: u64) -> Result<String, DocxError> {
    let mut zip = ZipArchive::new(reader).map_err(invalid)?;
    let package = read_part(&mut zip, "_rels/.rels", max_part_bytes)?
        .map(|xml| parse_rels(&xml, ""))
        .transpose()?
        .unwrap_or_default();
    let main = package
        .iter()
        .find(|r| r.kind == "officeDocument")
        .map(|r| r.target.clone())
        .unwrap_or_else(|| "word/document.xml".into());
    let document = read_part(&mut zip, &main, max_part_bytes)?
        .ok_or_else(|| DocxError::Invalid(format!("no {main} in the package")))?;
    let (dir, file) = main.rsplit_once('/').unwrap_or(("", main.as_str()));
    let rels_path = if dir.is_empty() {
        format!("_rels/{file}.rels")
    } else {
        format!("{dir}/_rels/{file}.rels")
    };
    let rels = read_part(&mut zip, &rels_path, max_part_bytes)?
        .map(|xml| parse_rels(&xml, dir))
        .transpose()?
        .unwrap_or_default();
    let part_of = |kind: &str, fallback: &str| {
        rels.iter()
            .find(|r| r.kind == kind && !r.external)
            .map(|r| r.target.clone())
            .unwrap_or_else(|| fallback.to_string())
    };
    let styles = match read_part(&mut zip, &part_of("styles", "word/styles.xml"), max_part_bytes)? {
        Some(xml) => parse_styles(&xml)?,
        None => HashMap::new(),
    };
    let numbering = match read_part(&mut zip, &part_of("numbering", "word/numbering.xml"), max_part_bytes)? {
        Some(xml) => parse_numbering(&xml)?,
        None => Numbering::default(),
    };
    let links = rels
        .into_iter()
        .filter(|r| r.kind == "hyperlink" && r.external)
        .map(|r| (r.id, r.target))
        .collect();
    let ctx = Context {
        styles,
        numbering,
        links,
    };
    Ok(render(&parse_document(&document, &ctx)?))
}

/// One XML part as text; None when the package doesn't have it. Names match exactly, else
/// ignoring case (some tools write `Word/Document.xml`).
fn read_part<R: Read + Seek>(zip: &mut ZipArchive<R>, name: &str, max: u64) -> Result<Option<String>, DocxError> {
    let actual = if zip.index_for_name(name).is_some() {
        name.to_string()
    } else {
        match zip.file_names().find(|n| n.eq_ignore_ascii_case(name)) {
            Some(found) => found.to_string(),
            None => return Ok(None),
        }
    };
    let entry = zip.by_name(&actual).map_err(invalid)?;
    let mut bytes = Vec::new();
    entry.take(max + 1).read_to_end(&mut bytes).map_err(invalid)?;
    if bytes.len() as u64 > max {
        return Err(DocxError::TooLarge);
    }
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
    String::from_utf8(bytes.to_vec()).map(Some).map_err(invalid)
}

fn for_each_event(xml: &str, mut f: impl FnMut(Event<'_>)) -> Result<(), DocxError> {
    let mut reader = Reader::from_str(xml);
    loop {
        match reader.read_event().map_err(invalid)? {
            Event::Eof => return Ok(()),
            event => f(event),
        }
    }
}

fn local(e: &BytesStart<'_>) -> String {
    e.local_name().as_ref().to_string()
}

/// An attribute by its local name (`w:val` and `val` alike).
fn attr(e: &BytesStart<'_>, name: &str) -> Option<String> {
    e.attributes()
        .flatten()
        .find(|a| a.key.local_name().as_ref() == name)
        .and_then(|a| a.normalized_value(XmlVersion::Implicit1_0).ok().map(|v| v.into_owned()))
}

/// `<w:b/>` is on; `w:val="0"`/`"false"`/`"off"` turns it off.
fn on(e: &BytesStart<'_>) -> bool {
    !matches!(attr(e, "val").as_deref(), Some("0" | "false" | "off" | "none"))
}

fn level(e: &BytesStart<'_>) -> Option<u8> {
    attr(e, "val").and_then(|v| v.trim().parse().ok())
}

fn entity(r: &BytesRef<'_>) -> Option<String> {
    if let Ok(Some(c)) = r.resolve_char_ref() {
        return Some(c.to_string());
    }
    resolve_predefined_entity(&r.xml10_content()).map(str::to_string)
}

// ---- package relationships -------------------------------------------------------------

struct Rel {
    id: String,
    /// The last segment of the relationship type: "officeDocument", "styles", "hyperlink"…
    kind: String,
    /// A part path inside the package, or (external) a URL.
    target: String,
    external: bool,
}

/// Resolves a part target against the directory of the part that names it.
fn resolve_target(dir: &str, target: &str) -> String {
    let mut parts: Vec<&str> = if target.starts_with('/') {
        Vec::new()
    } else {
        dir.split('/').filter(|s| !s.is_empty()).collect()
    };
    for segment in target.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

fn parse_rels(xml: &str, dir: &str) -> Result<Vec<Rel>, DocxError> {
    let mut rels = Vec::new();
    for_each_event(xml, |event| {
        if let Event::Start(e) | Event::Empty(e) = event {
            if local(&e) != "Relationship" {
                return;
            }
            let (Some(id), Some(kind), Some(target)) = (attr(&e, "Id"), attr(&e, "Type"), attr(&e, "Target")) else {
                return;
            };
            let external = attr(&e, "TargetMode").is_some_and(|m| m.eq_ignore_ascii_case("External"));
            rels.push(Rel {
                id,
                kind: kind.rsplit('/').next().unwrap_or_default().to_string(),
                target: if external { target } else { resolve_target(dir, &target) },
                external,
            });
        }
    })?;
    Ok(rels)
}

// ---- styles and numbering --------------------------------------------------------------

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct Fmt {
    bold: bool,
    italic: bool,
    strike: bool,
}

#[derive(Debug, Default)]
struct Style {
    name: String,
    based_on: Option<String>,
    outline: Option<u8>,
    num_id: Option<String>,
    num_level: Option<u8>,
    /// Formatting a character style gives the runs that use it.
    fmt: Fmt,
}

/// Styles this deep in `basedOn` are not followed further (a loop guard).
const STYLE_DEPTH: usize = 10;
const MAX_HEADING: u8 = 6;

fn parse_styles(xml: &str) -> Result<HashMap<String, Style>, DocxError> {
    let mut styles = HashMap::new();
    let mut current: Option<(String, Style)> = None;
    for_each_event(xml, |event| match event {
        Event::Start(e) | Event::Empty(e) => {
            let name = local(&e);
            if name == "style" {
                current = attr(&e, "styleId").map(|id| (id, Style::default()));
                return;
            }
            let Some((_, style)) = current.as_mut() else { return };
            match name.as_str() {
                "name" => style.name = attr(&e, "val").unwrap_or_default(),
                "basedOn" => style.based_on = attr(&e, "val"),
                "outlineLvl" => style.outline = level(&e),
                "numId" => style.num_id = attr(&e, "val"),
                "ilvl" => style.num_level = level(&e),
                "b" => style.fmt.bold = on(&e),
                "i" => style.fmt.italic = on(&e),
                "strike" | "dstrike" => style.fmt.strike = on(&e),
                _ => {}
            }
        }
        Event::End(e) if e.local_name().as_ref() == "style" => {
            if let Some((id, style)) = current.take() {
                styles.insert(id, style);
            }
        }
        _ => {}
    })?;
    Ok(styles)
}

/// "heading 2" → 2, "Title" → 1, "Subtitle" → 2 (Word's names; Google Docs uses the same).
fn heading_from_name(name: &str) -> Option<u8> {
    let name = name.trim().to_lowercase();
    match name.as_str() {
        "title" => Some(1),
        "subtitle" => Some(2),
        _ => name.strip_prefix("heading")?.trim().parse().ok().filter(|n| (1..=9).contains(n)),
    }
}

/// Outline levels 0–8 are headings 1–9; 9 is body text.
fn heading_from_outline(level: u8) -> Option<u8> {
    (level < 9).then_some(level + 1)
}

fn style_heading(styles: &HashMap<String, Style>, id: &str) -> Option<u8> {
    let mut id = id.to_string();
    for _ in 0..STYLE_DEPTH {
        let Some(style) = styles.get(&id) else {
            // A style the package doesn't define: go by its id ("Heading1", "Title").
            return heading_from_name(&split_digits(&id));
        };
        if let Some(level) = style.outline.and_then(heading_from_outline) {
            return Some(level);
        }
        if let Some(level) = heading_from_name(&style.name) {
            return Some(level);
        }
        id = style.based_on.clone()?;
    }
    None
}

/// "Heading1" → "Heading 1".
fn split_digits(id: &str) -> String {
    match id.find(|c: char| c.is_ascii_digit()) {
        Some(at) => format!("{} {}", &id[..at], &id[at..]),
        None => id.to_string(),
    }
}

/// The list a paragraph style puts its paragraphs in, following `basedOn`.
fn style_list(styles: &HashMap<String, Style>, id: &str) -> Option<(String, Option<u8>)> {
    let mut id = id.to_string();
    for _ in 0..STYLE_DEPTH {
        let style = styles.get(&id)?;
        if let Some(num) = &style.num_id {
            return Some((num.clone(), style.num_level));
        }
        id = style.based_on.clone()?;
    }
    None
}

#[derive(Debug, Default)]
struct Numbering {
    /// numId → abstractNumId.
    abstract_of: HashMap<String, String>,
    /// (abstractNumId, level) → numFmt ("bullet", "decimal", "lowerLetter"…).
    formats: HashMap<(String, u8), String>,
}

impl Numbering {
    fn ordered(&self, num_id: &str, level: u8) -> bool {
        let format = self
            .abstract_of
            .get(num_id)
            .and_then(|abs| self.formats.get(&(abs.clone(), level)));
        !matches!(format.map(String::as_str), None | Some("bullet" | "none"))
    }
}

fn parse_numbering(xml: &str) -> Result<Numbering, DocxError> {
    let mut numbering = Numbering::default();
    let mut abstract_id: Option<String> = None;
    let mut lvl: Option<u8> = None;
    let mut num_id: Option<String> = None;
    for_each_event(xml, |event| match event {
        Event::Start(e) | Event::Empty(e) => match local(&e).as_str() {
            "abstractNum" => abstract_id = attr(&e, "abstractNumId"),
            "lvl" => lvl = attr(&e, "ilvl").and_then(|v| v.parse().ok()),
            // Only an abstract definition's levels count; a `num`'s overrides are rare.
            "numFmt" => {
                if let (Some(abs), Some(l), Some(fmt)) = (&abstract_id, lvl, attr(&e, "val")) {
                    numbering.formats.insert((abs.clone(), l), fmt);
                }
            }
            "num" => num_id = attr(&e, "numId"),
            "abstractNumId" => {
                if let (Some(num), Some(abs)) = (&num_id, attr(&e, "val")) {
                    numbering.abstract_of.insert(num.clone(), abs);
                }
            }
            _ => {}
        },
        Event::End(e) => match e.local_name().as_ref() {
            "abstractNum" => abstract_id = None,
            "lvl" => lvl = None,
            "num" => num_id = None,
            _ => {}
        },
        _ => {}
    })?;
    Ok(numbering)
}

// ---- the document ----------------------------------------------------------------------

struct Context {
    styles: HashMap<String, Style>,
    numbering: Numbering,
    /// Relationship id → external URL.
    links: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq)]
enum Inline {
    Text { text: String, fmt: Fmt, link: Option<String> },
    Break,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum ParaKind {
    Normal,
    Heading(u8),
    Item { ordered: bool, level: u8 },
}

#[derive(Debug)]
struct Cell {
    blocks: Vec<Block>,
    /// Grid columns the cell spans.
    span: usize,
    /// A vertically merged cell below the first: shown empty.
    continued: bool,
}

#[derive(Debug)]
enum Block {
    Para { kind: ParaKind, inlines: Vec<Inline> },
    Table(Vec<Vec<Cell>>),
}

#[derive(Default)]
struct ParaBuild {
    style: Option<String>,
    outline: Option<u8>,
    num_id: Option<String>,
    num_level: Option<u8>,
    inlines: Vec<Inline>,
}

#[derive(Default)]
struct RunState {
    fmt: Fmt,
    hidden: bool,
}

/// A field (`fldChar` begin … separate … end): its code comes first, then its shown result.
#[derive(Default)]
struct Field {
    code: String,
    showing: bool,
    link: Option<String>,
}

#[derive(Default)]
struct TableBuild {
    rows: Vec<Vec<Cell>>,
    span: usize,
    continued: bool,
}

/// Subtrees with nothing to read: drawings, tracked deletions and old formatting, notes'
/// reference marks, content-control settings, and text boxes (paragraphs inside a run).
const SKIPPED: &[&str] = &[
    "del",
    "moveFrom",
    "delText",
    "drawing",
    "pict",
    "object",
    "AlternateContent",
    "txbxContent",
    "footnoteReference",
    "endnoteReference",
    "commentReference",
    "pPrChange",
    "rPrChange",
    "tblPrChange",
    "trPrChange",
    "tcPrChange",
    "numberingChange",
    "sectPr",
    "sdtPr",
    "sdtEndPr",
    "fldData",
];

/// The URL a HYPERLINK field points at; None for links inside the document (`\l`).
fn field_link(code: &str) -> Option<String> {
    let rest = code.trim();
    let rest = rest.get(..9).filter(|p| p.eq_ignore_ascii_case("HYPERLINK")).map(|_| &rest[9..])?;
    let (before, url) = match rest.find('"') {
        Some(open) => {
            let after = &rest[open + 1..];
            (&rest[..open], after[..after.find('"').unwrap_or(after.len())].to_string())
        }
        None => ("", rest.split_whitespace().find(|t| !t.starts_with('\\'))?.to_string()),
    };
    (!before.contains("\\l") && !url.trim().is_empty()).then(|| url.trim().to_string())
}

struct DocParser<'c> {
    ctx: &'c Context,
    /// The body, then one list per open table cell.
    containers: Vec<Vec<Block>>,
    tables: Vec<TableBuild>,
    para: Option<ParaBuild>,
    run: RunState,
    /// Open `hyperlink` / `fldSimple` elements, innermost last.
    links: Vec<Option<String>>,
    fields: Vec<Field>,
    skip: usize,
    in_ppr: bool,
    in_rpr: bool,
    in_text: bool,
    in_code: bool,
}

impl<'c> DocParser<'c> {
    fn new(ctx: &'c Context) -> Self {
        Self {
            ctx,
            containers: vec![Vec::new()],
            tables: Vec::new(),
            para: None,
            run: RunState::default(),
            links: Vec::new(),
            fields: Vec::new(),
            skip: 0,
            in_ppr: false,
            in_rpr: false,
            in_text: false,
            in_code: false,
        }
    }

    fn link(&self) -> Option<String> {
        self.fields
            .iter()
            .rev()
            .find_map(|f| f.link.clone().filter(|_| f.showing))
            .or_else(|| self.links.iter().rev().find_map(Clone::clone))
    }

    /// Text inside a field's code (before `separate`) isn't shown.
    fn showing(&self) -> bool {
        self.fields.iter().all(|f| f.showing) && !self.run.hidden
    }

    fn push_text(&mut self, text: &str) {
        if !self.showing() {
            return;
        }
        let (fmt, link) = (self.run.fmt, self.link());
        let Some(para) = self.para.as_mut() else { return };
        let text = text.replace(['\n', '\r'], " ");
        if let Some(Inline::Text { text: last, fmt: f, link: l }) = para.inlines.last_mut() {
            if *f == fmt && *l == link {
                last.push_str(&text);
                return;
            }
        }
        para.inlines.push(Inline::Text { text, fmt, link });
    }

    fn push_break(&mut self) {
        if !self.showing() {
            return;
        }
        if let Some(para) = self.para.as_mut() {
            para.inlines.push(Inline::Break);
        }
    }

    fn container(&mut self) -> &mut Vec<Block> {
        self.containers.last_mut().expect("the body is always there")
    }

    fn finish_para(&mut self) {
        let Some(para) = self.para.take() else { return };
        let mut inlines = para.inlines;
        while matches!(inlines.last(), Some(Inline::Break)) {
            inlines.pop();
        }
        let first_text = inlines.iter().position(|i| !matches!(i, Inline::Break));
        inlines.drain(..first_text.unwrap_or(inlines.len()));
        let has_text = inlines
            .iter()
            .any(|i| matches!(i, Inline::Text { text, .. } if !text.trim().is_empty()));
        if !has_text {
            return;
        }
        let styles = &self.ctx.styles;
        let style = para.style.as_deref();
        let heading = para
            .outline
            .and_then(heading_from_outline)
            .or_else(|| style.and_then(|s| style_heading(styles, s)));
        let list = match para.num_id {
            Some(id) => Some((id, para.num_level)),
            None => style.and_then(|s| style_list(styles, s)),
        }
        .filter(|(id, _)| id != "0");
        let kind = match (heading, list) {
            (Some(level), _) => ParaKind::Heading(level.min(MAX_HEADING)),
            (None, Some((id, lvl))) => {
                let level = para.num_level.or(lvl).unwrap_or(0).min(8);
                ParaKind::Item {
                    ordered: self.ctx.numbering.ordered(&id, level),
                    level,
                }
            }
            (None, None) => ParaKind::Normal,
        };
        self.container().push(Block::Para { kind, inlines });
    }

    fn start(&mut self, e: &BytesStart<'_>, empty: bool) {
        if self.skip > 0 {
            if !empty {
                self.skip += 1;
            }
            return;
        }
        let name = local(e);
        if SKIPPED.contains(&name.as_str()) {
            if !empty {
                self.skip = 1;
            }
            return;
        }
        if self.in_ppr {
            let Some(para) = self.para.as_mut() else { return };
            match name.as_str() {
                "pStyle" => para.style = attr(e, "val"),
                "outlineLvl" => para.outline = level(e),
                "numId" => para.num_id = attr(e, "val"),
                "ilvl" => para.num_level = level(e),
                _ => {}
            }
            return;
        }
        match name.as_str() {
            "p" if !empty => {
                self.finish_para();
                self.para = Some(ParaBuild::default());
            }
            "pPr" if !empty && self.para.is_some() => self.in_ppr = true,
            "r" => self.run = RunState::default(),
            "rPr" if !empty => self.in_rpr = true,
            "rStyle" if self.in_rpr => {
                if let Some(style) = attr(e, "val").and_then(|id| self.ctx.styles.get(&id)) {
                    let f = style.fmt;
                    self.run.fmt.bold |= f.bold;
                    self.run.fmt.italic |= f.italic;
                    self.run.fmt.strike |= f.strike;
                }
            }
            "b" if self.in_rpr => self.run.fmt.bold = on(e),
            "i" if self.in_rpr => self.run.fmt.italic = on(e),
            "strike" | "dstrike" if self.in_rpr => self.run.fmt.strike = on(e),
            "vanish" if self.in_rpr => self.run.hidden = on(e),
            "t" if !empty => self.in_text = true,
            "tab" if !self.in_rpr => self.push_text(" "),
            "noBreakHyphen" => self.push_text("-"),
            "br" | "cr" => {
                if !matches!(attr(e, "type").as_deref(), Some("page" | "column")) {
                    self.push_break();
                }
            }
            "hyperlink" if !empty => {
                let link = attr(e, "id").and_then(|id| self.ctx.links.get(&id).cloned());
                self.links.push(link);
            }
            "fldSimple" if !empty => self.links.push(attr(e, "instr").and_then(|c| field_link(&c))),
            "fldChar" => match attr(e, "fldCharType").as_deref() {
                Some("begin") => self.fields.push(Field::default()),
                Some("separate") => {
                    if let Some(f) = self.fields.last_mut() {
                        f.showing = true;
                        f.link = field_link(&f.code);
                    }
                }
                Some("end") => {
                    self.fields.pop();
                }
                _ => {}
            },
            "instrText" if !empty => self.in_code = true,
            "tbl" if !empty => {
                self.finish_para();
                self.tables.push(TableBuild::default());
            }
            "tr" if !empty => {
                if let Some(t) = self.tables.last_mut() {
                    t.rows.push(Vec::new());
                }
            }
            "tc" if !empty && !self.tables.is_empty() => {
                self.finish_para();
                self.containers.push(Vec::new());
                if let Some(t) = self.tables.last_mut() {
                    t.span = 1;
                    t.continued = false;
                }
            }
            "gridSpan" => {
                if let (Some(t), Some(span)) = (self.tables.last_mut(), attr(e, "val").and_then(|v| v.parse::<usize>().ok())) {
                    t.span = span.clamp(1, 64);
                }
            }
            "vMerge" => {
                if let Some(t) = self.tables.last_mut() {
                    t.continued = attr(e, "val").as_deref() != Some("restart");
                }
            }
            _ => {}
        }
    }

    fn end(&mut self, name: &str) {
        if self.skip > 0 {
            self.skip -= 1;
            return;
        }
        match name {
            "p" => self.finish_para(),
            "pPr" => self.in_ppr = false,
            "rPr" => self.in_rpr = false,
            "t" => self.in_text = false,
            "instrText" => self.in_code = false,
            "hyperlink" | "fldSimple" => {
                self.links.pop();
            }
            "tc" if self.containers.len() > 1 && !self.tables.is_empty() => {
                self.finish_para();
                let blocks = self.containers.pop().unwrap_or_default();
                if let Some(t) = self.tables.last_mut() {
                    let cell = Cell {
                        blocks,
                        span: t.span.max(1),
                        continued: t.continued,
                    };
                    match t.rows.last_mut() {
                        Some(row) => row.push(cell),
                        None => t.rows.push(vec![cell]),
                    }
                }
            }
            "tbl" => {
                self.finish_para();
                if let Some(t) = self.tables.pop() {
                    self.container().push(Block::Table(t.rows));
                }
            }
            _ => {}
        }
    }

    fn text(&mut self, text: &str) {
        if self.skip > 0 {
            return;
        }
        if self.in_code {
            if let Some(f) = self.fields.last_mut() {
                f.code.push_str(text);
            }
        } else if self.in_text {
            self.push_text(text);
        }
    }
}

fn parse_document(xml: &str, ctx: &Context) -> Result<Vec<Block>, DocxError> {
    let mut parser = DocParser::new(ctx);
    for_each_event(xml, |event| match event {
        Event::Start(e) => parser.start(&e, false),
        Event::Empty(e) => parser.start(&e, true),
        Event::End(e) => parser.end(e.local_name().as_ref()),
        Event::Text(t) => parser.text(&t.xml10_content()),
        Event::GeneralRef(r) => {
            if let Some(text) = entity(&r) {
                parser.text(&text);
            }
        }
        _ => {}
    })?;
    parser.finish_para();
    // Unclosed tables (a truncated document) still give what they hold.
    while parser.containers.len() > 1 {
        let cell = parser.containers.pop().unwrap_or_default();
        parser.container().extend(cell);
    }
    while let Some(t) = parser.tables.pop() {
        parser.container().push(Block::Table(t.rows));
    }
    Ok(parser.containers.pop().unwrap_or_default())
}

// ---- markdown --------------------------------------------------------------------------

/// Characters that mean something inline in markdown (GFM's `~~` included).
fn escape_inline(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if matches!(c, '\\' | '*' | '_' | '`' | '[' | ']' | '~') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Keeps a line of text from reading as a heading, quote, list item or rule.
fn escape_block_start(line: &str) -> String {
    let line = line.trim_start();
    match line.chars().next() {
        Some('#' | '>' | '-' | '+' | '=') => format!("\\{line}"),
        Some(c) if c.is_ascii_digit() => {
            let digits = line.find(|c: char| !c.is_ascii_digit()).unwrap_or(line.len());
            match line[digits..].chars().next() {
                Some('.' | ')') => format!("{}\\{}", &line[..digits], &line[digits..]),
                _ => line.to_string(),
            }
        }
        _ => line.to_string(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mark {
    Strike,
    Bold,
    Italic,
}

impl Mark {
    fn token(self) -> &'static str {
        match self {
            Mark::Strike => "~~",
            Mark::Bold => "**",
            Mark::Italic => "*",
        }
    }
}

/// Outermost first, so the markers always nest the same way.
fn marks(fmt: Fmt) -> Vec<Mark> {
    [(fmt.strike, Mark::Strike), (fmt.bold, Mark::Bold), (fmt.italic, Mark::Italic)]
        .into_iter()
        .filter_map(|(set, m)| set.then_some(m))
        .collect()
}

fn close(out: &mut String, open: &mut Vec<Mark>, from: usize) {
    for m in open.drain(from..).rev() {
        out.push_str(m.token());
    }
}

/// Runs of formatted text. Markers sit against the words they wrap, with spaces moved
/// outside them (`** a **` wouldn't read as bold). A line break closes them.
fn render_formatted(items: &[&Inline], brk: &str) -> String {
    let mut out = String::new();
    let mut open: Vec<Mark> = Vec::new();
    let mut pending = String::new();
    for item in items {
        match item {
            Inline::Break => {
                close(&mut out, &mut open, 0);
                pending.clear();
                out.push_str(brk);
            }
            Inline::Text { text, fmt, .. } => {
                let escaped = escape_inline(text);
                let core = escaped.trim();
                if core.is_empty() {
                    pending.push_str(&escaped);
                    continue;
                }
                let lead = &escaped[..escaped.len() - escaped.trim_start().len()];
                let trail = &escaped[escaped.trim_end().len()..];
                let want = marks(*fmt);
                if let Some(at) = open.iter().position(|m| !want.contains(m)) {
                    close(&mut out, &mut open, at);
                }
                out.push_str(&pending);
                out.push_str(lead);
                pending.clear();
                for m in want {
                    if !open.contains(&m) {
                        out.push_str(m.token());
                        open.push(m);
                    }
                }
                out.push_str(core);
                pending.push_str(trail);
            }
        }
    }
    close(&mut out, &mut open, 0);
    out.push_str(&pending);
    out
}

/// A link destination that stays one token.
fn destination(url: &str) -> String {
    url.trim()
        .replace(' ', "%20")
        .replace('(', "%28")
        .replace(')', "%29")
        .replace('<', "%3C")
        .replace('>', "%3E")
}

fn link_of(item: &Inline) -> Option<&str> {
    match item {
        Inline::Text { link, .. } => link.as_deref(),
        Inline::Break => None,
    }
}

/// A paragraph's text: formatted runs, with runs that share a link wrapped as one `[…](…)`.
fn render_inlines(inlines: &[Inline], brk: &str) -> String {
    let mut out = String::new();
    let mut at = 0;
    while at < inlines.len() {
        let link = link_of(&inlines[at]);
        let mut end = at + 1;
        while end < inlines.len() && link.is_some() && link_of(&inlines[end]) == link {
            end += 1;
        }
        if link.is_none() {
            while end < inlines.len() && link_of(&inlines[end]).is_none() {
                end += 1;
            }
        }
        let group: Vec<&Inline> = inlines[at..end].iter().collect();
        let text = render_formatted(&group, brk);
        match link {
            Some(url) if !text.trim().is_empty() => {
                let lead = &text[..text.len() - text.trim_start().len()];
                let trail = &text[text.trim_end().len()..];
                out.push_str(&format!("{lead}[{}]({}){trail}", text.trim(), destination(url)));
            }
            _ => out.push_str(&text),
        }
        at = end;
    }
    out
}

/// Numbering and indentation of the list being written: per level, the marker's width
/// (which its children indent by), its count, and whether it's numbered.
#[derive(Default)]
struct ListState {
    levels: Vec<(usize, u32, Option<bool>)>,
}

impl ListState {
    /// The indent and marker for the next item at `level`.
    fn item(&mut self, level: u8, ordered: bool) -> (usize, String) {
        let level = level as usize;
        self.levels.truncate(level + 1);
        while self.levels.len() <= level {
            self.levels.push((2, 0, None));
        }
        let (width, count, kind) = &mut self.levels[level];
        if *kind != Some(ordered) {
            *count = 0;
            *kind = Some(ordered);
        }
        *count += 1;
        let marker = if ordered { format!("{count}.") } else { "-".to_string() };
        *width = marker.len() + 1;
        let indent = self.levels[..level].iter().map(|(w, _, _)| w).sum();
        (indent, marker)
    }
}

fn render_item(inlines: &[Inline], indent: usize, marker: &str) -> String {
    let pad = " ".repeat(indent + marker.len() + 1);
    let text = render_inlines(inlines, "\\\n");
    let lines: Vec<String> = text.split('\n').map(escape_block_start).collect();
    format!("{}{marker} {}", " ".repeat(indent), lines.join(&format!("\n{pad}")))
}

fn render_heading(inlines: &[Inline], level: u8) -> String {
    let mut text = render_inlines(inlines, " ").trim().to_string();
    // A trailing `#` would be read as a closing sequence and dropped.
    if text.ends_with('#') {
        text.insert(text.len() - 1, '\\');
    }
    format!("{} {text}", "#".repeat(level as usize))
}

fn cell_text(blocks: &[Block]) -> String {
    let parts: Vec<String> = blocks
        .iter()
        .map(|b| match b {
            Block::Para { inlines, .. } => render_inlines(inlines, " ").trim().to_string(),
            Block::Table(rows) => rows
                .iter()
                .flatten()
                .map(|c| cell_text(&c.blocks))
                .filter(|t| !t.is_empty())
                .collect::<Vec<_>>()
                .join(" "),
        })
        .filter(|t| !t.is_empty())
        .collect();
    parts.join(" ").replace('|', "\\|")
}

/// A GFM table, its first row the header. A one-cell table (Google Docs' way of boxing a
/// snippet) is just its contents.
fn render_table(rows: &[Vec<Cell>]) -> String {
    if let [row] = rows {
        if let [cell] = row.as_slice() {
            return render(&cell.blocks);
        }
    }
    let grid: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            row.iter()
                .flat_map(|cell| {
                    let text = if cell.continued { String::new() } else { cell_text(&cell.blocks) };
                    std::iter::once(text).chain(std::iter::repeat_n(String::new(), cell.span - 1))
                })
                .collect()
        })
        .collect();
    let columns = grid.iter().map(Vec::len).max().unwrap_or(0);
    if columns == 0 || grid.iter().flatten().all(String::is_empty) {
        return String::new();
    }
    let line = |cells: &[String]| {
        let padded: Vec<&str> = (0..columns).map(|i| cells.get(i).map_or("", String::as_str)).collect();
        format!("| {} |", padded.join(" | "))
    };
    let mut lines = vec![line(&grid[0]), format!("|{}", " --- |".repeat(columns))];
    lines.extend(grid[1..].iter().map(|row| line(row)));
    lines.join("\n")
}

fn render(blocks: &[Block]) -> String {
    let mut out = String::new();
    let mut list = ListState::default();
    let mut after_item = false;
    for block in blocks {
        let (text, is_item) = match block {
            Block::Para { kind: ParaKind::Heading(level), inlines } => (render_heading(inlines, *level), false),
            Block::Para { kind: ParaKind::Item { ordered, level }, inlines } => {
                let (indent, marker) = list.item(*level, *ordered);
                (render_item(inlines, indent, &marker), true)
            }
            Block::Para { kind: ParaKind::Normal, inlines } => {
                let text = render_inlines(inlines, "\\\n");
                let lines: Vec<String> = text.split('\n').map(escape_block_start).collect();
                (lines.join("\n"), false)
            }
            Block::Table(rows) => (render_table(rows), false),
        };
        if text.trim().is_empty() {
            continue;
        }
        if !is_item {
            list = ListState::default();
        }
        if !out.is_empty() {
            out.push_str(if after_item && is_item { "\n" } else { "\n\n" });
        }
        out.push_str(text.trim_end());
        after_item = is_item;
    }
    out
}

/// A .docx holding these paragraphs of plain text (for other modules' tests).
#[cfg(test)]
pub fn sample(paragraphs: &[&str]) -> Vec<u8> {
    use std::io::Write;
    let body: String = paragraphs
        .iter()
        .map(|p| format!("<w:p><w:r><w:t>{p}</w:t></w:r></w:p>"))
        .collect();
    let document = format!(
        r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>"#
    );
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    zip.start_file("word/document.xml", zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(document.as_bytes()).unwrap();
    zip.finish().unwrap().into_inner()
}

#[cfg(test)]
#[path = "docx_tests.rs"]
mod tests;
