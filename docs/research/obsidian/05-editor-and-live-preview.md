# Editor & Live Preview (Obsidian 1.14.4)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian's editor is a **CodeMirror 6 `EditorView`** whose markdown "language" is **not a lezer grammar**: it is the
**CodeMirror 5 mode system** (a modified CM5 `markdown` mode wrapped by an in-bundle HyperMD-derived `hypermd` mode)
driven through **Obsidian's fork of `@codemirror/language`'s `StreamLanguage`**. The fork turns every CM5 token style
string (e.g. `"formatting formatting-header header header-1 line-HyperMD-header line-HyperMD-header-1"`) into a
dynamically-created lezer `NodeType` carrying the raw class string in `tokenClassNodeProp`, plus a line-spanning node
carrying `line-*` classes in `lineClassNodeProp`. Everything downstream — CSS styling (`.cm-header-1`,
`.HyperMD-list-line`), live preview hide/reveal, block widgets, folding, link/tag click detection, formatting toggles,
spellcheck suppression — works by **pattern-matching those class strings on the syntax tree**. Live preview is two
layers: a `ViewPlugin` that hides markdown syntax per "formatting group" unless a selection touches it (and snaps the
caret out of hidden ranges), and a `StateField` that replaces whole constructs (embeds, images, code blocks, math,
callouts, tables, HTML, `---`) with `WidgetType`s, revealing source when the selection enters the range (except tables
and images, which have their own interaction models: nested per-cell editors and an "image selection" mode). The
`Editor` public API is a CM5-shaped facade (`{line, ch}` positions) over CM6; vim is CM5's vim.js run against a
CM5-compat adapter (the `@replit/codemirror-vim` design). Saving is a 2-second *non-resetting* debounce into
`vault.modify`, with a diff-match-patch three-way merge when the file changes on disk while the buffer is dirty.

---

## Where it lives

| minified id | public / inferred name | role | lines (pretty/app.js) |
|---|---|---|---|
| export maps `e,t,i,r,o,a,s,l,c,h,p` | `@codemirror/state, view, @lezer/common, @lezer/highlight, @codemirror/language, commands, search, autocomplete, @lezer/lr, collab, lint` | CM6 packages bundled + exposed to plugins | 12346-12750 |
| `N3`, `V3` | plugin `require()` shim map | maps `"@codemirror/*"`, `"@lezer/*"`, legacy pre-1.0 CM6 package names to the bundled modules | 108898-108924 |
| `B3`, `fc.prototype.iterate` patch | compat shims | `PluginField` stub; warns when plugins use the old `tree.iterate(enter(type,from,to))` signature | 108878-108896 |
| `wp` | `StreamLanguage` (Obsidian fork) | CM5-mode→lezer-tree adapter | 28448-28531 |
| `mp` | `StringStream` (fork, adds `hideFirstChars`) | CM5 stream API | 28350-28437 |
| `Ep` | StreamLanguage `Parse` | incremental chunked tokenizer | 28557-28728 |
| `Ap`, `Pp`, `Ip` | node-type factory, `tokenClassNodeProp`, `lineClassNodeProp` | class-string → NodeType | 28739-28749 |
| `Lp`/`Op` | `lineHighlighter` | ViewPlugin turning node props into `cm-*` mark + line decorations | 28749-28802 |
| `Fp` | `ignoreSpellcheckToken` facet | token classes that get `spellcheck=false` | 28802 |
| `Hp`/`Vp` | `bidiIsolates` | RTL isolation plugin (upstream-like) | 28806-28880 |
| `P_ L_ F_ B_ V_ G_ $_ LG NG QG vG uG hG` | **second, upstream copy** of `@codemirror/language` (Language, LRLanguage, DocInput, ParseContext, IndentContext, StringStream, StreamLanguage parse, tag table resolver, TreeHighlighter, fold widgets, HighlightStyle) | used by the **Bases formula editor** (`yQ = L_.define(...)` 85431, `FX = hG.define(...)` 83937), *not* by markdown | 78668-79990 |
| `o_` + `window.CodeMirror.defineMode("hypermd")` | HyperMD-derived markdown mode | the real markdown tokenizer (wraps CM5 `markdown`) | 78192-78668 |
| `lib/codemirror/markdown.js` | modified CM5 markdown mode | base block/inline tokenizer, highlight colors | whole file |
| `Z1`, `J1` | `StreamLanguage.define(getMode("hypermd"))` full / reduced (no block syntax, for table cells) | languages | 94340-94352 |
| `e0`, `t0`, `G1` | base extension list + its compartment | shared editor setup | 94353-94416 |
| `T1`, `I1`, `L1`, `F1` | fold services (indent, heading, frontmatter), foldAll | folding | 94125-94213 |
| `gR` | **`Editor`** (public abstract) | CM5-style API + markdown list/heading helpers | 61527-61773 |
| `i0` | CM6 implementation of `Editor` | facade over `EditorView` | 94416-95212 |
| `o0` | editor component base ("MarkdownEditor") | owns `EditorView`, extensions, clipboard, clicks, context menu, table cells | 95212-96032 |
| `a0` | scrollable editor component | sizer/gutters, scroll sync, search panel, smart lists, folding UI | 96032-96212 |
| `u0` | table-cell editor component | nested `EditorView` per active table cell | 96220-96466 |
| `k0` | embed editor component | editor used by `E0` (optionally inside an iframe) | 96665-96740 |
| `C0` | embed reading-mode child | preview half of `E0` | 96740-96799 |
| `E0` | embedded markdown "editable embed" host | preview/source toggle for embeds, popovers, canvas | 96799-96913 |
| `f2` | file/section embed (`E0` subclass) | edits a heading/block/footnote section of a file in place | 99115-99484 |
| `P8` | `MarkdownView` edit mode | `a0` + ephemeral state, highlights, save triggers | 114213-114393 |
| `L8` | **`MarkdownView`** | the markdown leaf view; modes, view state, frontmatter, backlinks | 114393-114895 |
| `Q4` | **`TextFileView`** | save/load/merge machinery | 103729-103855 |
| `e2` | three-way merge (diff-match-patch) | external-change merge | 98757-98762 |
| `N8` | fold manager | per-note fold persistence in localStorage | 115188-115214 |
| `C8` | live-preview extension bundle | assembles LP plugins, keymaps, image selection | 113219-113323 |
| `f8` / `v8` / `g8` | LP tree-plugin base / inline hide-reveal (`buildDeco`) / task-line `data-task` | live preview inline layer | 112560-112745 |
| `m8` | LP block-widget `StateField` builder | embeds, images, math, code, callouts, tables, HTML, hr | 112746-113155 |
| `O5` | **`livePreviewState`** | ViewPlugin `{mousedown}` flag | 111728 |
| `U1` / `q1` / `W1` (`j1`) | **`editorLivePreviewField`** / **`editorEditorField`** / **`editorInfoField`** (`editorViewField`) | public state fields | 94258-94265 |
| `j5 _5 X5 Q5 $5 Z5` | quote-border, HR, task checkbox, highlight-color swatch, external-link icon, code-block flair widgets | small LP widgets | 111730-111897 |
| `e8` | image embed DOM builder (controls, resize corner, context menu) | images | 111919-112094 |
| `RW` / `BW` | embed widget base / embed widget with child components | widget infra | 70661-70764 |
| `n8 r8 o8 a8 s8 l8 u8 h8 d8` | external image, internal embed, rendered code block, rendered markdown, callout, math, HTML, empty spacer, image-reveal gap | LP block widgets | 112102-112560 |
| `UF`, `_F`, `jF`, `WF` | image selection controller, its field, image-reveal state field + effect | image UX | 61100-61340 |
| `oU`, `iU`, `rU` | table widget, table cell model, "internal table update" annotation | table editor | 74846-76325 |
| `aU` | table spacing transaction filter | keeps blank lines around tables | 76326-76370 |
| `uU` | ordered-list auto-renumber transaction filter | lists | 76385-76516 |
| `dU`/`fU` | hanging-indent (wrapped list line) plugin | lists | 76530-76677 |
| `OW` | indentation guides plugin | lists/quotes | 70564-70638 |
| `MW`, `TW`, `AW`, `DW` | fold indicator widget, its plugin, fold extension bundle, unfold-on-edit filter | folding | 70494-70563 |
| `yW`, `wW`, `CW` | cursor/selection layers (secondary-only) | multi-cursor drawing | 70432-70485 |
| `sW nW lW` | auto-pair brackets/markdown (copy of closeBrackets) | typing | 70288-70360 |
| `t_` (`e_`) | wrap-selection-with `= ~ $ %` input handler | typing | 77954-77972 |
| `$F`, `QF`, `cR` | `---`→properties trigger, frontmatter hide/guard field + filter | properties in LP | 61351-61520 |
| `LB`, `iE`/`rE` | per-line `dir` attribute plugin, strong-script direction regex | RTL | 65332-65368, 38083 |
| `OR`, `yR`, `SR`, `LR` | clipboard/drop manager, Turndown instance, HTML→MD, `<!-- obsidian -->` marker | paste/drop | 61789-62483 |
| `OB` | **`EditorSuggest`** | suggest base | 65370-65456 |
| `WB`, `jB` | link-suggest engine, `[[` suggest | link autocomplete | 65671-66105 |
| `GB` | tag suggest | `#` autocomplete | 66110-66151 |
| `i3`, `o3` | footnote `[^` suggest, `==` highlight-color suggest | suggests | 104120-104230 |
| `a3` | suggest manager (`workspace.editorSuggest`) | suggest routing | 104230-104272 |
| `uie` (`lie`) | slash-command suggest (core plugin "slash-command") | `/` commands | 135431-135485 |
| `LU`, `WU` | CM5-compat adapter (`window.CodeMirrorAdapter`), bookmarks | vim bridge | 76950-77676 |
| `UU`, `GU`, `gU`/`vU`, `mU`, `_U`, `XU`/`YU`/`KU` | Vim instance, vim ViewPlugin, fat-cursor layer, cursor theme, vim theme, vim panel field/effect/search mark | vim | 76678-77972 |
| `i_` / `r_` | find bar / find-and-replace panel (editor) | search | 77973-78192 |
| `$W` | reading-view find bar | search (preview) | 72355-72500 |
| `XF`, `YF`, `GF`, `KF` | highlight field, class→mark registry, add/filter effects | search & flash highlights | 61338-61350 |

