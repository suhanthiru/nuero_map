# Markdown rendering (Reading view, markdown -> HTML, embeds)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian 1.14.4 renders Markdown with a **patched copy of remark-parse 8 (the old tokenizer-based
remark), mdast-util-to-hast and hast-util-to-html**, extended in-house with ~20 tokenizers/transformers
(wikilinks, embeds, `==highlight==` with colour emoji, `%%comments%%`, callouts, footnotes incl.
inline `^[...]`, `$`/`$$` math, `#tags`, `^block-ids`, frontmatter). The same parser is duplicated in
`worker.js`, where it also produces the metadata cache. Rendering is **section-based**: each top-level
mdast node becomes one HTML string; the Reading view diffs the new list of HTML strings against the
previous one (exact string equality), reuses unchanged section DOM, and lets "recyclers" steal
expensive already-rendered DOM (Mermaid SVG, Prism-highlighted code, MathJax output, loaded embeds,
loaded images) from replaced sections. Every section's HTML goes through **DOMPurify 3.0.1**
(`sanitizeHTMLToDom`) before entering the DOM, then through a sorted list of post-processors (core and
plugin). Long notes are parsed in a Web Worker (text >= 10 240 chars), rendered in 5 ms time slices,
and **virtualised**: all sections are eventually rendered, but only those within one viewport (min
500 px) above/below the scroll position stay attached; a "pusher" element plus a sizer min-height
fake the rest. Scroll position is a **fractional source-line number**, shared between Reading and
editing modes. Embeds (`![[...]]`) go through an extension registry (`app.embedRegistry`); note
embeds are full nested renderers, limited to depth 5. Hover previews are `HoverPopover`s driven by a
`hover-link` workspace event and the Page Preview core plugin.

Legend: **[O]** observed in code, **[I]** inferred from code, **[U]** unknown.

---

## Where it lives

