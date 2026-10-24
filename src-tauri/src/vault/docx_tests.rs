use std::io::{Cursor, Write};

use super::*;

const W: &str = r#"xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#;
const MAX: u64 = 1024 * 1024;

const PACKAGE_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

/// Word's style names, as in a document saved by Word.
const WORD_STYLES: &str = r#"<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Kop3"><w:name w:val="heading 3"/></w:style>
<w:style w:type="paragraph" w:styleId="MyHeading"><w:name w:val="My heading"/><w:basedOn w:val="Heading2"/></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>
</w:styles>"#;

const NUMBERING: &str = r#"<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="10">
  <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
  <w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="20">
  <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>
  <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="20"/><w:lvlOverride w:ilvl="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:lvlOverride></w:num>
</w:numbering>"#;

const DOC_RELS: &str = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a b" TargetMode="External"/>
</Relationships>"#;

fn package(entries: &[(&str, &str)]) -> Vec<u8> {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, body) in entries {
        zip.start_file(*name, opts).unwrap();
        zip.write_all(body.as_bytes()).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

fn docx_with(body: &str, styles: &str) -> Vec<u8> {
    let document = format!(r#"<?xml version="1.0" encoding="UTF-8"?><w:document {W}><w:body>{body}<w:sectPr><w:pgSz w:w="12240"/></w:sectPr></w:body></w:document>"#);
    package(&[
        ("_rels/.rels", PACKAGE_RELS),
        ("word/document.xml", &document),
        ("word/styles.xml", styles),
        ("word/numbering.xml", NUMBERING),
        ("word/_rels/document.xml.rels", DOC_RELS),
    ])
}

fn convert(body: &str) -> String {
    to_markdown(Cursor::new(docx_with(body, WORD_STYLES)), MAX).unwrap()
}

fn p(inner: &str) -> String {
    format!("<w:p>{inner}</w:p>")
}

fn styled(style: &str, inner: &str) -> String {
    format!(r#"<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>{inner}</w:p>"#)
}

fn run(text: &str) -> String {
    format!(r#"<w:r><w:t xml:space="preserve">{text}</w:t></w:r>"#)
}

fn run_with(props: &str, text: &str) -> String {
    format!(r#"<w:r><w:rPr>{props}</w:rPr><w:t xml:space="preserve">{text}</w:t></w:r>"#)
}

fn item(num: &str, level: u8, text: &str) -> String {
    format!(r#"<w:p><w:pPr><w:numPr><w:ilvl w:val="{level}"/><w:numId w:val="{num}"/></w:numPr></w:pPr>{}</w:p>"#, run(text))
}

#[test]
fn headings_come_from_style_names_outline_levels_and_base_styles() {
    let md = convert(&[
        styled("Heading1", &run("Plan")),
        styled("Heading2", &run("Goals")),
        styled("Kop3", &run("Dutch Word")),
        styled("MyHeading", &run("Inherited")),
        format!(r#"<w:p><w:pPr><w:outlineLvl w:val="3"/></w:pPr>{}</w:p>"#, run("Direct")),
        styled("Normal", &run("Body text.")),
        styled("Heading1", ""),
    ]
    .concat());

    assert_eq!(md, "# Plan\n\n## Goals\n\n### Dutch Word\n\n## Inherited\n\n#### Direct\n\nBody text.");
}

#[test]
fn formatting_merges_runs_and_keeps_spaces_outside_markers() {
    let md = convert(&p(&[
        run("Plain "),
        run_with("<w:b/>", "bold "),
        run_with("<w:b/>", "still"),
        run(" then "),
        run_with(r#"<w:b/><w:i/>"#, "both"),
        run_with("<w:i/>", " italic"),
        run(", "),
        run_with(r#"<w:strike/>"#, "gone"),
        run(" and "),
        run_with(r#"<w:b w:val="0"/>"#, "not bold"),
        run(" and "),
        run_with(r#"<w:rStyle w:val="Strong"/>"#, "strong"),
        run_with(r#"<w:vanish/>"#, "hidden"),
    ]
    .concat()));

    assert_eq!(md, "Plain **bold still** then ***both*** *italic*, ~~gone~~ and not bold and **strong**");
}

#[test]
fn links_lists_breaks_and_tabs() {
    let md = convert(&[
        p(&format!(r#"{}<w:hyperlink r:id="rIdLink">{}{}</w:hyperlink>{}"#, run("See "), run("the "), run_with("<w:b/>", "site"), run("."))),
        p(&format!(r#"<w:hyperlink w:anchor="_Toc1">{}</w:hyperlink>"#, run("Internal"))),
        item("1", 0, "First"),
        item("1", 1, "Numbered child"),
        item("1", 1, "Second child"),
        item("1", 0, "Second"),
        styled("ListBullet", &run("From the style")),
        p(&format!(r#"{}<w:r><w:br/><w:tab/><w:t>line two</w:t></w:r><w:r><w:br w:type="page"/></w:r>"#, run("line one"))),
    ]
    .concat());

    assert_eq!(
        md,
        "See [the **site**](https://example.com/a%20b).\n\n\
         Internal\n\n\
         - First\n  1. Numbered child\n  2. Second child\n- Second\n- From the style\n\n\
         line one\\\nline two"
    );
}

#[test]
fn a_change_of_list_kind_restarts_numbering_and_children_indent_under_wide_markers() {
    let items: String = (0..10).map(|i| item("2", 0, &format!("n{i}"))).collect();
    let md = convert(&format!("{items}{}", item("2", 1, "child")));

    let lines: Vec<&str> = md.lines().collect();
    assert_eq!(lines[0], "1. n0", "a num's level overrides aren't followed: its abstract list is numbered");
    assert!(md.contains("10. n9\n    - child"), "{md}");
}

#[test]
fn tables_become_pipe_tables_and_a_single_cell_is_just_its_text() {
    let cell = |text: &str| format!("<w:tc>{}</w:tc>", p(&run(text)));
    let md = convert(&[
        format!(
            "<w:tbl><w:tr>{}{}</w:tr><w:tr>{}<w:tc><w:tcPr><w:gridSpan w:val=\"1\"/></w:tcPr>{}{}</w:tc></w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val=\"2\"/></w:tcPr>{}</w:tc></w:tr></w:tbl>",
            cell("Name"),
            cell("Note"),
            cell("a|b"),
            p(&run("two")),
            p(&run("paras")),
            p(&run("wide")),
        ),
        format!("<w:tbl><w:tr>{}</w:tr></w:tbl>", cell("# boxed snippet")),
    ]
    .concat());

    assert_eq!(
        md,
        "| Name | Note |\n| --- | --- |\n| a\\|b | two paras |\n| wide |  |\n\n\\# boxed snippet"
    );
}

#[test]
fn text_that_looks_like_markdown_stays_literal() {
    let md = convert(&[
        p(&run("# not a heading")),
        p(&run("1. not a list")),
        p(&run("- nor this")),
        p(&run("a [[wikilink]] *star* _under_ `tick` ~tilde~ back\\slash")),
        styled("Heading1", &run("Issue #")),
    ]
    .concat());

    assert_eq!(
        md,
        "\\# not a heading\n\n1\\. not a list\n\n\\- nor this\n\n\
         a \\[\\[wikilink\\]\\] \\*star\\* \\_under\\_ \\`tick\\` \\~tilde\\~ back\\\\slash\n\n# Issue \\#"
    );
}

#[test]
fn deleted_text_drawings_field_codes_and_entities() {
    let md = convert(&p(&[
        run("kept"),
        r#"<w:del><w:r><w:delText>gone</w:delText></w:r></w:del>"#.to_string(),
        r#"<w:ins><w:r><w:t xml:space="preserve"> added</w:t></w:r></w:ins>"#.to_string(),
        r#"<w:r><w:drawing><wp:inline xmlns:wp="x"><w:t>alt</w:t></wp:inline></w:drawing></w:r>"#.to_string(),
        r#"<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "https://x.org" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>"#.to_string(),
        run(" here"),
        r#"<w:r><w:fldChar w:fldCharType="end"/></w:r>"#.to_string(),
        run(" &amp; &#233;"),
    ]
    .concat()));

    assert_eq!(md, "kept added [here](https://x.org) & é");
}

/// The shape Google Docs' "Download → Microsoft Word (.docx)" produces: style ids with
/// digits, `w:val="1"` toggles, numbering with no package rels for styles.
#[test]
fn reads_a_google_docs_export() {
    let styles = r#"<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="normal"><w:name w:val="normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
</w:styles>"#;
    let body = [
        styled("Title", &run("Trip notes")),
        styled("Subtitle", &run("Lisbon")),
        styled("Heading1", &run("Day one")),
        format!(r#"<w:p><w:pPr><w:pStyle w:val="normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>{}</w:p>"#, run_with(r#"<w:b w:val="1"/>"#, "Tram 28")),
        styled("Heading4", &run("Undefined style id")),
    ]
    .concat();
    let md = to_markdown(Cursor::new(docx_with(&body, styles)), MAX).unwrap();

    assert_eq!(md, "# Trip notes\n\n## Lisbon\n\n# Day one\n\n- **Tram 28**\n\n#### Undefined style id");
}

#[test]
fn finds_the_document_without_package_rels_and_refuses_junk() {
    let bare = package(&[(
        "word/document.xml",
        &format!("<w:document {W}><w:body>{}</w:body></w:document>", p(&run("Hi"))),
    )]);
    let no_document = package(&[("other.xml", "<x/>")]);

    assert_eq!(to_markdown(Cursor::new(bare.clone()), MAX).unwrap(), "Hi");
    assert!(matches!(to_markdown(Cursor::new(no_document), MAX), Err(DocxError::Invalid(_))));
    assert!(matches!(to_markdown(Cursor::new(b"not a zip".to_vec()), MAX), Err(DocxError::Invalid(_))));
    assert_eq!(to_markdown(Cursor::new(bare), 10), Err(DocxError::TooLarge));
}