---

## How it works

### 1. CodeMirror 6 packages and forks

**Bundled packages (observed, export maps 12346-12750):** `@codemirror/state` (incl. `Text`, `findClusterBreak`,
`SelectionRange.undirectional`), `@codemirror/view` (incl. `showDialog/getDialog`, `BlockWrapper`/`blockWrappers`,
`EditContext` support, `lineNumberWidgetMarker`, `__test`), `@lezer/common` (`IterMode`, `MountedTree`,
`NodeWeakMap`, `parseMixed`), `@lezer/highlight`, `@codemirror/language`, `@codemirror/commands` (incl. `*Win`
group-motion variants, `toggleTabFocusMode`), `@codemirror/search`, `@codemirror/autocomplete`, `@lezer/lr`,
`@codemirror/collab`, `@codemirror/lint`. **Not bundled:** `@lezer/markdown`, `@codemirror/lang-markdown` (no
`ATXHeading1`/`FencedCode` node names anywhere — observed).

**Versions:** no version strings are embedded (observed: no `"6.x.y"` literals in 13k-28.8k). The API surface
(dialogs, block wrappers, EditContext) places them in the recent 6.x line — *inferred*; exact numbers *unknown*.
CM5 is **5.64.0** (`lib/codemirror/codemirror.js`, observed).

**Plugin exposure (observed 108898-108924):** a module map lets plugins `require("@codemirror/state")` etc. and get the
*same instances* the app uses (critical: CM6 breaks if two copies of `state` mix). Old package names from the CM6
0.x era (`@codemirror/rangeset`, `/fold`, `/gutter`, `/stream-parser`, …) are aliased to their modern homes; a
`PluginField` stub and a `Tree.iterate` wrapper that console-errors on the pre-1.0 callback signature keep ancient
plugins limping (108878-108896).

**Forks (inferred from non-upstream API):**
* `@codemirror/language` fork: exports `tokenClassNodeProp`, `lineClassNodeProp`, `lineHighlighter`,
  `ignoreSpellcheckToken`, and `StringStream.hideFirstChars` (12463-12524, 28350-28805). Upstream instead maps tokens
  through `tokenTable`/highlight tags — the *second* copy at 78668-79990 is that upstream behaviour (`JG` resolves
  `"tag.modifier"` names to `@lezer/highlight` tags) and is used only by the Bases formula language.
* `@codemirror/view` fork: `EditorView.clipboardCopyHook` and `clipboardPasteHook` facets (21917-21918) that the
  view's own copy/cut/paste handlers call with the raw `DataTransfer` (19431, 19486). `EditorView.EDIT_CONTEXT` is
  forced `false` (94119) so the EditContext API is never used.

### 2. How syntax tokens are produced (markdown language)

**Script load order (observed, `x/obsidian/index.html`):** `codemirror.js` (CM5 core, used only for its mode
registry), `overlay.js`, `markdown.js` (xml + htmlmixed + yaml + modified markdown mode), `cm-addons.js`
(searchcursor, fold, continuelist, active-line, scrollpastend, dialog), `vim.js`, `meta.min.js` (mode metadata for
`findModeByName`), then moment, pixi, i18next, scrypt, turndown, `enhance.js`, `i18n.js` and finally `app.js`. No CM5 editor instance is ever constructed (observed: no `CodeMirror(`
constructor calls; only `defineMode/getMode/findModeByName/Pass`).