| Minified id | Public / inferred name | Role | Lines (pretty `app.js` unless noted) |
|---|---|---|---|
| module 4967 (`Yp = Gp.Parser`) | remark-parse 8 `Parser` | Base tokenizer parser (patched blockquote + list item) | 1300-1365 (tokenizer table), 1186-1194 (defaults), 9396-9448 (blockquote/callout), 626-640 (task items) |
| `om` | inferred `MarkdownParser` (subclass of remark Parser) | Parser with Obsidian tokenizers; `om.globalOptions = {breaks, commonmark}` | 33463-34169 |
| `am` / `sm` / `lm` | inferred mdast transformers / hast transformers / custom hast handlers | Plugin lists (`Xp` = transformer list class) | 28889-28901, 33464 |
| `Qp`, `$p`, `Zp` | inferred `addInlineTokenizer`, `addBlockTokenizer`, `addInterrupt` | Insert a tokenizer before an existing one | 28902-28919 |
| `cm` | inferred `parseMarkdown(text) -> mdast` | Parse + run `am` transformers | 33465-33472 |
| `fm` | inferred `mdastToHtml(tree, opts)` | to-hast with `allowDangerousHtml`, `lm` handlers, `sm` transformers, to-html | 34213-34220 |
| `dm` | inferred `getFrontmatter(tree)` | YAML -> object from leading `yaml` node | 34201-34212 |
| `pm` | `getFrontMatterInfo` | Locate `---` block in raw text | 34170-34200 |
| `ZW` / worker `Ar` | inferred `parseSections(text)` | Split mdast into `{html,pos,level}` sections | 72501-72517; `worker.js:12017-12039` (message branch 12154-12158) |
| `Ej`, `Pj`, `Sj`, `Mj` | inferred `WorkerClient`, shared instance, `createWorker` | One global worker, one in-flight request | 72722-72771 |
| `xj` | `MarkdownRenderChild` | `Component` + `containerEl` | 72772-72779 |
| `Tj` | `MarkdownPreviewSection` | One section: html, el, height, lines, level, fold state | 72780-72819 |
| `Ij` | inferred feature flags | `{progressiveRender, asyncParse, listBullet}` all `true` | 72830 |
| `Lj` | `MarkdownPreviewRenderer` | Section diff, render loop, virtualisation, scroll map, folds, post-processor registry | 72830-73777 |
| (13 anonymous) | built-in post-processors / recyclers | frontmatter hide, footnote ids, copy button, Prism, MathJax, images/iframes, callouts, tables, `dir` | 73778-74164 |
| `Oj`, `Fj`, `Rj`, `Bj`, `Nj` | inferred Mermaid render / batch / find / source-cache WeakMap / `getCodeSource` | Mermaid pipeline | 73794-73899 |
| `Yj` | inferred `PreviewLinkHandler` | Click/drag/context/hover for links + tags | 74223-74283 |
| `Qj` | inferred `markUnresolvedLinks` | Toggles `is-unresolved` | 74284-74290 |
| `$j` | `MarkdownRenderer` | Owns an `Lj`, builds `MarkdownPostProcessorContext`, static `render`/`renderMarkdown`/`postProcess` | 74291-74474 |
| `Zj`, `tU`, `Gj` | inferred embedded-query block | ```` ```query ```` live search results | 74165-74222, 74475-74486, 74804-74842 |
| `Jj` | inferred `StaticMarkdownEmbed` | Non-incremental note embed (displayMode) | 74487-74558 |
| `eU` | `MarkdownPreviewView` | Reading-view mode of `MarkdownView` | 74559-74804 |
| `$W` | inferred `PreviewSearch` | Find-in-page overlay highlights | 72355-72500 |
| `yE` | inferred `lazyScript(url, {before, after, type})` | Lazy `<script>` loader with `.promise` / `.then` | 38233-38262 |
| `rj`/`oj`, `aj`/`sj`, `cj`/`uj`, `hj`, `gj`, `JW`/`tj` | Mermaid loader / `loadMermaid`, Prism / `loadPrism`, MathJax / `loadMathJax`, `renderMath`, `finishRenderMath`, `loadPdfJs` | Vendored-lib loaders | 72518-72668 |
| `bj`, `wj`, `Cj` | inferred `externalEmbedUrl`, `createExternalIframe`, iframe message relay | YouTube / X embeds | 72670-72721 |
| `aC`, `lC`, `cC` | DOMPurify instance, config, `sanitizeHTMLToDom` | Sanitiser | 37195, 37499-37513 |
| `E0`, `C0`, `k0` | inferred `EmbeddedMarkdownEditor`, its preview mode, its CM6 edit mode | Base for editable note embeds / popovers | 96665-96913 |
| `f2` | inferred `MarkdownEmbed` (editable) | Note embed used in Reading view, Live Preview, hover, footnotes view | 99115-99484 |
| `a2`, `s2`, `l2`, `c2` | inferred media embed base, image, audio, video embeds | | 98917-98965 |
| `u2`, `h2` | inferred generic file embed, missing-file embed | | 98965-99046 |
| `$0` | inferred PDF embed | | 98654-98714 |
| `p2` | inferred `EmbedRegistry` (`app.embedRegistry`) | ext -> creator | 99046-99096 |
| `d2`, `o2`, `r2` | inferred `EmbedLoader.load`, `getEmbedDepth`, depth WeakMap | | 98908-98916, 99096-99114 |
| `v2`, `g2`, `m2`, `y2` | Mermaid vault-trust key/get/set/guarded render | **new in 1.14 [I]** | 99484-99530 |
| `$m`, `Zm`, `Jm`, `qm` | `resolveSubpath`, inferred `extractSubpathContent`, subpath type, `parseLinktext` | Transclusion slicing | 34546-34728 |
| `OZ`, `JZ` | popover state enum, `HoverPopover` | | 89255-89463 |
| `E1` | inferred `FileHoverPopover` | `d2.load` inside a popover | 94045-94118 |
| `tne`, `nne` | Page Preview core plugin + settings tab | | 130837-130956 |
| `tJ`, `nJ` | Publish site renderer (reuses `Lj`) | | 89471-89825 |
| `yR`, `SR` | Turndown instance, `htmlToMarkdown` | | 61789-61883 |
| `F8`, `O8` | "Export to PDF" modal + strings | | 114895-115115 |
| `hie`, `pie`, `die` | reveal.js loader, Slides core plugin, slides presenter | | 135485-135620 |
| `qF` | inferred media lightbox (zoom/pinch/swipe) | Opened on image click in Reading view | 60495-61099 |
| `x/obsidian/quicklook.js` | macOS Quick Look renderer (separate bundle) | Contains its own copy of the parser/renderer markers (`blockTokenizers`, `callout`, `DOMPurify`, Mermaid/MathJax/Prism) **[O]** | `main.js:3772` copies `quicklook.*`, prism, mathjax, mermaid |

Vendored library versions **[O]**: DOMPurify 3.0.1 (`app.js:37195`), PrismJS 1.30.0 (header of
`lib/prism.min.js`, ~370 language ids incl. aliases), Mermaid 11.13.0 (`version:"11.13.0"` in
`lib/mermaid.min.js`), MathJax 4.1.x (`obsidian-mathjax.js`, MathJax-4-style `output.font`
config), Turndown 7.2.0, reveal.js 4.3.1, Defuddle 0.19.2, Mozilla Readability (no version string).
remark-parse major version **[I]** 8.x: tokenizer API (`blockTokenizers`/`inlineTokenizers`) and no
`footnotes` default option (`app.js:1186-1194`).

---

## How it works

### 1. Parser stack

* **Base**: remark-parse 8 `Parser` with default `{position: true, gfm: true, commonmark: false,
  pedantic: false}` **[O]** (`app.js:1186-1194`). Obsidian sets `om.globalOptions = {breaks: true,
  commonmark: true}` **[O]** (`app.js:33464`); `breaks` is flipped by the vault setting
  `strictLineBreaks` (`breaks = !strictLineBreaks`) and forces a full re-parse **[O]**
  (`app.js:74738-74741`; `rerender()` without `true`, so sections whose HTML is unchanged keep their DOM).
* **Patched vendor modules [O]**: the blockquote tokenizer (module 6234) detects a callout header on
  the first line, and the list-item tokenizer (`app.js:626-640`) accepts **any single character**
  in `[ ]` (regex `^\[(.)][ \t]`), storing it as `checklist` and setting `checked = char !== " "`.
* **Plugin mechanism [O]**: `Qp(parser, name, before, fn, locator)` inserts an inline tokenizer
  before an existing one in `inlineMethods`; `$p` does the same for block tokenizers; `Zp` adds the
  new block tokenizer to the `interruptParagraph` / `interruptList` / `interruptBlockquote` lists
  (`app.js:28902-28919`). Three plugin lists exist: `am` (mdast transformers run after parsing),
  `sm` (hast transformers run after to-hast), `lm` (custom to-hast handlers keyed by node type).
* **Entry points [O]**: `cm(text)` creates a vfile, parses with `om`, runs `am` (`app.js:33465`).
  `fm(tree, {definitions})` runs mdast-util-to-hast with `allowDangerousHtml: true` and handlers
  `lm`, then `sm`, then hast-util-to-html with `allowDangerousHtml: true` (`app.js:34213-34220`).
  Raw HTML therefore passes through as text and is only cleaned later by DOMPurify.

#### Syntax extensions (order is the insertion order) **[O]**

| Syntax | Tokenizer / transformer | mdast node | HTML produced | Lines |
|---|---|---|---|---|
| `==text==`, `==🟥text==` | inline `mark` before `text`, requires `gfm`, not `====`, no space after `==` | `mark` | `<mark data-highlight="red">` | 33476-33500 |
| colour emoji | `im()` maps 🔴/🟥->red, 🟠/🟧->orange, 🟡/🟨->yellow, 🟢/🟩->green, 🔵/🟦->blue, 🟣/🟪->purple; emoji is stripped from output | | `data-highlight` | 33418-33452 |
| `[[target#sub|alias]]`, `![[...]]` | inline `ilink` before `link`, regex `^(!?)\[\[(.+?)]]`, rejects nested `[[` | `ilink` / `iembed` | `a.internal-link[href][data-href]` (+`aria-label` "note > heading" when aliased, `data-tooltip-position=top`); `span.internal-embed[src][alt]` | 33501-33530 |
| `#tag` | inline `tag` before `image` (remark has no `image` inline method, so it lands just before `text`); regex `rm` (no whitespace or punctuation in body; `#123` all-digit rejected); must be at start or after whitespace | `tag` | `a.tag[href="#tag"]` | 33461, 33531-33549 |
| `- [x] item` | transformer on `listItem` with boolean `checked` | adds `checklist` child | `li.task-list-item(.is-checked)[data-task=x]` > `input.task-list-item-checkbox[type=checkbox]` | 33550-33565 |
| `$x$`, `$$x$$` (inline), `\$` | inline `math` before `text`; opening `$` not followed by space/tab; closing `$` not preceded by space/tab and **not followed by a digit** | `inlineMath` | `span.math.math-inline` / `span.math.math-block` containing the TeX as text | 33566-33612 |
| `$$` block | block `math` before `fencedCode`, interrupts paragraphs/lists/quotes | `math` | `div.math.math-block` | 33613-33666 |
| `[^id]`, `[^id]: ...`, `^[inline]` | `inlineNote` + `footnoteCall` before `reference`; block `footnoteDefinition` before `definition` (indent-continued lines); regular reference/definition tokenizers wrapped so `[^` is not a link reference | `footnote`, `footnoteReference`, `footnoteDefinition` | see section 7 | 33667-33791 |
| single newline | `break` tokenizer replaced: when `breaks` is on, a bare newline -> `break` | `break` | `<br>` | 33793-33807 |
| `---\nyaml\n---` at file start | block `frontmatter` (`onlyAtStart`) unshifted first | `yaml` | `pre.frontmatter > code.language-yaml` (then hidden) | 33808-33820, 34116-34121 |
| `^block-id` | inline `blockid` before `text` (needs whitespace before `^`); block `blockid` before `paragraph` (standalone line). Transformer moves the id to the previous top-level node / owning list item; handler renders nothing | `blockid` -> node `.id` | none | 33821-33846, 33998-34035 |
| `[x](relative.md)` | transformer: a `link` whose URL is relative (`./`, `../`, or no `:`) becomes `ilink` (`converted: true`) | `ilink` | `a.internal-link` | 28932, 33847-33872 |
| `![x](relative.png)` | same for `image` -> `iembed` | `iembed` | `span.internal-embed` | 33873-33890 |
| `![alt|300x200](url)` | transformer on `image`: trailing `|WxH` or `|W` in alt -> `width`/`height` attrs | | `img[width][height]` | 33425-33433, 33970-33981 |
| `![[img.png|alt|300x200]]` | transformer on `iembed`: last `|` segment parsed as size, remainder becomes alt; alt defaults to href | | `span.internal-embed[width][height][alt]` | 33982-33997 |
| headings | transformer: `data-heading` = trimmed source text of the heading content | | `h2[data-heading]` | 34036-34042 |
| `> [!type|meta]+ Title` | patched blockquote tokenizer (`^\[!([^\]]+)\]([+\-]?)(?:\s|$)`, only on line 0) + transformer + 3 handlers | `callout`, `callout-title`, `callout-content` | see section 8 | 9431-9447, 34043-34099 |
| external `<a>` | hast transformer on `a` **without a class**: `class=external-link`, `target=_blank`, `rel="noopener nofollow"`, `aria-label=href` when text differs | | | 34100-34115 |
| `%%comment%%` | inline `comment` before `text` (single line, `^%%(.*?)%%`); block `comment` before `fencedCode` (multi-line, may be unterminated -> to EOF); handler returns `null` | `comment` (children still tokenized) | nothing | 34122-34169 |

Standard GFM from remark itself: tables, `~~strike~~` (`delete`), autolinks/URLs, fenced code
(`pre > code.language-<info>`), raw HTML (block and inline).

**[I]** Because comment children are tokenized and the worker's metadata walk (`worker.js:12043-12150`)
visits all `ilink`/`iembed`/`tag` nodes regardless of ancestors, links and tags inside `%%...%%` are
indexed even though they are not rendered. Verify with a runtime probe.

**[O]** `("0" + o).substring(1)` (`app.js:33508`) copies the link text before use. **[I]** This forces
a fresh, flat string so link metadata does not keep the whole document alive as a V8 sliced string.

### 2. Splitting into sections

`ZW(text)` (`app.js:72501-72517`) and its worker twin `Ar` (`worker.js`) **[O]**:

1. Parse the whole document (`cm`), collect link reference definitions over the **whole tree**
   (`mdast-util-definitions`, `km`) so reference links work across sections, read frontmatter (`dm`).
2. For every **top-level child** of `root`: tag every `checklist`, `listItem` and `code` node inside
   it with `data-line` = its start line **relative to the section's first line**.
3. Temporarily make `root.children = [child]` and serialise with `fm(root, {definitions})`.
4. Emit `{html, pos: {start, end} (0-based line/col/offset), level}`, where `level` = heading depth
   for headings, else **7**.
5. Return `{sections, frontmatter}`.

Footnote definitions are gathered by a transformer at parse time and appended as **one synthetic
`section.footnotes` element at the end of the root** (preceded by a newline-only `text` node, which
becomes its own small section), so footnotes always become the last section **[O]** (`app.js:33898-33969`).

The parse is **always a full re-parse** of the whole text **[O]**. There is no incremental parsing;
incrementality comes from diffing the HTML (next section).

### 3. Section diffing and DOM reuse (`parseFinish`, `app.js:73057-73104`) **[O]**

* All existing sections except header/footer get `used = false` and go into a multimap `Wb`
  (`Map<string, T[]>`, `app.js:36426`) **keyed by their HTML string**.
* For each new section, the first unused old section with **identical HTML** is reused (its element,
  measured height and render state are kept); otherwise a new `MarkdownPreviewSection` is created.
  Positions are then refreshed: `start`, `end`, `level`, and `lines` = next section's start line
  minus this one's (the first section starts at line 0, the last one ends at `end.line + 1`).
* Frontmatter: if `JSON.stringify(old) === JSON.stringify(new)`, sections flagged
  `usesFrontMatter` are emptied and re-rendered **[O]** (`app.js:73082-73085`). **[I]** The
  comparison looks inverted (the intent would be "frontmatter changed"); in practice nothing in core
  sets `usesFrontMatter`, it is copied from the post-processor context object (`app.js:74371`).
* `cssclasses` from frontmatter are applied to the preview element (`wm`, `app.js:34262-34270`).
* Old sections that were rendered but not reused go into `recycledSections`. During the next render
  pass, **recyclers** get those sections and transplant expensive DOM into matching placeholders in
  the new sections **[O]**:

| Recycler | Matches on | Lines |
|---|---|---|
| Mermaid | `code.language-mermaid` source text == `.mermaid` source (WeakMap `Bj`) | 73885-73890 |
| Prism | same `language-*` class + same source on `code.is-loaded` | 73959-73965 |
| MathJax | same TeX + same block/inline on `.math.is-loaded` | 74003-74008 |
| Embeds | `.internal-embed.is-loaded` with equal `src`, `width`, `height`, `alt` | 74009-74023 |
| Images | loaded `<img>` with the same `src` (copies new width/height/alt) | 74080-74088 |

So editing one paragraph of a long note re-serialises everything (cheap strings) but rebuilds the DOM
of only the changed section, and even then reuses rendered diagrams, math and embeds.

**Checkbox toggle fast path [O]** (`app.js:74315-74342`): clicking a task checkbox reads
`data-line`, adds the section's start line, flips the `[ ]`/`[x]` character in the raw text
(`toggleCheckbox`), **rewrites the cached section HTML with a regex** so that the next diff finds
an identical string and reuses the section, patches the live DOM (`checked`, `data-task`,
`is-checked`) on the next tick, calls `navigator.vibrate(100)`, then `edit(newText)` (sets the
renderer text and saves the view).

### 4. Parse scheduling and the worker

* `set(text)` stores text and calls `queueRender()` **[O]**. `queueRender` uses `SC(fn, delay)`
  (`app.js:37677`): delay 0 -> `requestAnimationFrame` ("high" priority); delay > 0 ->
  `requestIdleCallback` with a timeout. While a worker parse is running the delay is 200 ms; a
  pending low-priority render is upgraded to rAF once parsing ends **[O]** (`app.js:73002-73011`).
* `onRender` returns early unless the preview element is laid out (`offsetParent` set and
  `offsetWidth > 0`) **[O]**, so hidden tabs do no work; `onNodeInserted` re-queues when it is shown.
* If `text !== lastText`: texts shorter than **10 240 chars** are parsed synchronously; longer
  ones go to the worker (`asyncParse` flag) **[O]** (`app.js:73111`).
* Worker **[O]**: one global client `Pj` (`Ej`) for the whole app, loaded from `worker.js`
  (`Sj`: `new Worker(url)`, falling back to fetching the script and starting it from a Blob URL when
  cross-origin or when the constructor throws). `submit` refuses while a request is in flight, so
  `parseAsync` waits for the previous promise and then posts `{parseSections: text, options:
  om.globalOptions}`. The worker replies with the same `{sections, frontmatter}` shape. On error it
  logs, falls back to `parseSync`, and re-queues. The scroll position is saved and restored around
  `parseFinish`.

### 5. Render loop, time slicing and virtualisation

**Render pass** (`onRender`, `app.js:73105-73165`) **[O]**:

1. For each unrendered section, in order:
   * `section.render()`: `sanitizeHTMLToDom(html)`, append to the section `div`, add class
     `el-<tag>` from the first child (`el-p`, `el-h2`, `el-pre`, `el-div`, ...), which is the hook
     themes use (`app.js:72796-72805`).
   * Run all **recyclers** against `recycledSections`.
   * Prepend `span.heading-collapse-indicator.collapse-indicator.collapse-icon` (icon
     `right-triangle`) to a heading that is the first child, and `span.list-collapse-indicator` to
     every `li` that contains a nested list.
   * `listBullet` flag: every `ul > li` gets a prepended `span.list-bullet` and the `ul` gets
     `has-list-bullet` (themes draw bullets with it).
   * `owner.postProcess(section, promises, frontmatter)` (section 6). If promises were returned, the
     section joins `asyncSections`; when they settle, its measurement is reset and a render is
     queued.
   * **Time slicing**: every 10th rendered section, if more than **5 ms** have passed, stop and
     re-queue.
2. **Measuring**: unmeasured rendered sections are attached temporarily (at most **100** per
   pass) and measured as `nextSibling.offsetTop - el.offsetTop` (`measureSection`, `app.js:73300`).
3. `updateShownSections`: walk sections keeping a level threshold (initially 7). A collapsed heading
   of level L hides every following section whose level is greater than L, up to the next heading
   with level <= L **[O]** (`app.js:73171-73176`).
4. `updateVirtualDisplay`, then either re-queue (work left) or, when `lastText === text` and no
   async sections remain, run `onRendered` callbacks, `owner.onRenderComplete()`, and
   `cleanupParentComponents()` (unloads `MarkdownRenderChild`s whose `containerEl` is no longer in
   this preview).

So **every section is eventually rendered** (needed for find-in-page and footnote jumps); only DOM
attachment is virtualised.

**Virtual display** (`app.js:73177-73247`) **[O]**:

* DOM layout: `div.markdown-preview-view.markdown-rendered` (scroller) > `div.markdown-preview-sizer.markdown-preview-section`
  > [`div.markdown-preview-pusher` (1 px x 0.1 px), header section, content section divs, footer section].
* Window = `[scrollTop - extra, scrollTop + clientHeight + extra]`, `extra = max(clientHeight *
  renderExtra (1), renderExtraMinPx (500))`.
* Height estimate for unmeasured sections = **average height of measured sections**.
* Sections inside the window (plus the sections holding the current text selection's start and end,
  so a selection survives scrolling) are attached with `setChildrenInPlace`; the rest are detached.
  The pusher's `margin-bottom` equals the summed height above the first attached section, and the
  sizer's `min-height` equals the total estimated height, so the scrollbar is correct.
* `onScroll` re-runs the window only when scroll moved more than half of `extra`. On iOS, scrollTop
  is not forced back if the user scrolled within the last 100 ms.
* `onResize` (called by the owning view): bottom padding of half the viewport (`addBottomPadding`,
  Reading view only); if the width changed, every measurement is reset and a render is queued.
* Find-in-page (`$W`, `app.js:72355-72500`): case-insensitive substring search over the
  concatenated text nodes of each section; matches are stored as `highlightRanges`, and
  `renderHighlights` draws absolutely positioned `div`s inside a `div.search-highlight` overlay from
  `Range.getClientRects()`. The text DOM is never wrapped or mutated.

### 6. Post-processor pipeline and `MarkdownPostProcessorContext`

**Registry** (statics on `Lj`, `app.js:73659-73776`) **[O]**:

* `postProcessors[]`: each function gets a `sortOrder` property; the array is re-sorted (ascending,
  default 0) on every registration.
* `codeBlockPostProcessors{lang: handler}`: throws if a language is already registered.
* `recyclers[]`.
* `Plugin.registerMarkdownPostProcessor(fn, sortOrder)` -> `Lj.registerPostProcessor`, triggers
  workspace event **`post-processor-change`**, and unregisters on unload (`app.js:109013-109022`).
  Every `MarkdownPreviewView` listens and calls `rerender(true)`, which empties all section DOM
  **[O]** (`app.js:74613`).
* `Plugin.registerMarkdownCodeBlockProcessor(lang, handler, sortOrder)` registers **both** a wrapper
  post-processor (`createCodeBlockPostProcessor`) and the raw handler in `codeBlockPostProcessors`
  (`app.js:109023-109034`). The raw map is used by Live Preview, which calls handlers directly
  (`app.js:112240-112290`); `canRenderLang` = `mermaid`, `query`, or a registered language.

**Code block wrapper** (`app.js:73684-73699`) **[O]**: finds `code.language-<lang>`, gets its source
(text with the final newline stripped, cached in WeakMap `Bj`), replaces the parent `pre` with
`div.block-language-<lang>`, sets `ctx.replaceCode(newCode)` (rewrites only the code body inside the
section's source lines via `getSectionInfo` + `data-line`, then `ctx.replace`), calls
`handler(source, el, ctx)`, and collects a returned promise. **[I]** `replaceCode` is assigned onto
the **shared** context object, so with two blocks of the same language in one section (e.g. both
inside one list), a processor that keeps `ctx` and calls `replaceCode` later would edit the last
block.

**Context object** built per section by `MarkdownRenderer.prototype.postProcess` (`app.js:74343-74372`) **[O]**:

| Field | Value |
|---|---|
| `docId` | random 16-char id per `MarkdownRenderer` instance (also suffixes footnote ids) |
| `sourcePath` | file path |
| `frontmatter` | parsed frontmatter |
| `promises` | array the pipeline awaits |
| `addChild(c)` | `renderer.addChild` (lifecycle tied to the view) |
| `getSectionInfo(el)` | `{text: full source text, lineStart, lineEnd}` of the section holding `el`, or `null` if `el` belongs to a nested preview |
| `replace(text, reparse)` | replaces the section's source range; if `reparse` and the result is one section, its cached HTML is replaced right away |
| `containerEl` | the sizer element |
| `el` | the section element |
| `displayMode` | **not set** here (undefined) |

**Static pipeline** `MarkdownRenderer.postProcess(app, ctx)` (`app.js:74393-74409`) **[O]**, run for
each section and by every non-incremental render path:

1. `code.language-query` blocks -> embedded live search results (`Zj` -> `tU`): uses the search
   engine, and blanks out the query block in its own file so it does not match itself.
2. Every entry of `Lj.postProcessors` in sort order; a returned thenable is pushed to `promises`.
3. Every `.internal-embed:not(.is-loaded)` -> `EmbedLoader.load({app, linktext: src, sourcePath,
   containerEl, displayMode: ctx.displayMode, showInline: true, depth: o2(ctx.containerEl)})`;
   `addChild(embed)`; `promises.push(embed.loadFile())`.
4. Then (instance path only) `resolveLinks(section.el)` -> toggles `a.internal-link.is-unresolved`
   using `metadataCache.isUnresolved`. It is re-run for all rendered sections, debounced 500 ms, on
   vault `modify`/`delete` and metadataCache `changed`.

**Built-in post-processors, in registration order** (all sortOrder 0 except Prism) **[O]**:

| # | What | Lines |
|---|---|---|
| 1 | Hide `pre.frontmatter`; mark its section `mod-frontmatter mod-ui` (Properties UI lives in the header instead) | 73778-73782 |
| 2 | Suffix `data-footnote-id`/`id` and `a.footnote-link` hrefs with `-<docId>` | 73783-73793 |
| 3 | `button.copy-code-button` (lucide-copy) on every `pre > code`; copies cached source; shows a check icon in `--text-success` for 1 s | 73900-73932 |
| 4 | **Prism**, `sortOrder 100`: `code[class*="language-"]:not(.is-loaded)` -> `Prism.highlightElement`, removes `tabindex` from `pre`, adds `is-loaded` (runs after code-block processors have replaced their blocks) | 73933-73958 |
| 5 | **MathJax**: `.math:not(.is-loaded)` -> unescape `innerHTML`, `MathJax.tex2chtml(tex, {display})`; on error the TeX is shown as text; `is-loaded`; then `finishRenderMath()` | 73966-74002 |
| 6 | Images: YouTube/X URLs -> sandboxed iframe; other images get `referrerPolicy = "no-referrer"`; the section waits for image `load`/`error` so the measured height is right | 74024-74045 |
| 7 | Callouts: fold UI + icon resolution (section 8) | 74089-74142 |
| 8 | Tables: if a `table` is the only child of its section, set `overflow-x: auto` on the section and `dir` on every cell (detected text direction) | 74143-74155 |
| 9 | `dir="auto"` on headings, blockquotes, callout titles, and on `li`/`p` whose parent has no `dir` | 74156-74164 |
| 10 | Mermaid, **ungated** (registered at module load) | 90094-90098 |
| 11 | Mermaid, **gated** by vault trust (registered in `App.registerCommands` during init) | 145827-145842 |
| 12 | Desktop only: `fixFileLinks`: `file:///` src -> app resource URL; relative src on img/audio/video/source -> resolved vault resource path | 145844-145869 |

### 7. Footnotes **[O]** (`app.js:33891-33987`, `73783-73793`, `72952-72967`)

* Numbering follows **first reference order**. Repeated references get suffixes (`2-1`, `2-2`).
  Inline notes `^[...]` are numbered in the same sequence, with synthetic identifier `[inline<n>`.
* Reference: `sup.footnote-ref[data-footnote-id="fnref-N"]` > `a.footnote-link[href="#fn-N"][data-footref=id]` with text `[N]`.
* Footer: `section.footnotes` > `hr` + `ol` > `li[data-footnote-id="fn-N"]` holding the definition
  plus one `a.footnote-backref.footnote-link` (`↩︎`) per reference.
* A reference without a definition becomes plain text of its identifier (the code sets
  `value = identifier`).
* Click on a footnote link: find the target `[data-footnote-id=...]` in any section, un-collapse
  its heading if needed, scroll to it (`scrollIntoView({block: "center"})`), and flash it
  (`is-flashing` for 3 s). Hovering a footnote link fires `hover-link` with linktext `#[^id]`.

### 8. Callouts

**Syntax [O]** (`app.js:9431-9447`): only on the blockquote's first line,
`[!type|metadata]` followed by optional `+` or `-`, then whitespace or end of line. `type` is
trimmed, lowercased, and inner whitespace becomes `-`. The rest of that line is the title; content
starts after the first `break` in the title paragraph. With no title text, the title is generated
from the type: `-` -> space, first letter capitalised (`app.js:34090-34092`).

**HTML [O]** (`app.js:34044-34063`):
`div.callout[data-callout=type][data-callout-fold=+|-][data-callout-metadata=meta]`
> `div.callout-title` > (`div.callout-icon`, `div.callout-title-inner`) and `div.callout-content`.
The handler also supports `n.color` (3- or 6-digit hex -> inline `--callout-color`) and `n.icon`
(`data-callout-icon`), but **no producer of those fields was found** in the bundle **[U]**.

**Post-processing [O]** (`app.js:74089-74142`):
* Fold `+` / `-` adds `is-collapsible` and `div.callout-fold` (icon `lucide-chevron-down`).
  Clicking the title toggles, deferred with `setTimeout 0` so that links inside the title can call
  `preventDefault` first. `-` starts collapsed. Height is animated by `Xw`.
* Icon: `data-callout-icon`, else the **computed CSS custom property `--callout-icon`**. The value
  may be quoted, may be raw `<svg ...>` markup (sanitised, forced to 16x16, `currentColor`), or a
  Lucide icon id passed to `setIcon`. If the element is not shown yet (so the CSS variable cannot be
  read), resolution waits for `onNodeInserted`.

**Built-in types and aliases [O]** (`app.css:11637-11707`); colours come from theme tokens
(`app.css:2142-2155`):

| Types | `--callout-color` | `--callout-icon` |
|---|---|---|
| (default, unknown types) | `--callout-default` = blue | `lucide-pencil` |
| abstract, summary, tldr | `--callout-summary` = cyan | `lucide-clipboard-list` |
| info | `--callout-info` = blue | `lucide-info` |
| todo | `--callout-todo` = blue | `lucide-check-circle-2` |
| important | `--callout-important` = cyan | `lucide-flame` |
| tip, hint | `--callout-tip` = cyan | `lucide-flame` |
| success, check, done | `--callout-success` = green | `lucide-check` |
| question, help, faq | `--callout-question` = orange | `help-circle` |
| warning, caution, attention | `--callout-warning` = orange | `lucide-alert-triangle` |
| failure, fail, missing | `--callout-fail` = red | `lucide-x` |
| danger, error | `--callout-error` = red | `lucide-zap` |
| bug | `--callout-bug` = red | `lucide-bug` |
| example | `--callout-example` = purple | `lucide-list` |
| quote, cite | `--callout-quote` = `#9e9e9e` | `quote-glyph` |

Styling tokens **[O]**: `--callout-border-width` (0), `--callout-border-opacity` (0.25),
`--callout-padding`, `--callout-radius`, `--callout-blend-mode`, `--callout-title-color`,
`--callout-title-padding`, `--callout-title-size`, `--callout-title-weight`,
`--callout-content-padding`, `--callout-content-background`. 1.14 builds callout colours with
`color-mix(in oklch, var(--callout-color) 10%, transparent)` for the background (`app.css:11709-11719`).
The Live Preview "callout type" menu offers info, important, tip, success, question, warning,
example, quote, "Other...", and "None"; its suggestion list adds the aliases (`app.js:111719-111728`).

Highlight colour tokens **[O]**: `--highlight-opacity: 30%` and
`--highlight-background-{red,orange,yellow,green,blue,purple}` =
`color-mix(in oklch, var(--color-X) var(--highlight-opacity), transparent)`, applied through
`.markdown-rendered mark[data-highlight=...]` (`app.css:2372-2379`, `14563+`).

### 9. Sanitisation **[O]**

* `sanitizeHTMLToDom(html) = document.importNode(DOMPurify.sanitize(html, cfg), true)`
  (`app.js:37511-37513`), with `cfg` =
  `{ALLOW_UNKNOWN_PROTOCOLS: true, RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ["style"],
  ADD_TAGS: ["iframe"], ADD_ATTR: ["frameborder", "allowfullscreen", "allow", "sandbox",
  "data-tooltip-position"], FORBID_ATTR: ["data-background-iframe"]}` (`app.js:37503-37510`).
  `DOMPurify` is also exposed as `window.DOMPurify` (`app.js:37499`).
* Hooks (`afterSanitizeAttributes`):
  * every `<a>`: `target="_blank"`, plus `rel="noopener nofollow"` if no `rel` is set (`app.js:37500-37502`);
  * every `<iframe>` (module-level code beside the App class, `app.js:144669-144671`): keep only
    whitelisted `sandbox` tokens (allow-forms, allow-modals, allow-popups, allow-presentation,
    allow-same-origin, allow-scripts), or, when missing, set the default sandbox
    `allow-forms allow-presentation allow-same-origin allow-scripts allow-modals`; filter `allow` to a whitelist (encrypted-media,
    fullscreen, gamepad, hid, idle-detection, oversized-images, picture-in-picture, sync-xhr)
    (`app.js:144650-144668`).
  * Publish adds its own `rel`/sandbox hook (`app.js:90130-90145`).
* Effect: raw HTML in notes is allowed except `<style>` elements, scripts, and event-handler
  attributes. Unknown URL schemes are allowed (needed for `obsidian://` and `app://`).
* Other sanitiser users: callout SVG icons, Mermaid results go through `innerHTML` **without**
  DOMPurify (Mermaid's own `securityLevel: "strict"` handling applies) **[O]** (`app.js:73815`), the
  web viewer's Readability output, and HTML paste.

### 10. Embeds

**Registry `app.embedRegistry` (`p2`, `app.js:99046-99096`) [O]**: `embedByExtension{ext:
creator}`; `registerExtension(ext, creator)` throws on duplicates; `registerExtensions`,
`unregisterExtension(s)`, `isExtensionRegistered`, `getEmbedCreator(file)` (by `file.extension`).
Built-ins (extension lists at `app.js:43276`):

| Extensions | Creator |
|---|---|
| `md` | `displayMode ? Jj (static) : f2 (editable embed)` |
| bmp png jpg jpeg gif svg webp avif | `s2` image -> `<img>` with alt/width/height copied from the `span.internal-embed` (5 s load timeout) |
| mp3 wav m4a 3gp flac ogg oga opus | `l2` audio -> `<audio controls controlsList=nodownload>` |
| mp4 webm ogv mov mkv | `c2` video -> `<video controls preload=metadata>` |
| pdf | `$0` -> embedded PDF.js viewer, `#height=N` subpath option, `initDelay: 300`, reloads on modify |
| `canvas` (Canvas core plugin) | `cte` (`app.js:126833`) |
| `base` (Bases core plugin) | `k1`, `#view` subpath (`app.js:119719`) |

**Loader `d2.load(ctx)` (`app.js:99096-99114`) [O]**: `ctx = {app, linktext, sourcePath,
containerEl, displayMode?, showInline?, depth, state?}`. It increments `ctx.depth`, empties the
container, splits linktext into path and subpath, resolves the file with
`metadataCache.getFirstLinkpathDest`; if the extension is registered **and depth <= 5** the
creator is used, otherwise `u2` (generic "file" box with icon and name, click opens). Unresolved
targets get `h2`: "not created yet" for creatable types (click creates/opens), "attachment missing"
otherwise; it watches vault `create`/`rename` (debounced 500 ms) and swaps in the real embed when the
file appears. The container gets `is-loaded`; its depth is stored in a WeakMap (`r2`) and
`o2(el)` finds the depth by walking up ancestors. **[I]** This depth cap is the only recursion guard
(self-embeds stop at depth 5).

**Note transclusion `![[note#Heading]]` [O]**:
* `resolveSubpath(cache, subpath)` (`$m`, `app.js:34594-34660`):
  * `#^id` -> block (case-insensitive) plus the owning list item, if any;
  * `#[^id]` -> footnote;
  * otherwise a heading **path** `#A#B#C`: walks `cache.headings`, matching each segment in turn at
    a deeper level (comparison via `stripHeading`, which replaces punctuation with spaces and
    collapses whitespace, case-insensitive); the range ends at the next heading of the same or
    higher level.
* `Zm` (`app.js:34661-34724`) slices `{before, after, heading, indent, content}`: a list-item block
  takes the item plus all its descendants and de-indents them (tabs count as 4); a heading section
  can leave the heading line out (shown as the embed's inline title, rendered markdown); a footnote
  drops the `[^id]: ` prefix and de-indents continuation lines.
* Missing subpath -> renders `##### Unable to find section ...`; a missing footnote shows a
  clickable "missing footnote" box that appends `[^id]: ` to the file.
* `f2` (editable embed, based on `E0`): has its own `C0` preview mode, which is a full
  `MarkdownRenderer` with its own `MarkdownPreviewRenderer`, so nested embeds are incremental and
  virtualised too. Edits made in the embed are written back as `before + heading +
  indent(content) + after`, saved with debounce 2 s (or immediately), and broadcast through the
  `quick-preview` workspace event. If the file changed while the embed was dirty, the changes are
  three-way merged with diff-match-patch (`e2`, `app.js:98757-98762`) and a "file changed" notice is
  shown. It has an "open link" button (`lucide-maximize-2`), an inline title editable for whole-file
  embeds (renames the file), and a Properties editor; properties fold state is shared via
  `f2.collapseProperties` and persisted in local storage by Page Preview.
* `Jj` (static, `app.js:74487-74558`) is used when `displayMode` is true: `MarkdownRenderer.render`
  with an app, PDF export, Live Preview code-block embeds. It renders the sliced text in one shot,
  then calls `postProcess` with `displayMode: true`.
* **Observed consequence**: the Reading view's own context omits `displayMode`, so **note embeds in
  Reading view are editable `f2` embeds, not static ones** (`app.js:74343-74370` + `99051`).

**External media [O]** (`app.js:72670-72721`): an `<img>` whose src matches YouTube (`mj`) becomes
an iframe to `youtube-nocookie.com/embed/<id>` (or `releases.obsidian.md/youtube?v=` when the page
is not https inside the Obsidian user agent); X/Twitter status URLs become
`platform.twitter.com/embed/Tweet.html?dnt=true&theme=<light|dark>&id=`. The iframe has class
`external-embed mod-receives-events`, a fixed sandbox string, `allow=fullscreen`,
`referrerpolicy=strict-origin-when-cross-origin`. Tweet height follows `twttr.private.resize`
postMessages, capped at 1000 px; one `message` listener per window routes messages to the source
iframe as a `framemessage` CustomEvent.

**Image click [O]**: `img` click/contextmenu inside the preview (not handled elsewhere) opens the
media lightbox `qF` with every image in the document, starting at the clicked one
(`app.js:72902-72919`).

### 11. Math, Mermaid, Prism (lazy libraries)

All are loaded by `yE(url, {before, after, type})` (`app.js:38233`): a lazy script tag whose
`.promise` loads once and `.then(cb)` runs **synchronously if already loaded** (otherwise it reads
`.promise`, which starts the load).

* **MathJax** (`app.js:72598-72668`) **[O]**: `lib/mathjax/obsidian-mathjax.js`. `before` sets
  `window.MathJax`: loader paths `mathjax-tex` -> `/lib/mathjax/tex-font`, mhchem font extension;
  output font `mathjax-tex`; TeX packages added to the defaults: action, amscd, bbox, boldsymbol,
  braket, bussproofs, cancel, cases, centernot, color, colortbl, empheq, enclose, extpfeil, gensymb,
  html, mathtools, mhchem, noerrors, tagformat, textcomp, unicode, upgreek, verb; macros
  `\RequirePackage` / `\usepackage` -> `\require{#1}`; **empty `inlineMath`/`displayMath`**
  (Obsidian finds math itself), `processEscapes/Environments/Refs: false`, `startup.typeset:
  false`, menu disabled, enrichment/explorer only when `window.publish`, `safeProtocols` http/https/
  file allowed and javascript/data blocked. It removes `MathJax-Menu-Settings` from localStorage.
  `renderMath(tex, display) = MathJax.tex2chtml(tex, {display})`. `finishRenderMath()` is debounced
  100 ms: it (re)attaches `MathJax.chtmlStylesheet()` to `document.head` and toggles a
  `data-change="1"/"2"` attribute **[I]** to force style recalculation.
* **Mermaid** (`app.js:72552-72569`, `73794-73899`) **[O]**: `mermaid.initialize({startOnLoad:
  false, securityLevel: "strict", themeVariables: {fontFamily: "var(--font-mermaid)"}, useMaxWidth
  false for flowchart/sequence/git/er and true for gantt/journey/class/state/pie, gantt
  axisFormatter weekly on Mondays})`. There is no light/dark theme switch in the config **[O]**;
  colours come from CSS. Rendering: offscreen hidden div in `document.body` sized to the parent
  width, `mermaid.render("m"+random16, src, div)`, then the SVG goes into a new `div.mermaid` that
  replaces the `pre`. Fix-ups: labels of nodes with class `internal-link` become
  `a.internal-link`; SVG `<a>` `href.baseVal` repaired; marker ids made unique per diagram, rewriting
  `marker-start`/`marker-end` and the embedded `<style>`. On error the code shows "Error parsing
  Mermaid diagram!" plus the message. A block is deferred to `onNodeInserted` only when neither the
  code element nor the container is shown (`isShown` = has an `offsetParent`) (`app.js:73857-73861`).
* **Mermaid vault trust (1.14) [O]**: per-vault localStorage key `<appId>-mermaid-vault-trust`
  (`v2`, `g2`, `m2`, `app.js:99484-99491`; `app.loadLocalStorage` prefixes the vault's appId,
  `app.js:146186`). When the vault is not trusted, `y2` shows `div.mermaid-wrapper.is-guarded` with
  "Display Mermaid diagrams in this vault?", "Only allow if you trust this vault's contents.", an
  **Allow** button, and the source. Setting: Editor > "Show Mermaid diagrams in notes"
  (`app.js:142828-142834`). Changing trust fires `post-processor-change`.
  **Ungated path.** Observed **[O]**: a Mermaid post-processor with no trust check is a top-level
  statement of the bundle (`app.js:90094-90098`, Publish region, same scope as `Lj`), so it is
  registered at bundle load; the gated one is added later in `App.registerCommands`
  (`app.js:145827-145842`). Both have sortOrder 0; both pipelines call every processor synchronously
  in array order (`app.js:74398`, `74451`). The ungated one calls `Fj` -> `rj.then`, which runs at
  once if Mermaid is loaded and otherwise starts loading `/lib/mermaid.min.js` (`app.js:38259-38260`).
  `Oj` captures the `pre`, then calls `mermaid.render` into a hidden `div.mermaid` on `document.body`
  when the code or container is shown. The gated one, when untrusted, swaps the `pre` for the guard
  and never calls `Fj`. Inferred **[I]** (stable sort; Reading view's container is the visible
  sizer): for an untrusted vault in Reading view (and in embeds and hover popovers, same pipeline),
  `mermaid.render` **does run**, synchronously before the guard if Mermaid is already loaded,
  otherwise after the script loads. Its output is **not shown**: `Oj` puts the SVG into a detached
  `div` and calls `replaceWith` on a `pre` that has no parent, which is a DOM no-op. Live Preview
  calls only `y2` (`app.js:112239-112242`). **[I]** In trusted vaults both processors call `Fj`, so
  each diagram is rendered twice and one result is discarded.
  **Runtime pass** ([14](14-runtime-verification.md)):
  - **Untrusted vault, Reading view:** `mermaid.min.js` loaded and `mermaid.render` ran once on the diagram source
    in 6 of 7 opens across 4 cold starts. Only the guard was shown and no SVG was inserted.
  - **The exception:** one open in a brand-new tab after Mermaid was already loaded rendered nothing. The
    synchronous path defers through `onNodeInserted` and never fires, because the guard has replaced the `pre`.
    So the static "synchronously before the guard" wording is wrong for that case.
  - **Trusted vault, Reading view:** 2 renders per diagram.
  - **Live Preview:** 1 render when trusted, 0 renders plus the guard when untrusted.
* **Prism** (`app.js:72582-72596`) **[O]**: sets `window.Prism.manual = true` before load. Language
  aliases are Prism 1.30's own (`js`, `ts`, `py`, `sh`, `yml`, `md`, `html`, `xml`, `svg`, `rb`,
  `cs`, `dotnet`, `kt`, `rs`/`rust`, ...); Obsidian adds no alias table **[O]**. `mermaid` is also a
  Prism grammar (used by the trust-guard source view).
* `loadPdfJs` loads `/lib/pdfjs/pdf.min.mjs` as a module and sets the worker src (`app.js:72518-72550`).
  `/lib/codemirror/modes.min.js` (`ij`) is loaded for legacy CM5 modes **[O]**.

### 12. Links, hover and Page Preview

**Delegated DOM events** (`registerDomEvents`, `app.js:73700-73755`) **[O]** on the sizer, one listener per type:
* `a.internal-link`: click/auxclick (buttons 0/1) -> `openLinkText(href, sourcePath,
  isModEvent(e))`; dragstart -> `dragManager.dragLink`; contextmenu -> menu with "Copy" plus
  `workspace.handleLinkContextMenu`; mouseover -> `hover-link` event `{source: "preview",
  hoverParent, targetEl, linktext, sourcePath}`.
* `a.footnote-link` mouseover -> `hover-link` with `#[^id]`.
* `a.external-link`: click validates the URL (`QC`) and opens it with `window.open(url,
  target-from-modifier)`, otherwise shows a "failed to open" notice; contextmenu -> external link
  menu.
* `a.tag` click -> global search `tag:#tag`.
* `belongsToMe(el)` walks up and stops at a nested `.markdown-preview-view` or `.bases-view`, so a
  nested embed's own renderer handles its own clicks.

**HoverPopover (`JZ`, `app.js:89299-89463`) [O]**:
* `new HoverPopover(parent, targetEl, waitTime = 300, staticPos)`; states Showing(0), Shown(1),
  Hiding(2), Hidden(3).
* Shows after `waitTime`; hiding after mouse-out also waits `waitTime`. A single global poller
  (every **500 ms**) checks `elementFromPoint` at the last mouse position for every open popover
  (catches missed mouseout); capturing window click/contextmenu closes popovers the click is not in.
* Nesting: `childHovers` = open popovers whose target lies inside this popover; a parent stays open
  while any child should show. One popover per `parent.hoverPopover`.
* Position: anchored to the target rect with a 10 px gap and overlap prevention; if the target is
  taller than **300 px**, anchored at the mouse point instead; RTL-aware; follows the target's window
  (popout windows); re-positions on content resize at most 10 times; fades in over 80 ms
  (`--anim-motion-swing`).
* `E1.create` (`app.js:94045-94118`) sleeps `waitTime - 100` ms, then embeds the target with
  `d2.load({..., depth: 0})`. For notes this is an editable `f2`: clicking inside (not on a
  button/input/collapse indicator) switches it to the CM6 editor at the click position, sets it as
  `workspace.activeEditor`, pushes a keymap scope, and adds `is-editing`. State `{mode: "source"}`
  opens directly in the editor.

**Page Preview core plugin (`tne`, `app.js:130837-130927`) [O]**:
* Listens to `hover-link`. Ignores touch-originated events (`qC`). Per-source option "require
  Mod": `plugin.options[source]` if set, else the source's `defaultMod`.
* Registered sources and defaults: `preview` (Reading view) **false**; `editor`, `search`,
  `tab-header` (`app.js:107470-107473`), `graph`, `file-explorer`, `outline`, `properties`, `bases`,
  `bookmarks` are all **true**. Plugins add sources with `registerHoverLinkSource`.
* If Mod is required and not held, it arms temporary listeners: pressing Mod while still on the link
  opens the preview; an arrow key or printable key, mouse leaving the target or the document, a
  click, or **2 s without mouse movement** (debounced from the first move) disarms.
* `onLinkHover` skips if the same target already has a visible popover; persists
  `page-preview-unfold-properties` in local storage.

### 13. Reading view (`MarkdownPreviewView`, `eU`, `app.js:74559-74804`) **[O]**

* Container `div.markdown-reading-view` inside the `MarkdownView`. The renderer gets a header
  section (inline title + Properties editor) and a footer section (backlinks), both marked
  `mod-header mod-ui` / `mod-footer mod-ui` with `html = null`.
* Vault config keys it reacts to (`config-changed`): `readableLineLength`
  (`is-readable-line-width`), `foldHeading` (`allow-fold-headings`), `foldIndent`
  (`allow-fold-lists`), `showIndentGuide` (`show-indentation-guide`), `rightToLeft` (`rtl`),
  `propertiesInDocument` (`show-properties` unless "hidden"), `strictLineBreaks` (parser `breaks`).
* Keys: Mod+A shows a notice explaining how to copy; Mod+C with **no selection copies the whole
  Markdown source**. On touch, a double tap with an empty selection toggles to edit mode (`pM`, 2 taps
  within 500 ms / 30 px).
* Ephemeral state: `scroll` (fractional line), `line` (scroll + flash), `match` (scroll to the
  first search match, centred, flashed), `propertyMatches`, `focus`, `focusMetadata`.
* `onScroll` -> `view.syncScroll()` (fires `markdown-scroll`, used by Outline and linked panes),
  suppressed within 100 ms after a render.
* `edit(text)`: `renderer.set`, `view.onInternalDataChange()`, `view.save()`.

**Scroll mapping [O]** (`getScroll` / `applyScroll`, `app.js:73440-73557`): position =
`line + fraction`. Walk sections summing measured heights (including `topSpace`); inside the section
under the scroll offset, interpolate linearly over `section.lines`, refined by the visible
`li[data-line]` elements (the last list item above the offset and the next one below give a local
pixels-per-line). `applyScroll` inverts this and supports `{highlight, center}`; it refuses until
all needed sections are measured, and `applyScrollDelayed` retries in `onRendered`. Switching modes
(`MarkdownView.setMode`, `app.js:114618-114645`) saves the fold info, takes the current mode's
fractional line, and applies it to the new mode, so Reading and Source views stay aligned.

**Fold state [O]**: `getFoldInfo()` returns `{folds: [{from, to}], lines}` for a collapsed Properties
block (line 0), collapsed headings, and collapsed list items (`data-line` ranges). It is saved via
`app.foldManager` (debounced 500 ms). `applyFoldInfo` is ignored when the line count differs.

### 14. Non-incremental render paths

| Path | What it does | Lines |
|---|---|---|
| `MarkdownRenderer.render(app, md, el, sourcePath, component)` | Whole text -> one sanitised fragment -> all post-processors with `displayMode: true`; embeds loaded **only if `app` and `component` are given**; returns a promise for all async work | 74413-74473 |
| `MarkdownRenderer.renderMarkdown(md, el, sourcePath, component)` | Legacy: calls `render(null, ...)`, so **no embeds** | 74410-74412 |
| (both) | If `component` is not a `Component`, sniffs `new Error().stack` for `plugin:<id>` and logs one error per plugin about memory leaks | 74414-74425 |
| Web viewer reader mode | Fetch `/lib/readability.js`, inject into the webview with `executeJavaScript`, run `new Readability(document.cloneNode(true)).parse()` in the page, sanitise `content`, Turndown -> Markdown, render with a new `MarkdownPreviewRenderer`; the same Markdown + title is used to save the page to the vault | 111111-111147 |
| Publish site | `tJ`/`nJ` reuse `Lj` and `Lj.postProcessors`, depth-capped (5) embeds from the site cache | 89471-89825 |
| PDF export, Slides | sections 16, 17 | |

### 15. HTML -> Markdown (`htmlToMarkdown` = Turndown) **[O]** (`app.js:61789-61883`)

* Options: `headingStyle: "atx"`, `hr: "---"`, `bulletListMarker: "-"`, `codeBlockStyle:
  "fenced"`, `fence: "```"`, `linkStyle: "inlined"`; `script`, `style`, `title` removed;
  **escaping disabled** (`escape = identity`).
* Custom rules: `del`/`s` -> `~~`; `mark` -> `==`; links with spaces -> `%20` and `()` escaped,
  title quoted; images likewise (images without src are dropped); `div.highlight-(text|source)-<lang> > pre`
  -> fenced block with that language; `li` with 4-space continuation indent and correct `ol start`
  numbering; checkbox inside `li` -> `[x] ` / `[ ] `; full GFM table conversion (header detection,
  `align` -> `:--`/`--:`/`:-:`, colspan padding, `|` escaped, newlines in cells -> `<br>`, a blank
  header row is synthesised when missing).
* The reverse direction exists too **[O]**: copying from the editor puts
  `"<!-- obsidian -->" + mdastToHtml(parse(selection))` on the clipboard as `text/html`, so other
  apps get rich text (`app.js:75995`; `app.js:95425` caps it at 1 000 000 chars).
* Callers: editor paste/drop of `text/html` when the vault config `autoConvertHtml` is on (a
  `text/markdown` flavour wins; HTML carrying the `<!-- obsidian -->` marker is pasted as its plain
  text, so Obsidian-to-Obsidian copy round-trips exactly; `data:` images over 1000 chars are saved as "Pasted image" attachments and
  app-resource image URLs are turned back into vault links; `app.js:62268`, `62358-62420`); web
  viewer reader mode / save to vault (`app.js:111133`).
* **Defuddle** (`lib/defuddle.full.js`, v0.19.2): **no reference** in `app.js`, `main.js`,
  `worker.js`, other bundles or HTML **[O]**. Its use is **[U]**: possibly loaded by a future or
  server-flagged web-viewer code path, or by the Web Clipper.

### 16. Export to PDF (`F8`, `app.js:114895-115115`) **[O]**

* Command `workspace:export-pdf` (only when `Platform.canExportPdf`) and a file-menu item ->
  modal. Saved in vault config `pdfExportSettings` = `{includeName, pageSize: A3|A4|A5|Legal|Letter|Tabloid,
  landscape, margin: "0" default | "1" none | "2" minimal, downscalePercent: 10-100}`.
* Flow: Electron save dialog -> hidden popup window (`window.open("about:blank", "_blank",
  "popup,hide=true")`) with a `<base>` tag and the app's CSS copied over -> wait 200 ms -> force
  `theme-light` -> `div.print` > `div.markdown-preview-view.markdown-rendered` (rtl /
  show-properties classes, optional `<h1>` file name) -> whole note parsed once; **each top-level
  element is wrapped in its own `div` except `<hr>`** (**[I]** so `hr` can act as a page-break hook
  in print CSS) -> `cssclasses` applied -> post-processors with `displayMode: true` awaited ->
  internal link `href`s removed -> 200 ms -> IPC `print-to-pdf` -> main process
  `webContents.printToPDF(options)` + write file + open it (`main.js:5040-5052`).
* Options sent: `pageSize`, `landscape`, `marginsType`, plus `margins = 0` for both "none" (1) and
  "minimal" (2) **[O]**, `scale = clamp(percent / 100, 0.1, 2)`. **[I]** "Minimal" and "None"
  therefore give the same margins under current Electron, where `margins` takes precedence.
* `testPrint` renders the same DOM into the main window for debugging.

### 17. Slides (core plugin `slides`, `app.js:135485-135620`) **[O]**

* Command `slides:start` and a file-menu item for `.md`. It splits the **top-level mdast children at
  every `thematicBreak` (`---`)**; each group is serialised with shared definitions into a
  `<section>` (sanitised); post-processors run once over all slides.
* reveal.js 4.3.1 from `/lib/reveal/reveal.js`, CSS `reveal.css` plus `white.css` for the light
  theme "moonstone", else `black.css`; `new Reveal(el, {embedded: true, keyboardCondition:
  "focused", controlsTutorial: false, overview: false})`. Escape or the close button tears down
  and removes the CSS.

---

## Data formats & on-disk files

| Item | Where | Shape |
|---|---|---|
| Worker request | postMessage | `{parseSections: string, options: {breaks, commonmark}}` |
| Worker response | postMessage | `{sections: [{html, pos: {start: {line, col, offset}, end}, level}], frontmatter}` (or `null` on exception) |
| Fold info | `app.foldManager` (see other workers) | `{folds: [{from, to}], lines}` |
| Scroll state | view ephemeral state | `scroll: number` (fractional 0-based line) |
| `pdfExportSettings` | vault config (`.obsidian/app.json`) | see section 16 |
| `strictLineBreaks`, `autoConvertHtml`, `foldHeading`, `foldIndent`, `showIndentGuide`, `rightToLeft`, `readableLineLength`, `propertiesInDocument` | vault config | booleans / `"visible"|"hidden"|"source"` |
| `<appId>-mermaid-vault-trust` | localStorage | `true` or absent |
| `<appId>-page-preview-unfold-properties` | localStorage | boolean |
| Page Preview options | core plugin data (`.obsidian/page-preview.json`, **[I]** usual core-plugin file) | `{<sourceId>: requireMod boolean}` |

DOM contract themes rely on **[O]**: `.markdown-rendered`, `.markdown-preview-view`,
`.markdown-preview-sizer`, `.markdown-preview-pusher`, section `div.el-<tag>`, `.mod-header`,
`.mod-footer`, `.mod-frontmatter`, `.internal-link(.is-unresolved)`, `.external-link`, `.tag`,
`.internal-embed(.is-loaded).(markdown-embed|image-embed|audio-embed|video-embed|pdf-embed|file-embed)`,
`.inline-embed`, `.markdown-embed-content`, `.markdown-embed-link`, `.callout*`, `.task-list-item`,
`.list-bullet`, `.collapse-indicator`, `.copy-code-button`, `.block-language-<lang>`, `.math(-inline|-block).is-loaded`,
`.mermaid`, `.footnotes`, `.footnote-ref`, `.footnote-link`, `.footnote-backref`, `.is-flashing`,
`.search-highlight`.

---

## Rebuild notes

**Essential ideas worth copying (design, not code):**

1. **One parser, two consumers.** Use the same Markdown AST for the metadata index (links, tags,
   headings, blocks, sections) and for rendering, and run it in a worker. A modern choice is
   micromark/mdast (remark 13+) or markdown-it with plugins; Obsidian's remark-8 tokenizer API is
   legacy. Keep extensions small and isolated, as Obsidian's are: inline tokenizers with a locator,
   block tokenizers with an "interrupts paragraph" flag, then AST transformers.
2. **Top-level block = section.** Serialise each top-level block to an HTML string together with
   its source line range and heading level. Diff by string equality; reuse DOM for identical
   strings. This gives most of the benefit of incremental rendering with a stateless, full-reparse
   parser. Add `data-line` (relative to the section) to list items, task boxes and code blocks so
   DOM clicks map back to source lines.
3. **Recyclers** for expensive widgets (diagrams, math, highlighted code, embeds, images): match on
   source text plus attributes and transplant the old DOM node. This is what keeps typing in the
   editor cheap while the Reading view is open in a split.
4. **Render everything progressively, attach only what is visible.** Time-sliced rendering
   (about 5 ms budget per slice) plus window-based attachment with estimated heights (average of
   measured sections), a spacer element, and a min-height sizer. Keep selection endpoints attached.
   Re-measure when width changes or async work (images, math) finishes.
5. **Scroll position = fractional source line.** Interpolate inside sections, refined by known
   anchors (list items). It makes mode switching, linked panes, search jumps and restore after reload
   trivial.
6. **Sanitise once at the boundary** (DOMPurify with an explicit allowlist for iframes and an
   attribute hook), then run trusted post-processors on the sanitised DOM. Never `innerHTML`
   third-party renderer output without either a sanitiser or a strict renderer mode.
7. **Embed registry by file extension** returning a component with `loadFile()`; carry
   `depth` in the context and cap it (Obsidian: 5). Store the depth on the container so nested
   renderers can find it by walking up.
8. **Hover previews** as a small state machine (showing/shown/hiding/hidden) with a delay, plus a
   slow global poll to catch missed mouse-out events, and nesting via "child popover inside my DOM".
9. **Lazy-load heavy libraries** (MathJax, Mermaid, Prism, PDF.js) on first use behind a promise
   that runs callbacks synchronously once loaded.

**Incidental / avoidable:**

* Two Mermaid post-processors (gated and ungated) can both run (untrusted: a hidden render; trusted:
  a double render); make trust gating the only path.
* Shared context mutation (`replaceCode` on a shared object): build a fresh context per code block.
* Inverted-looking frontmatter invalidation check; an undocumented `usesFrontMatter` flag.
* Full re-render on any plugin registration (`post-processor-change` -> `rerender(true)`).
* Reading view and editor duplicate a lot (Live Preview calls code-block handlers directly with its own
  context shape).
* **[I]** HTML-string diffing breaks reuse whenever the HTML contains position-dependent data (e.g.
  footnote numbers shift, so every section with a footnote ref is rebuilt when one is inserted earlier).

**For an app focused on graph visuals and accessibility (the user's project):**

* Keep the section model, but give each section a stable id (hash of source + index) and an ARIA
  structure (headings stay real `h1-h6`; callouts get `role="note"` or `region` with
  `aria-label` = title; fold toggles must be `button`s with `aria-expanded`; Obsidian uses
  `div`s with click handlers, `app.js:74100-74118`).
* **[I]** The virtualiser detaches off-screen sections, which hides them from screen-reader "browse"
  mode and from native browser find (Obsidian compensates with its own `$W` find). Prefer `content-visibility: auto` with `contain-intrinsic-size` (the
  browser keeps the DOM accessible and searchable) and use manual detaching only for very large notes.
* Emit `dir="auto"` like Obsidian does; respect `prefers-reduced-motion` for popover and fold animations.

---

## Open questions

1. ~~Ungated Mermaid execution in untrusted vaults~~ **Confirmed at runtime** (section 11 and
   [14](14-runtime-verification.md)): Mermaid parses and renders untrusted diagrams in Reading view, and the
   output is hidden, not prevented. Trusted vaults render each diagram twice.
2. **Defuddle use [U]**: shipped but unreferenced. Probe: watch the network/`executeJavaScript` calls
   of the web viewer ("Save to vault", reader mode) and check later versions' bundles.
3. **Callout `color`/`icon` fields [U]**: the to-hast handler supports them, but no parser path sets
   them. Possibly Canvas or Publish builds callout nodes directly; grep the publish server bundle or
   probe Canvas card rendering.
4. ~~Links inside `%%comments%%`~~ **Confirmed:** they are in `links`, `resolvedLinks` and backlinks
   ([14](14-runtime-verification.md)).
5. **Frontmatter invalidation condition [O/I]** (`app.js:73082-73085`): intended or a bug? Only
   matters for processors that set `ctx.usesFrontMatter`.
6. **`replaceCode` with several same-language blocks in one section [I]**: probe with two
   `dataviewjs`-style blocks inside one list item and a processor that calls `replaceCode` later.
7. **PDF "minimal" vs "none" margins [I]**: both send zero `margins`; confirm by exporting and
   measuring.
8. **remark-parse exact version [I]**: 8.x inferred from the API and options; confirm by diffing
   module 4967 against published remark-parse 8.0.3 sources.
9. **Unresolved footnote reference text [O]**: the code replaces it with the bare identifier; check
   whether `[^x]` without a definition really renders as `x` (expected `[^x]`).
10. **`quicklook.js`**: a separate macOS Quick Look renderer with its own parser copy (CSP
    `obsidian-preview:` scheme). Not pretty-printed or analysed here; worth one pass if a
    standalone "render a note without the app" mode matters.