**Layer 1 — `markdown` mode (lib/codemirror/markdown.js).** Upstream CM5 markdown mode with Obsidian edits:
`==highlight==` tokens with optional color: the opening delimiter may be followed by a colored-circle/square emoji
(🔴🟥 red, 🟠🟧 orange, 🟡🟨 yellow, 🟢🟩 green, 🔵🟦 blue, 🟣🟪 purple) which becomes class `highlight-<color>`
(markdown.js:97-106, 693-713; mirrored in app.js `tm`/`nm`/`im` 33434-33460, comment says "Keep in sync with
src/markdown/highlight-color.ts"). Tasks: open → `meta`, closed → `property`. List levels `list-1..3`.

**Layer 2 — `hypermd` mode (app.js:78244-78668).** Wraps `getMode({name:"markdown", ...})` with defaults
`front_matter, math, table, toc, orgModeMarkup, hashtag, fencedCodeBlockHighlighting, highlightFormatting,
taskLists, strikethrough, highlight, headers, blockquotes, indentedCode, lists, hr, blockId` (all true, `emoji`
false) and `tokenTypeOverrides` (`hr`, `list1..3`, `code→inline-code`, `hashtag→"hashtag meta"`) (78232-78267).
It adds state fields (`hmdLinkType`, table columns/row, inner-mode override, hashtag, comment, internalLink/Embed,
alias, footnote, math) and an **inner-mode mechanism**: front matter delegates to the CM5 `yaml` mode until a closing
`---` (style `hmd-frontmatter`), math delegates to `stex` if loaded (else a scan-to-delimiter fallback), fenced code
delegates to the language's CM5 mode. Notable token classes it emits (observed by enumerating string literals):

| construct | token classes | line classes (`line-…`) |
|---|---|---|
| ATX heading | `formatting formatting-header formatting-header-N header header-N` | `HyperMD-header HyperMD-header-N` |
| setext underline | — | `HyperMD-header-line HyperMD-header-line-N` |
| wiki link `[[a#b\|c]]` | `formatting-link formatting-link-start`, `hmd-internal-link`, `link-has-alias`, `link-alias-pipe`, `link-alias`, `formatting-link-end` | — |
| embed `![[x]]` | + `formatting-embed`, `hmd-embed` | — |
| footnote ref / def / inline | `footref`, `hmd-barelink`, `hmd-footnote`, `inline-footnote(-start/-end)` | `HyperMD-footnote` |
| block id `^abc` | `blockid` (only `^[A-Za-z0-9-]+` at line end) | — |
| comment `%%…%%` | `comment formatting comment-start/-end` | — |
| tag `#x/y` | `formatting formatting-hashtag hashtag-begin hashtag meta tag-<sanitized>` … `hashtag-end` | — |
| math | `math`, `formatting-math-begin/-end`, `math-block` | `HyperMD-math` + `parse-next` |
| callout `> [!type]±` | `hmd-callout` | `HyperMD-callout HyperMD-quote HyperMD-quote-N` |
| quote | `formatting-quote quote-N` | `HyperMD-quote HyperMD-quote-N` (`-lazy`) |
| list / task | `formatting-list formatting-list-ul/-ol list-N`, `formatting-task` | `HyperMD-list-line HyperMD-list-line-N`, `HyperMD-task-line`, `HyperMD-list-line-nobullet`; `hmd-list-indent-N` |
| code block | `hmd-codeblock` (+ inner-mode classes) | `HyperMD-codeblock`, `-begin/-end`, `background-HyperMD-codeblock-bg` |
| table | `hmd-table-sep(-N)`, `hmd-table-sep-dummy` | `HyperMD-table-row HyperMD-table-row-N`, `HyperMD-table-N`, `HyperMD-table-rtl` |
| HTML block/inline | `hmd-html-begin`, `hmd-html-end`, `tag`, `hmd-cdata-html` | — |
| escapes | `hmd-escape-backslash`, `hmd-escape-char` | — |
| bare URL / email | `url` (big scheme regex `s_`, email regex `l_`, 78192) | — |
| hr | `hr` | `HyperMD-hr background-HyperMD-hr-bg` |

The `line-parse-next` pseudo line class is emitted for multi-line constructs (code blocks, math blocks, quotes,
callouts, footnotes) (observed 78393-78600).

**Layer 3 — StreamLanguage fork (28448-28728).** For each line, the parse:
1. runs the CM5 `token()` repeatedly (`Mp`, throws after 10 non-advancing calls, 28729);
2. splits each returned style string on spaces, **pulls out `line-X` / `line-background-X` into a per-line set**, sorts
   the remaining classes and joins them — cached per raw style string (`tokenCache`, 28660-28680);
3. merges adjacent identical runs, then emits one lezer buffer node per run whose `NodeType` is created on demand by
   `Ap` (28739): name = classes joined with `_`, prop `tokenClassNodeProp` = the space-separated classes. Types are
   cached in global maps and appended to a shared growing `NodeSet`;
4. emits one extra node spanning the whole line with `lineClassNodeProp` = sorted line classes; it is sized to wrap
   that line's token nodes (so lines are parents of tokens);
5. `parse-next` is removed from the set and returned to `advance()`, which keeps parsing past its chunk budget while
   lines keep requesting it (28590-28610) — so a multi-line construct is never split across a parse boundary.

Chunking & incrementality (observed 28565-28620, 28700-28728): chunks of ≤512 chars per `advance()`; each finished
chunk stores a **copy of the CM5 mode state** as the `stateAfter` per-node prop, so after an edit the parser finds
the last reusable chunk (fragment boundaries trimmed 25 chars) and resumes from its saved state. Parsing stops at
viewport end + 5000 chars (`skipUntilInView`); if the start of the parse is >100 000 chars before the viewport it
restarts from a fresh state at the viewport (fast, but can mis-tokenize until background parsing catches up —
inferred).

**Layer 4 — styling (`lineHighlighter`, 28749-28802, installed `Prec.lowest`).** Iterates the tree over visible ranges;
line nodes → `Decoration.line({class: <line classes>})` at the line-block start; token nodes →
`Decoration.mark({class: "cm-" + each class})`; if any class is in the `ignoreSpellcheckToken` facet the mark also gets
`spellcheck="false"`. Obsidian registers that facet with `url inline-code property footref hmd-footnote math
link-has-alias formatting-link hmd-codeblock blockid hmd-frontmatter hashtag` (94375). There is **no
`HighlightStyle`** for markdown: all visuals are CSS on `.cm-s-obsidian .cm-*` and `.HyperMD-*` (581 lines of
app.css mention `cm-`; observed).

**Lazy code-block languages (observed 107474-107485, 72552):** `CodeMirror.getMode` is monkey-patched; the first time a
mode is requested that resolves to `null`, `lib/codemirror/modes.min.js` (563 KB of CM5 modes) is loaded and every
open `MarkdownView` calls `resetSyntaxHighlighting()` — which re-inserts the document's first character with
`userEvent:"set"` to force a full reparse (95547).

**Reduced language `J1` (94342-94352):** the same mode with front matter, tables, fenced code, task lists, headers,
blockquotes, indented code, lists, hr and block ids disabled — used by table-cell editors (`u0`, 96254).

### 3. Base editor setup (`e0`, 94353-94416) and dynamic options

Base (compartment `G1`): `exceptionSink→console.error`; custom cursor/selection layers `[yW config, wW, CW]` which draw
**only secondary cursors and secondary selections** — the primary range uses the native caret/selection (70432-70485,
observed: main empty cursor skipped, main range filtered out of selection layer); `allowMultipleSelections`;
`rectangularSelection` with filter *Alt+Shift+drag, or middle-button except on Linux desktop* (94359); `history()`;
phrase `"folded code"→""`; `lineWrapping`; per-line `dir` plugin + `perLineTextDirection`; `indentOnInput`;
`lineHighlighter`; highlights field `XF` (lowest); active-line class plugin `Xq` (`cm-active`, 70243); `t_` wrap
selection with `= ~ $ %`; triple-click line selection `_1` (94269); Alt-click adds a cursor; spellcheck-ignore list;
keymap = smart `Home`/`End` (`X1`/`Q1`: Home first stops after the list/quote/checkbox prefix; uses
`moveToLineBoundary` with wrap-awareness except in table lines), mac `Alt-↑/↓` move to line-block start/end, CM6
`defaultKeymap` **minus** `Alt-↑/↓`, `Shift-Alt-↑/↓`, `Alt-l`, `Alt-v`, `Ctrl-m` (94120), `historyKeymap`,
`Mod-Shift-z` redo; indent service = leading-whitespace width; `compositionend` → empty dispatch after 100 ms.

Local (per component, `buildLocalExtensions` 95405): `editorEditorField`/`editorInfoField` inits, an
`updateListener` (`updateEvent` 95391), keys `↑ ↓ Enter Tab` that return "handled" while a suggest popover is open,
`Escape` clears highlights, iOS `--`/em-dash fix (`P1`, 94149), clipboard copy/paste hooks, DOM handlers
(dragstart clears `text/html`, dragover/drop/paste → clipboard manager, focus sets `workspace.activeEditor`, blur →
`saveImmediately()` + close suggest). `a0` adds `Z1` (markdown language), the hanging-indent plugin, a scroll handler
that suppresses CM scroll-into-view when a table cell has focus, `ArrowUp` at top → focus Properties, smart
`Enter`/`Shift-Enter`/`Tab`/`Shift-Tab` (96113-96146).

Dynamic (compartment `n0`, `getDynamicExtensions` 95501 / 96170, rebuilt on config change via `updateOptions`):
`tabSize`, `indentUnit` (`\t` if `useTab` else 4 spaces), RTL theme, `contentAttributes {spellcheck, autocorrect:on,
autocapitalize:on, contenteditable:true}`, `editorLivePreviewField`, the live-preview bundle `C8` (cached per
component), auto-pair (`autoPairBrackets` → `( [ { ' "`, `autoPairMarkdown` → `* _ \` \`\`\``) plus closeBrackets
languageData, vim extensions, then **`workspace.editorExtensions`** (plugins' `registerEditorExtension`). `a0` adds
line numbers + active-line gutter (`showLineNumber`), list renumbering `uU` (`smartIndentList`), indent guides
(`showIndentGuide`), folding (`foldHeading`/`foldIndent`), `$F` (`---` at doc start opens Properties), and toggles
`show-properties`.

Config keys and defaults (observed `XP`, 50169-50215): `spellcheck:true, readableLineLength:true,
strictLineBreaks:false, propertiesInDocument:"visible" (visible|hidden|source), showInlineTitle:true,
useMarkdownLinks:false, autoPairBrackets:true, autoPairMarkdown:true, smartIndentList:true, foldHeading:true,
foldIndent:true, showLineNumber:false, showIndentGuide:true, useTab:true, tabSize:4, rightToLeft:false,
autoConvertHtml:true, vimMode:false, livePreview:true, defaultViewMode:"source", newLinkFormat:"shortest"`.
`config-changed` re-applies options only for the editor-relevant keys (95541, 96166).

### 4. Live preview — inline layer (`v8`, 112570-112724)

`f8` (112560) is the shared update policy: keep the tree; **if the tree is not parsed to the viewport end, the view
is composing, or the mouse is down (`livePreviewState.mousedown`), only `map()` the old decorations**; otherwise
rebuild when the tree object changed, viewport changed, selection set, or effects `I5` (refresh), `GF`/`KF`
(highlights) arrive.

`buildDeco` (112632-112720), per visible range, walks token nodes and maintains a **formatting group**: a run of
contiguous token nodes (next node starts exactly where the group ends). Decorations for the group are collected and
flushed when the run breaks. Reveal predicate `o(from,to)` = *any selection range overlaps [from,to] inclusive*
**or a search-match highlight overlaps** (`ly` with class `obsidian-search-match-highlight`); the selection is
treated as empty when the editor is unfocused, so unfocused editors render fully (112634). On flush: if the group is
revealed, only decorations flagged `always` or `onReveal` are added; otherwise all non-`onReveal` decorations, after
re-tagging trailing hidden pieces from `N5` (hide, caret snaps to start) to `H5` (hide, caret snaps to end).

Rules (observed 112648-112715):
* `hmd-codeblock` tokens: untouched (code shows as text).
* Header marks: hidden (`V5`) unless the caret is on the **line**, or the line is nothing but the marks.
* Quote `>`: unless caret on line — depth-1 → `cm-transparent` mark; deeper → replaced by a `cm-blockquote-border`
  span widget (`j5`).
* `hmd-escape-backslash`: hidden unless caret on line.
* Inline styles `em strong inline-code strikethrough highlight` and link-ish classes `link image hmd-internal-link
  hmd-embed formatting-link footref`: their `formatting` tokens are hidden when the group is not revealed;
  link text gets `Decoration.mark({class:"cm-underline", tabIndex:-1, draggable:true})` (draggable so a rendered link can
  be dragged out).
* Images/embeds/math are skipped here (block layer handles them); `[[` directly followed by `]]` is left visible.
* Wiki links with alias: target and pipe hidden, alias shown; `[[#Heading]]` hides the leading `#`.
* Task marker `[ ]` → `X5` checkbox widget (`data-task` = the char; toggles space↔`x`; vibrates 100 ms; Android
  scroll-lock hack). Bullet `-` → `list-bullet` mark on its first char unless it is a task item (then hidden);
  ordered marker → `list-number` mark.
* Highlight with color emoji: emoji hidden with the `==` normally; when revealed it is replaced by a clickable
  `Q5` swatch widget (`onReveal`), which opens a color menu and rewrites the emoji.
* `[text](url)` with an external URL: an `external-link` icon widget (`$5`) after `)` (`always`).
* `<url>` autolinks: underline + hide trailing `>`.

**Caret snapping (112577-112600):** on a selection-only update (no doc change, mouse up, no image-edit effect), each
range endpoint inside an *old* hidden decoration is moved to its start (`N5`), end (`H5`), or — for header marks
(`V5`) — start only when the selection spans lines; iterated up to 10 times, dispatched in a `setTimeout`. Reason
(inferred): positions coming from clicks/vertical motion can land inside replaced text that was hidden at the moment
of the click.

`g8` (112724) adds `Decoration.line({attributes:{"data-task": c}})` to `HyperMD-task-line` lines (custom task
states styled by CSS).

### 5. Live preview — block layer (`m8` StateField, 112746-113155)

Block/replace-across-lines decorations must come from state, so `m8` builds a `StateField<DecorationSet>`
(`provide: EditorView.decorations.from(field)` + an image-reveal tooltip field). Rebuild only if
`ensureSyntaxTree(state, viewport.to + 2000, 20ms)` succeeds (or on `I5`/`GF`/`KF`), never while composing, re-entrant,
or mouse-down; otherwise `map()` and push position updates into live table widgets (113124-113145). **It iterates the
entire tree** (no `from/to`; 112849) — whole-document cost per rebuild (observed).

**Widget reuse:** separate pools for internal embeds, code blocks, callouts, tables, math, HTML, external images;
before creating a widget it searches the previous pool for an equal one (`M8`) and calls `setPos(start,end)`;
leftovers have their child components unloaded. Combined with `noReuse`/`toDOM` caching (`RW.toDOM` creates DOM
once per widget instance), an embed keeps its DOM across rebuilds (observed 70728-70732, 112786-112800). Effect `L5`
(fired with `I5` on workspace `post-processor-change`) drops the code-block pool so registered processors re-render.

Placement helper `$` (112793-112812): an embed that occupies its whole line (and is not an image) becomes a
**block** replace of the line; if the selection touches it, the source stays and the widget is added as a block
widget *after* the line ("source + preview"). Inline non-image embeds touched by the selection get the widget after
the source. **Images are always replaced** with `isImageEmbed: true`, and those ranges are registered as
`atomicRanges` (113290-113300) — the caret jumps over them.

Per construct (observed 112849-113001):

| construct | detection | widget | revealed when |
|---|---|---|---|
| `![[x]]` | `formatting-link-start`+`formatting-embed` … `formatting-link-end` | `r8` (embed registry `d2.load`, `showInline`, depth) | selection overlaps (source + preview) |
| `[[x]]` unresolved | same, non-embed | `is-unresolved` mark on text | — |
| `![alt](url)` | `image-marker`, `image-alt-text`, `url` | internal path → `r8` with `path\|alt`; else `n8` (`<img>` or iframe for YouTube/Twitter via `bj/wj`) | images: never (image selection instead) |
| `$…$` / `$$…$$` | `formatting-math-begin/-end` | `l8` (MathJax `hj`, lazy `cj`) | inline: source only; block: source + widget below |
| HTML | `hmd-html-begin` … `tag` … `hmd-html-end`, tag not in `script style link meta object embed webview` | `u8` (DOMPurify `cC`, block if tag computes as block) | overlap |
| `---` | `hr` | `G5` block | overlap |
| callout | line `HyperMD-callout`+`HyperMD-quote-1`, continuing over contiguous `HyperMD-quote` lines | `s8` (renders via the reading-view pipeline `cm→fm→cC` + `postProcess`) | overlap |
| table | contiguous `HyperMD-table-row` lines | `oU` | **never by caret**; raw only if a search match is inside |
| fenced code | `HyperMD-codeblock-begin/-end`, lang from fence regex `B5` | lang is `mermaid`, `query`, or a registered code-block processor → `o8` block | overlap |
| other fenced code | same | opening fence hidden + `Z5` flair (language label or copy icon), closing fence hidden; body stays editable/highlighted | fences visible on overlap |

`a8`/`s8` render markdown through the same mdast/hast pipeline as reading view and wire task checkboxes back to
source (`$j.toggleCheckbox`, 112396-112420); callout context menu edits the type (`A5` list: info, important, tip,
success, question, warning, example, quote + "other" fuzzy picker + "none" which unwraps), 112421-112448.
`estimatedHeight`s: images 30 (iframe 350), embeds 100, code 50, math 50, HTML 40, rendered markdown = lines ×
`defaultLineHeight`, HR 20 — feeding CM6's height map.

**Image reveal (jF/WF + tooltip + `d8`, 61100-61118, 112815-112830, 113009-113105):** editing an image's URL or alias
(`Enter`/`Tab` on a selected image, or the edit button) sets the reveal state `{from, to, reservedHeight,
textRowHeight}`; the image source text is shown, a `cm-image-reveal-tooltip` floats the image above/beside the line,
and a spacer (`cm-image-reveal-gap` block or `cm-image-reveal-spacer` inline) reserves the image's measured height so
content below does not jump. The state clears when the selection leaves the range (except pointer selections).

**Interaction glue (`C8`, `b8`, 113157-113323):** mousedown on the scroller sets `livePreviewState.mousedown` until
mouseup/drag; afterwards, if anything changed, a selection re-dispatch 50 ms later triggers the rebuild — so the
layout never changes under a drag-selection. Focus/blur fire `I5` after 10 ms (reveal state depends on focus).
High-precedence `↑/↓` compare normal vertical motion with "land on a line fully covered by a block widget" and take
the nearer, so the caret can stop on (and reveal) a widget line. `Mod-A` inside `.interactive-child` selects inside
that input. Image keys (when an image is selected): `→/←` enter/exit, `Enter` edit URL, `Tab` edit alias, `Esc`,
`Space` lightbox, `Backspace/Delete`, `+ = -` resize, `0` reset; copy/cut copy the image's markdown. Mobile: a 700 ms
debounced "dragging cursor" mode.

### 6. Images: selection & resize (`UF`, `e8`)

* Clicking an image selects it (`is-selected`, editor class `mod-image-selected`), caret placed at its start
  (61145). `reconcile` keeps the selection only while the caret sits exactly at the image's start/end.
* Resize by keyboard: snaps to **25 px steps**, clamped to `[20, contentDOM width]`; by corner drag (`image-resize-corner`,
  rAF-throttled, aspect-aware, RTL-aware), double-click corner resets. The width is persisted **into the link text**
  (`wy`): `![[img.png|300]]` or `![alt|300](url)`; an existing `|WxH` suffix is replaced (34867-34885; size grammar
  `^\s*(\d+)\s*(?:x\s*(\d+)\s*)?$`, 33410).
* Context menu: copy image (native `nativeImage` path for png/jpeg on desktop), swap file (fuzzy picker), remove,
  reset size, delete file (`promptForDeletion`).
* Lightbox (`qF`) iterates all `isImageEmbed` widgets for prev/next.

### 7. Table editor (`oU`, `iU`, `u0`, `aU`)

* Render (75664-75760): parse the table source with the reading-view markdown parser, render to an HTML `<table>`
  (`table-editor`), wrap each cell in an `iU` (row, col, source start/end, padding). Column widths = max(5, text+2).
  Missing cells/rows are synthesized and the table marked malformed (normalized on next write).
* Editing a cell creates a **nested `EditorView`** (`u0`) inside the cell, with the reduced markdown language,
  vim mode synced to the parent, and its own keymap: arrows cross cell boundaries, `Tab/Shift-Tab` next/prev cell
  (adds a row at the end), `Enter` cell below (adds row on last), `Mod-z`/`Mod-y` route to the **parent** history,
  shift-arrows extend a rectangular cell selection (96254-96452).
* Cell ↔ document mapping: cell text is escaped when written into the row (`vy`: newline→`<br>`, `|`→`\|`) and
  unescaped when loaded into the cell editor (`gy`), with `ChangeSet`s so selections map through (34815-34860).
  Cell edits dispatch a change on the parent doc annotated `rU` (internal) and the table re-serializes to a padded,
  aligned table (`getTableString`/`makeAlignmentRow`, 75186-75225).
* Reverse direction: parent changes that touch only cell interiors are reconciled cell-by-cell (`reconcileChanges`);
  anything else re-renders the widget (75268-75330). `cellSanitizerPlugin` (`changeFilter`) clips parent edits to the
  active cell; `detectSurroundingClick` inserts a newline when clicking at a table's doc boundary; `aU` keeps a blank
  line between tables and adjacent text and turns Backspace-into-table into selecting the table.
* Row/column insert/move/remove, sort by column (header row fixed), alignment menu, drag handles, copy/paste of cell
  ranges.

### 8. Lists, indentation, smart Enter, renumbering

* `dR` (61521) is the list-prefix grammar: `^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?` → groups: indent/quote
  prefix, marker, bullet, number, delimiter, task char.
* **Enter** (`smartIndentList`): inside code → keep indentation only; else `newlineAndIndentContinueMarkdownList`
  (61679-61749): continuation lines inherit the marker of the nearest previous line with the same prefix width;
  empty item → remove marker / outdent one level (tab or up to 4 spaces) / exit one quote level (two empty quote
  lines collapse); otherwise insert newline + prefix + next marker (number+1, `[ ] ` for tasks — always unchecked),
  no new marker if the text after the caret already starts with one. Falls back to CM6 `insertNewlineAndIndent`.
  **Shift-Enter** = newline aligned under the item's text (marker replaced by spaces).
* **Tab/Shift-Tab** always indent/outdent the selected lines (`N1`/`V1`, 94228-94257), quote-aware (inserted after
  the `>` prefix).
* **Renumbering** (`uU`, 76385): a transaction filter that, for changed lines (+1), recomputes the expected number
  from the previous sibling at the same indent level (tabs or 4 spaces = one level) and quote depth, then cascades
  through following siblings until a correct one; appended as a sequential change with `userEvent:"input.renumber"`
  (ignored by itself and by `set`).
* **Paste onto a list marker** (`tryCollapseListMarker`, 96148): if the caret is right after a marker and the pasted
  first line starts with one, the pasted marker is dropped and the existing marker kept (task state preserved).
* **Hanging indent** (`dU`, 76530): each list line gets `text-indent:-Npx; padding-inline-start:Npx` where N is first
  estimated from columns × char width, then **measured** from `coordsAtPos` after DOM updates (MutationObserver,
  per-line cache, dirty flags; temporarily stubs `scrollDOM.scrollTop` during measurement to avoid scroll jumps).
* **Indent guides** (`OW`): `cm-indent` marks per indent unit in leading whitespace; `cm-active-indent` on the block
  belonging to the caret's list item.
* Toggles (`gR`): `setHeading`, `toggleBlockquote`, `toggleBulletList`, `toggleNumberList`, `toggleCheckList`
  (cycles none → `[ ]` → `[x]`), `insertCallout` (`> [!NOTE]`), `insertCodeblock`, `insertMathBlock`,
  `toggleMarkdownFormatting(bold|italic|code|highlight|strikethrough|comment|math)` driven by a table of
  `{nodeType, surroundingChars}` (34887-34895) and the token tree (unwraps if inside, else wraps word/selection,
  per-line for multi-line, table-cell aware), `toggleHighlight(color)`, `clearMarkdownFormatting` (deletes every
  `formatting` token in the selection), `expandText` (CJK `【【`→`[[`, `】】`→`]]`).

### 9. Folding

* Services: headings `I1` (ATX verified by `header` token class so `#` in code doesn't fold; setext supported; folds
  until next heading of same/higher level), indentation `T1` (following lines with greater indent, blank lines
  skipped — used for lists), front matter `L1`; `codeFolding()` + `AW`: `MW` fold-indicator widgets at the first
  non-space char of foldable lines (`cm-fold-indicator`, click toggles), folded ranges are `atomicRanges`, and `DW`
  unfolds folds touched by edits (70494-70563).
* `foldAll` forces parsing the whole doc (5 s budget) then folds every foldable line; `foldLess/foldMore` operate on
  the innermost/outermost fold around each selection.
* `getFoldInfo` = `{folds:[{from:line,to:line}], lines:docLineCount}`; `applyFoldInfo` only if line count matches
  (95551-95571). Persisted by `N8` in localStorage key `<appId>-note-fold-<path>` (empty → removed; `cleanup`
  drops keys of deleted files), saved 500 ms after fold changes or edits, and handed across mode switches. Properties
  collapse is encoded as a fold `{from:0,to:0}`.

### 10. Clipboard, HTML paste, drag & drop (`OR`, `yR`)

* **Copy** (95422): `text/plain` (CM default) + `text/markdown` (same text) + `text/html` = `<!-- obsidian -->` +
  rendered markdown HTML (only if ≤ 1 000 000 chars).
* **Paste** (`clipboardPasteHook`, 95426): `handleDataTransfer` → if HTML contains the `<!-- obsidian -->` marker and
  plain text exists, use plain (Obsidian→Obsidian round trip); else `text/markdown` if present; else, if
  `autoConvertHtml`, sanitize and convert HTML with **Turndown** (`atx` headings, `-` bullets, fenced code, rules for
  `~~`, `==` from `<mark>`, task checkboxes, GFM tables with alignment and colspan, links/media); a lone `<img>` with
  files attached falls through to file paste; `data:` images > 1000 chars are saved as attachments; `uri-list` +
  differing plain text → `[text](uri)` (`!` for images). Then `tryPasteUrl` (non-empty single-line selection + URL →
  `[selection](url)`, multi-cursor aware), `tryCollapseListMarker`, else insert; files → `insertFiles` →
  `app.saveAttachment` → `![[…]]`; pasted images named `Pasted image YYYYMMDDHHmmss`. Plugins can veto via the
  workspace event `editor-paste` (preventDefault).
* **Drop** (62312-62357): internal drags (`dragManager.draggable`: file, files, link, heading, bookmarks) insert
  generated links (`!` for embeddable types) at the drop point; external drops fire `editor-drop`, then
  data-transfer conversion (unless Shift), then: Ctrl (Alt on mac) → link to the external path as a `file:///` URL
  without copying; otherwise import as attachments. Alt (Shift on mac) onto a MarkdownView → `view.handleDrop`.
* Drag-out: dragging a rendered link starts an internal link drag or sets the URL on the DataTransfer
  (`onEditorDragStart`, 95738).

### 11. Spellcheck, RTL

* Native browser spellcheck via `contentAttributes.spellcheck` (config `spellcheck`), suppressed per token class
  (above). The context menu awaits Electron's context-menu params (`mw(e)`) to show up to 6 dictionary suggestions,
  "Add to dictionary" (`session.addWordToSpellCheckerDictionary`), and edit-flag-driven Cut/Copy/Paste/Paste-as-plain;
  macOS "Look up" (95757-95830). Spellcheck languages are stored in localStorage `spellcheck-languages` (146247).
* RTL: `rightToLeft` or `body.mod-rtl` → `is-rtl`, `dir=rtl`, theme direction; `LB` gives every line `dir` from the
  first strong character after the list prefix (Arabic/Hebrew/Syriac/Thaana → rtl, many LTR scripts → ltr), "auto"
  lines inherit the previous line's direction (65340-65368, 38083); `perLineTextDirection` on; table cells set `dir`
  individually; widgets compute positions with `textDirectionAt`.

### 12. `Editor` API (`gR`) and its CM6 implementation (`i0`)

* Positions are CM5 `{line, ch}` (0-based); `ry`/`oy` convert to/from offsets with clamping (34748-34760). Methods
  map 1:1 to CM6 transactions: `replaceRange(text, from, to?, origin)` → `dispatch({changes, scrollIntoView,
  userEvent})`; `transaction({replaceSelection, changes, selection(s)}, userEvent)` builds one `ChangeSet` and maps the
  selection through it (94526-94560); `exec(name)` runs from a small CM5-named command table (`goUp`, `goWordLeft`,
  `indentMore`, `swapLineUp`, `toggleFold`, `foldAll`, …, 95194-95210). `activeCM` = the table-cell view when one is
  focused, so commands/formatting target the cell.
* Extras: `addHighlights(ranges, cls, removePrevious, removeFolds)` (unfolds folds covering the ranges),
  `removeHighlights`, `getAllFoldableLines`, `foldLess/More`, `insertHorizontalRule`, `insertBlock`,
  `insertMarkdownLink`, `triggerWikilink(embed)`, `insertTable` (2-column header + separator + one empty row),
  `toggleComment` (`%%`),
  `searchCursor(query)` (case-insensitive literal; backwards search in 10 000-char windows; count capped at 9 999),
  `getClickableTokenAt(pos)` (scans the line's token runs → `internal-link | external-link | external-ref-link | tag
  | blockid | footref` with text and range; strips image-size aliases), `insertFootnote` (adds `[^n]` + definition at
  doc end, saves, recomputes metadata, then opens a **hover popover editor** on the definition), `wordAt`,
  `coordsAtPos(pos, relativeToScroller)`, `posAtCoords`.

### 13. Editor components, modes and MarkdownView

* `o0` constructor (95212): `markdown-source-view cm-s-obsidian mod-cm6` div, `new EditorView`, `i0`,
  clipboard manager, `MarkdownPreviewRenderer.registerDomEvents` on `contentDOM` (rendered links inside widgets
  behave like reading view), click/mousedown (capture)/contextmenu/mouseover(`.cm-link, .cm-hmd-internal-link,
  .cm-footref` → `hover-link`)/dragstart handlers, `onNodeInserted` → `setRoot` (popout windows).
* **Loading text (`set`, 95280):** first load or forced → brand-new `EditorState` (history restored from an in-memory
  per-file cache `r0` — ≤ 20 entries `{ts,file,data:historyField JSON,length}`, accepted only if the doc length matches
  — then scroll to top). Otherwise a **minimal diff**: common prefix/suffix *lines*, then common prefix/suffix
  *chars* within a single changed line, dispatched as one change with `userEvent:"set"`. Everything that reacts to user
  edits checks `ny(tr)` = "not set" (34741), so external syncs don't trigger saves, renumbering, suggests.
* **Clicks:** source mode follows links only with Mod (or middle click); live preview follows on plain click on
  `.cm-underline`/`.external-link` link text, tags open global search `tag:#x`; internal links open after 100 ms
  (`openLinkText`, Mod → new tab).
* **Source vs Live Preview vs Reading:** `L8.modes = {source: P8, preview: eU}`; "source" mode has a `sourceMode`
  boolean (true = Source mode, false = Live Preview). `toggleSource` flips it, reconfigures `n0`, updates
  `editorLivePreviewField` via the `H1` effect, and dispatches the generic refresh effect `cy` (95662). `setMode`
  (114618): save if leaving source → capture fold info → `foldManager.save` → hide old/show new → `set(data)` →
  `onResize` → restore scroll via ephemeral state → `applyFoldInfo` → properties collapse → `data-mode` attr.
  `defaultViewMode` picks the initial mode; Mod-click on the mode button opens the other mode in a split.
* **View state** (114529): `{mode:"source"|"preview", source:boolean, backlinks:boolean, backlinkOpts}` (+ `file` from
  FileView). **Ephemeral state** (114565-114586, 114265-114347): `cursor:{from:{line,ch},to:{line,ch}}`, `scroll`
  (fractional line number: top line index + fraction of its block, 96073-96106), `focus`, `focusOnMobile`,
  `focusMetadata`, `line`, `startLoc/endLoc`, `match:{content,matches}` (search result offsets → flashing
  highlights `is-flashing`), `propertyMatches`, `subpath` (resolved to heading/block lines), `rename:"start"|"end"`.
* **Scroll sync:** `a0.onScroll` → `owner.syncScroll()` → `workspace.trigger("markdown-scroll")` + `syncState()`
  (linked panes), `receiveSyncState` opens/positions the other leaf (114734-114742). `isScrolling` suppresses echo.
* Other `L8` duties: inline title (contentEditable, rename on blur), `metadataEditor` (properties) + `loadFrontmatter`
  (YAML → cssclasses → `setCssClass` on the editor), embedded backlinks, Ctrl+wheel font size (`baseFontSizeAction`,
  clamp 10-30, 500 ms guard), pane menu (reading view, source mode, find/replace, export PDF), `obsidian/properties`
  clipboard type routed to the properties editor.
* **Properties in live preview** (`cR`, 61435): a field hides valid front matter with a block replace (invalid YAML
  gets `is-invalid` + an `error-marker` at the parse error position); a transaction filter clamps selections out of
  hidden front matter and rejects edits inside it; typing a third `-` on a first line `--` inserts the fence pair and
  runs `markdown:add-metadata-property` (`$F`, 61351).

### 14. How edits flow to the vault (save timing)

1. User transaction → `updateListener` → `P8.onUpdate(update, isUserChange)` (114364): if a non-`set` doc change:
   `view.requestSave()`, `requestSaveFolds()` (500 ms), `requestOnInternalDataChange()` (10 ms); also workspace events
   `editor-change` and `editor-selection-change` (96206-96212).
2. `onInternalDataChange` (114817): if text differs from `data` → `data = text`, `workspace.onQuickPreview(file, text)`
   → event **`quick-preview`** → other MarkdownViews of the same file `setData` (live mirroring before disk), embeds
   and other listeners refresh; `loadFrontmatter` re-syncs Properties.
3. `requestSave` (`Q4`, 103737-103742) sets `dirty` and calls `Gl(save, 2000)`. `Gl` (debounce helper) with its
   default `resetTimer=false` schedules **2 s after the first call and does not extend on further calls** — so while
   typing, the file is written at most every ~2 s (observed helper semantics).
4. `save(clear?)` (103782): bail if no file/deleted; if a save is in flight set `saveAgain`; skip if text equals
   `lastSavedData` (or `lastSavedData` is still `null`, i.e. nothing loaded yet); await `adapter.promise` (write queue) → `vault.modify(file, text)`; on error restore
   `lastSavedData`, show a persistent notice and back up the text (`fileManager.storeTextFileBackup(path, text)`,
   103809; defined 64946); finally re-run if `saveAgain`.
5. Immediate saves: editor blur (`saveImmediately` 95453), mode switch, unload (`save(true)` also clears), `Mod-S`
   (`editor:save-file`, 106925), before inserting footnotes.
6. External modification: `vault` `modify` → `onModify` (ignored while saving) → `loadFileInternal`: if the buffer is
   **dirty** and differs from both disk and last-saved, merge with **diff-match-patch**: diff(lastSaved → buffer),
   cleanupSemantic/Efficiency, make patches, apply to disk text (`e2`, 98757) and show "file changed" notice; the
   result is applied with the minimal-diff `set`.
7. Embedded/section editors (`E0`/`f2`): same 2 s `requestSave`; `f2` edits only a slice — content is
   `before + heading + content(re-indented) + after` reassembled on save (99222-99260), with its own merge
   (99394-99407).

### 15. Editor suggest system

* `a3` (`workspace.editorSuggest`, 104230) holds an ordered list: `[[` links (`jB`), tags (`GB`), footnotes (`i3`),
  highlight colors (`o3`), then plugin suggests (`registerEditorSuggest`) and the slash-command suggest when that core
  plugin (id `slash-command`, default off) is enabled. `trigger` asks each in order; first non-null `onTrigger` wins.
* Triggering (95391-95403): the update listener debounces 50 ms (`Gl`, non-resetting) and passes `open = true` only if
  a transaction in the window was user `input`/`delete` — moving the caret into `[[foo` updates an open popover but
  never opens one. `OB.trigger` requires an empty selection, stores `context {editor, file, start, end, query}`,
  supports sync or async `getSuggestions` (async results dropped if the editor lost focus), caps at `limit` = 100,
  positions with `coordsAtPos(start/end)` and the line's text direction.
* **`[[` suggest (`WB` engine 65671, `jB` 65996):** `onTrigger` = last `[[` on the line before the caret with no `]`
  after it. Query grammar: `##q` global headings; `^^q` global blocks; `file#q` headings of a file (or **Bases view
  names** for `.base` files); `file#^q` blocks (via `metadataCache.blockCache`); `file|q` aliases from front matter;
  otherwise files/aliases/unresolved link texts from `metadataCache.getLinkSuggestions()` (empty query → by mtime),
  fuzzy-scored, user-ignored files −10 ("downranked"). Long loops are time-sliced (`qI.shouldPause/pause`) and
  cancellable (`_T` runnable). Keys: `Enter`, `Tab` (keeps caret inside for alias), `Shift-Enter` (insert typed text
  as-is), `#`/`^` (accept file, continue into heading/block mode), `|`. Insertion (`qB`, 65610) builds `[[linktext]]`
  via `fileToLinktext` (respects `newLinkFormat`) or `[text](path)` with `useMarkdownLinks`; consumes an existing
  `]]`/`|alias` after the caret. **Linking to a block without an id generates a random 6-char id** and appends
  ` ^id` (or `\n\n^id` for non-paragraph blocks) to the target block — via `vault.modify` if it is another file
  (`JF` 61386, 66062-66090).
* Tag suggest: regex `(^|\s)#[^punct\s]*$` (66110); fuzzy over `metadataCache.getTags()`; select inserts `#tag `.
* Footnote suggest `[^`: existing footnotes of the current file + "new footnote" → `insertFootnote`.
* Highlight-color suggest: after typing `==` (not `===`, not in code/math/after a closing `==`) offers default + 6
  colors, inserting the emoji marker (104190-104228).
* Slash commands (135431): regex `(^|\s)/([^\s/]*)$`, only on typing; fuzzy over all commands with hotkeys and pinned
  flair; selecting deletes `/query` then executes the command.

### 16. Vim

* `lib/codemirror/vim.js` header: based on CM5 vim at commit `793c9e6` (2021-12-04), "modified from
  nightwing/cm6-vim-mode-experiment" (observed). It exposes `initVimMode(CodeMirror)` and also initializes a CM5-bound
  `CodeMirror.Vim` at load (vim.js:41, 6432).
* `LU` (76950-77585) is a **CM5 API emulation over a CM6 view** (the `@replit/codemirror-vim` "cm_adapter" design):
  `getCursor/setSelections/replaceRange/indexFromPos/posFromIndex/getLine/operation/curOp/on/off/signal/
  addOverlay/getSearchCursor/findPosV/coordsChar/execCommand/setBookmark`, plus Obsidian additions `livePreview`
  (the `UF` image controller), `tryHandleKey` (`h/l` enter/exit a selected image), `resizeImage`, `resetImageSize`,
  `editImage`, `getTokenTypeAt` (maps syntax node names to `comment`/`string`), `hardWrap` (`textwidth` default 80).
  `UU = initVimMode(LU)`, `LU.Vim = UU`, **`window.CodeMirrorAdapter = LU`** (77677-77679) — the global that
  community vimrc plugins use (inferred).
* Custom vim: Ex `:image grow|shrink|reset|edit`; normal-mode `g+`, `g-`, `g=`, `g<CR>` (77680-77710).
* Extensions when enabled: `_U` theme, `Prec.highest(GU)` ViewPlugin (creates the adapter, `enterVimMode`, keydown →
  `Vim.multiSelectHandleKey`, composition/dead-key handling, `<C-c>` copy-then-escape, vim search highlight marks
  `KU`), `mU` fat-cursor theme + `gU` block-cursor layer (`cm-fat-cursor`), `XU` panel field showing vim dialogs.
  Enabled by config `vimMode` on desktop, localStorage `vim` on mobile (146253).
* **No `.obsidian.vimrc` support in core** (observed: no `vimrc` string in app.js) — left to plugins.

### 17. Search & replace, commands, multi-cursor

* Editor find (`r_`, 78044): Obsidian's own `document-search-container` (not CM6's panel). Literal, case-insensitive,
  no regex/whole-word. Scope keys: `F3`/`Mod-G` next, `Shift-F3`/`Mod-Shift-G` previous, `Enter`/`Shift-Enter`,
  `Tab` switches inputs, `Alt-Enter` find-all (highlights all), `Mod-Alt-Enter` replace-all, `Esc`. Prefills with the
  selection; matches are mark decorations in `XF` with class `obsidian-search-match-highlight`, which also force live
  preview to reveal raw markdown at matches and keep tables raw. Count update debounced 20 ms (resetting, 78051). Replacements use
  `userEvent:"searchReplace"`.
* Reading-view find (`$W`, 72355) searches rendered DOM.
* Editor commands (registered with `editorCallback`, 70990-71500): `editor:toggle-bold` (Mod-B),
  `toggle-italics` (Mod-I), `toggle-strikethrough`, `toggle-highlight` (+ `-<color>` variants), `toggle-code`,
  `toggle-inline-math`, `toggle-comments` (Mod-/), `insert-link` (Mod-K), `delete-paragraph` (Mod-D),
  `set-heading-1..6`, `toggle-bullet-list`, `toggle-numbered-list`, `toggle-checklist-status`, `cycle-list-checklist`,
  `indent-list`/`unindent-list`, `swap-line-up/down`, `fold-all/unfold-all/fold-less/fold-more/toggle-fold`,
  `toggle-fold-properties`, `insert-callout/codeblock/mathblock/table/footnote/horizontal-rule/wikilink/embed/tag`,
  `open-search` (Mod-F), `open-search-replace`, `follow-link`, `open-link-in-new-leaf/split/window`, `toggle-source`,
  `toggle-line-numbers`, `toggle-readable-line-length`, `toggle-spellcheck`, `add-cursor-above/below`,
  `clear-formatting`, `rename-heading`, `save-file` (Mod-S), `undo/redo/copy/cut/paste`, table commands
  `editor:table-*`, mobile `toggle-keyboard`, `configure-toolbar`.
* Multi-cursor: native primary + drawn secondary cursors; Alt-click; rectangular selection; add-cursor-above/below;
  CM6 `defaultKeymap` behaviours (e.g. Escape simplifies selection); vim multi-select. Formatting/list operations
  iterate all ranges.

### 18. Embedded editors and the iframe trick

`E0` (96799) hosts a reading view by default and lazily creates an editor (`k0`) on edit; `Escape` (outside vim
insert) returns to preview with an immediate save; the caret is placed at the click coordinates. When `useIframe`
is set (canvas file/text nodes, 125375, 125617) the editor DOM is moved into a sandboxed same-origin iframe; parent
`<style>/<link>` elements, body classes and CSS custom properties are mirrored live by a MutationObserver (`y0`), and
input/focus events are re-dispatched to the parent window as relayed clones (`g0`, `m0`) (96500-96760). Rationale
*inferred*: isolates CM6 measurement/selection from the canvas's CSS transforms and focus handling.

---

## Data formats & on-disk files

| store | key / file | shape | notes |
|---|---|---|---|
| localStorage | `<appId>-note-fold-<vault path>` | `{folds:[{from:int,to:int}], lines:int}` | 0-based line numbers; `{from:0,to:0}` = properties collapsed; deleted when empty or file gone |
| memory only | `r0` undo cache | `[{ts, file, data:<historyField.toJSON>, length}]`, max 20 | restored on reopen if doc length matches; lost on reload |
| localStorage | `spellcheck-languages` | JSON array of locale codes | desktop also pushes to main process |
| localStorage | `vim` (mobile) | truthy string | vim toggle on mobile |
| `.obsidian/app.json` | editor keys | see config defaults in §3 | `vimMode`, `livePreview`, `defaultViewMode`, … |
| markdown text | image size | `![[img|W]]`, `![[img|WxH]]`, `![alt|W](url)` | written by resize UI |
| markdown text | highlight color | `==🔴text==` (emoji right after `==`) | 6 colors, two emoji variants each |
| markdown text | block id | ` ^[A-Za-z0-9-]+` at line end (6 random chars when auto-generated) | |
| clipboard | `text/markdown`, `text/html` with `<!-- obsidian -->`, `obsidian/properties` | | round-trip detection |

---

## Rebuild notes

**What to copy conceptually**
1. *One syntax tree with string classes is enough.* Obsidian proves you can drive styling, live preview, folding,
   click targets and commands from a flat "token class string + line class string" tree. For a rebuild, use a real
   lezer markdown grammar (`@lezer/markdown` + GFM + custom inline parsers for `[[ ]]`, `==`, `%% %%`, `^id`, `$`,
   callouts) — you get structured nodes and incremental parsing without the CM5 dependency, the 563 KB mode bundle,
   or the "restart parsing at viewport" heuristic. If you must keep a stream tokenizer, keep Obsidian's two good
   ideas: separate line classes from token classes, and a "parse-next" flag so multi-line constructs never straddle a
   chunk boundary.
2. *Two-layer live preview.* (a) A ViewPlugin over visible ranges for inline hide/reveal using
   `Decoration.replace({})` / marks; (b) a StateField for block widgets (CM6 requires block/multi-line replaces from
   state). Keep the reveal unit = maximal contiguous run of formatting/styled tokens; line-level reveal for headings,
   quotes, escapes; range-level reveal for blocks; and "render everything when unfocused".
3. *Don't re-layout under the pointer.* Freeze decorations while the mouse is down or IME is composing, rebuild on
   mouseup; snap the caret out of hidden ranges after selection changes (distinct replace instances that encode
   "snap to start/end").
4. *Widget identity & reuse.* Pool widgets by content between rebuilds, update positions, create DOM once, unload
   child components of dropped widgets, give realistic `estimatedHeight`s, and `ResizeObserver` → `requestMeasure`.
5. *Special interaction models for things that can't be "revealed" gracefully*: atomic image ranges with a selection
   state and an edit-with-tooltip mode that reserves height; tables as widgets with nested per-cell editors that map
   changes both ways via escaped ChangeSets and share the parent's undo history.
6. *Editor facade.* A stable, plugin-facing API in line/ch terms with a single `transaction()` primitive; keep
   `userEvent` discipline (`set` for programmatic syncs, `input.*`, `delete.*`, `input.renumber`,
   `input.autocomplete`, `input.paste`) so features can ignore their own and external writes.
7. *Persistence.* Throttled save (first-edit + N s, not trailing debounce), immediate save on blur/close/mode
   switch, write queue, `lastSavedData` to skip no-op writes, three-way merge when disk changes under a dirty buffer,
   and an in-memory broadcast (`quick-preview`) so every view of the same note stays in sync before the write.

**Incidental / avoidable**
* The duplicate upstream `@codemirror/language` copy (Bases) and a re-bundled closeBrackets copy — bundle hygiene
  issues; dedupe.
* CM5 core loaded only for its mode registry and vim; with lezer + `@replit/codemirror-vim` you need neither.
* Whole-document tree iteration in the block-widget field on every rebuild — restrict to viewport ± margin and
  cache per block.
* `resetSyntaxHighlighting` re-inserting the first character to force reparse — use a language compartment
  reconfigure instead.

**For a graph-centric app (the user's project)**: the essential subset is CM6 + lezer markdown with wiki-link /
tag / block-id inline extensions, the inline hide/reveal plugin, embed and image widgets, `[[` suggest backed by your
link index (with time-sliced cancellable fuzzy search), the list Enter/Tab/renumber behaviours, and the throttled
save + merge pipeline. Tables, vim and the CM5 compatibility surface can come much later.

---

## Open questions

* **Exact CM6 package versions** — unknown (no strings). Resolve by diffing distinctive functions against npm
  tarballs of `@codemirror/view`/`state`/`commands` releases, or reading `require("@codemirror/view")` objects at
  runtime in a dev console.
* **Fork deltas** — besides the observed extra exports/facets, what else did Obsidian change in its
  `@codemirror/view` and `@codemirror/language` forks? Compare against upstream source of the matching version
  (public `obsidian-api` docs hint at a language fork; confirm by diffing `StreamLanguage`/`Parse`).
* `noReuse` getter on widgets (70752, 112114…) is not read anywhere in the bundle (observed); probably vestigial or
  read by a fork version not present — unknown.
* Precise semantics of `DW` (unfold-on-edit) range math (mixes old/new coordinates, 70547-70562) — runtime test:
  fold a heading, type inside/near it.
* Why canvas uses the iframe editor (`useIframe`) — inferred transform/focus isolation; verify by toggling at
  runtime.
* Where `storeTextFileBackup` (64946) writes the backup on save failure — confirm with the file-recovery worker.
* Behaviour of the "start fresh state at viewport when > 100 000 chars ahead" path on huge notes (possible transient
  mis-tokenization inside long code blocks) — runtime probe with a large file.
* Plugin suggests vs built-ins ordering: `Plugin.registerEditorSuggest` (109071) appends to `a3.suggests`, so
  built-ins always win ties; no priority API observed — confirm whether that is intended.
