# Search & Navigation (finding things)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian 1.14.4 has two separate "find" engines that share almost no code. (1) A **structured query engine**
(`NL`, internal) that turns a query string into a tree of matcher objects (`ZI` subclasses) and runs it file by file over
`{filename, filepath, content, metadata cache}`. The same engine powers global search, ` ```query ` blocks, the
backlinks filter, and the filter boxes in the outline, tags, bookmarks and file explorer, plus graph groups.
(2) A **fuzzy subsequence scorer** (public `prepareFuzzySearch` / `fuzzySearch` / `prepareQuery` / `prepareSimpleSearch` /
`sortSearchResults` / `renderMatches`) that drives the quick switcher, command palette, `[[` link suggest and every
`FuzzySuggestModal`. Neither engine has an index. Every search reads files linearly in the renderer main thread (no worker).
Three things make that workable: a resumable work queue (`GT`), a time-slicer that yields to `requestIdleCallback`
(`qI`), and a 64 KB-per-file text cache (`cachedRead`). Global search has no relevance ranking: results are
sorted by name, mtime or ctime. Navigation panes (backlinks, outgoing links, tags, outline, bookmarks, file explorer)
are thin views over the metadata cache (`resolvedLinks`, `getFileCache`, `getTags`). They share one virtualized-tree
component (`uO`/`pO`) and one search-results tree (`QW`/`KW`/`XW`/`YW`).

> Evidence convention: every statement below is **observed** in `pretty/app.js` unless it is tagged *(inferred)* or *(unknown)*.
> Line numbers refer to the pretty-printed bundle.

---

## Where it lives

| Minified id | Public / inferred name | Role | Lines (pretty `app.js`) |
|---|---|---|---|
| `sx` | `prepareQuery` | lowercases and splits a query into tokens plus a char list | 43133-43142 |
| `lx` | `prepareFuzzySearch` | closure over `sx` + `hx` | 43143-43148 |
| `hx` | `fuzzySearch` | two-pass (token, then char) match | 43182-43187 |
| `ux` | (internal) in-order greedy matcher + boundary penalty | | 43160-43181 |
| `cx` | (internal) score formula | | 43149-43159 |
| `gx` / `vx` / `fx` | `prepareSimpleSearch` (+ helpers) | AND of space-separated substrings, any order | 43201-43225 |
| `px` | `sortSearchResults` | sort by `match.score` desc | 43188-43192 |
| `mx` / `yx` | `renderResults` / `renderMatches` | wrap ranges in `span.suggestion-highlight` | 43226-43250 |
| `ix` | (internal) sort + merge `[start,end]` ranges | | 43122-43131 |
| `bx` | (internal) line-bounded ±100-char snippet window | | 43251-43267 |
| `wx` | (internal) Tab-completion to the next `/` | | 43268-43275 |
| `UB` | (internal) path-aware fuzzy (basename first, then full path −1) | | 66106-66109 |
| `qI` | (internal) time-slicer ("should pause / pause") | | 51840-51869 |
| `GI` | (internal) whole-word regex builder (Unicode letter/digit class `UI`) | | 51870-51875 |
| `YI` | (internal) match-input record | | 51877-51910 |
| `ZI` | (internal) base matcher (`matchedTokens`, `getContext`) | | 51926-51944 |
| `JI` | TRUE/FALSE/EMPTY literal matcher | | 51944-51963 |
| `eL` | match-anything matcher | | 51963-51982 |
| `aL` | regex matcher (`/…/`) | | 52017-52041 |
| `sL` | property matcher `[key]` / `[key:value]` | | 52041-52103 |
| `lL` | quoted exact-phrase matcher | | 52103-52135 |
| `cL` | plain word matcher (escaped regex, extends `aL`) | | 52135-52153 |
| `uL` / `hL` / `pL` | n-ary group / AND / OR | | 52153-52215 |
| `dL` / `vL` | unary wrapper / NOT | | 52215-52268 |
| `fL` | `<` / `>` comparison (property values only) | | 52230-52254 |
| `gL`,`mL`,`yL`,`bL`,`kL` | recursive-descent parser | | 52269-52421 |
| `CL` | tokenizer | | 52422-52525 |
| `EL` | `match-case:` / `ignore-case:` | | 52526-52542 |
| `SL`,`xL`,`TL` | `path:`, `file:`, `content:` | | 52542-52599 |
| `DL` | content-splitting base (`splitContentMatch`) | | 52599-52630 |
| `AL`,`PL`,`OL`,`FL` | `line:`, `block:`, `section:`, `task*:` | | 52630-52784 |
| `RL` | `tag:` | | 52784-52826 |
| `BL` | operator table | | 52826-52864 |
| `NL` | (internal) compiled search query: `match`, `matchContent`, `matchTag`, `matchFilename`, `matchFilepath` | | 52865-52934 |
| `VL` | (internal) search driver loop over a queue | | 52935-53000 |
| `HL`,`zL`,`qL`,`WL` | sort-order ids, labels, comparators | | 53001-53031 |
| `qT` | array queue with moving offset | | 45248-45293 |
| `_T` | cancellable "runnable" (start/stop/cancel callbacks) | | 45350-45376 |
| `GT` | async-generator work queue | | 45376-45433 |
| `Gj` | live search queue bound to vault/metadata events | | 74165-74223 |
| `tU` / `Zj` | ` ```query ` embedded search block | | 74475-74486, 74804-74842 |
| `QW` | search-results tree root (`dom`) | | 72215-72355 |
| `KW` | one file in results | | 71716-71976 |
| `XW` | one content snippet | | 72045-72215 |
| `YW` | one property-match row | | 71976-72045 |
| `GW` | highlight renderer (`search-result-file-matched-text`) | | 71698-71715 |
| `k2` | search query autocomplete popover | | 99561-99748 |
| `E2` | **Global search** core plugin (`global-search`) | | 99748-99952 |
| `S2` | Search view (`search`) | | 99952-100282 |
| `x2` | "Copy search results" modal | | 100282-100329 |
| `T2` | base for views that follow the active file (backlinks, outgoing, outline, local graph) | | 100329-100404 |
| `OT` / `FT` / `IT` | `SuggestModal` / `FuzzySuggestModal` / chooser list | | 45063-45171, 44877-45024 |
| `D5` | file-suggest modal base (quick-switcher engine) | | 111509-111719 |
| `J5`, `U8`, `A9`, `P9`, `I9`, `zte`, `qte` | D5 variants (embed chooser, "insert text into file", canvas add-note/add-media/add-image, note composer) | | 111897, 115991, 121355-121469, 129584-129731 |
| `rie` / `oie` / `aie` | **Quick switcher** plugin / modal / settings | | 135243-135373 |
| `WB` / `jB` | `[[` link suggest manager / EditorSuggest | | 65671-66105 |
| `dte` / `fte` / `hte` / `vte` | **Command palette** plugin / modal / "pick command to pin" / settings | | 127236-127491 |
| `x8` / `T8` / `D8` | **Backlinks** plugin / view / linked+unlinked component | | 113368-114192 |
| `_te` / `Gte` / `Kte` | **Outgoing links** plugin / view / component | | 129762-130305 |
| `Jte` / `ene` / `Zte` | **Outline** plugin / view / tree item | | 130376-130837 |
| `tre` / `sre` / `ore` | **Tags** plugin / view / tag item | | 140334-140682 |
| `h9` / `c9` | **Bookmarks** plugin / view (note: `c9` is the bookmarks view, not the file explorer) | | 120346-121217 |
| `Mte` / `RO` / `FO` / `PO` / `LO` | **File explorer** plugin (`this.id = "file-explorer"`) / view (type const `OO = "file-explorer"`, 54225) / tree controller (`pO` subclass, `prefersCollapsed`) / file item / folder item (both on base item `DO`, 54079) | | 128122-128223, 54079-55076 |
| `uO` | virtualized variable-height tree scroller ("infinityScroll") | | 53357-53622 |
| `pO` | tree controller (selection, keyboard nav, filter, folds) | | 53638-53869 |
| `ZL` | ordered child list (`vChildren`) | | 53207-53252 |
| `P3` | recent-files tracker (`lastOpenFiles`) | | 106547-106625 |
| `$W` / `r_` / `F0` | reading-view find bar / CM6 find-replace panel / PDF find bar | | 72355-72500, 78044-78192, 97167-97355 |

---

## How it works

### 1. Query language: tokenizer (`CL`, app.js:52422)

The tokenizer scans the string once, left to right. It produces tokens `{type, content, pos}` (observed):

| Trigger at token start | Token type | Notes |
|---|---|---|
| `"` | `quote` | reads to the next unescaped `"`. Backslash escapes *any* next char. An unterminated quote runs to end of input. |
| `/` | `regex` | reads to the next unescaped `/`. `\/` becomes `/`, `\\` is kept as `\\`, every other escape passes through unchanged. Unterminated runs to end. |
| `-` | `not` | only at **token start**. A `-` inside a word (`foo-bar`) is literal. |
| otherwise | accumulates a word | the word ends at a space, or at `[ ] ( ) : < >`, and each of those becomes its own token: `bracket`, `parenthesis`, `colon`, `lessthan`, `greaterthan`. |

The finished words `TRUE`, `FALSE`, `EMPTY` and `OR` become `true` / `false` / `empty` / `or` tokens. This
is **case-sensitive**: lowercase `or` is a plain word (app.js:52424). **Only the ASCII space separates words.** Tabs and newlines
stay inside the word (observed). The embedded ` ```query ` block works around this by replacing newlines with spaces first
(app.js:74821). `wL` (app.js:52413) gives a token's end offset, adding 2 for the delimiters of quote and regex tokens. The
autocomplete uses this end offset.

### 2. Grammar and parser (`gL`→`mL`→`yL`→`bL`, app.js:52269-52421)

The parser is recursive descent over the token array. It keeps state `{tokens, pos, operatorStack, operators}`. Precedence, observed:

```
orExpr   := andExpr ( "OR" andExpr )*          -> pL (OR)   [mL]
andExpr  := unary+                              -> hL (AND)  [yL]  (implicit AND by juxtaposition)
unary    := "-" unary                           -> vL (NOT)
          | (">"|"<") unary                     -> fL
          | word ":" unary                      -> operator from BL table
          | "[" orExpr? ( ":" orExpr )? "]"     -> sL (property)
          | "(" orExpr ")"                      -> group
          | word | "quoted" | /regex/ | TRUE|FALSE|EMPTY
```

* `a b OR c` parses as `(a AND b) OR c`. NOT binds to a single unary.
* A one-element AND or OR collapses to its only child. An empty group, or an operator with nothing after it, becomes `cL("")`,
  a matcher that matches nothing.
* A missing `)` or `]` is tolerated: the group closes at the end of input. A stray `)`, `]`, `OR` or `:` ends the
  current unary and returns null. That is how groups terminate.
* `text` followed by `colon` is treated as an operator **only when not inside `[...]`**. An unknown name throws
  `Operator "<x>" not recognized`, so a bare URL like `http://x` is a parse error unless quoted (observed). A bad regex throws
  `Failed to parse regular expression. …`. Leftover garbage throws `Failed to parse, error at <pos> "<text>"`.
  The search view catches these errors and prints the message in the info area (app.js:100237-100240).
* Exclusive operators cannot nest (`file:(content:x)` → `Operator "content" cannot be nested within "file"`). The exceptions
  are `section:` (`allowSelf`, so `section:(section:…)` is legal) and the non-exclusive `match-case:` / `ignore-case:`
  (app.js:52316-52321). Brackets cannot nest (`Property cannot be nested within a property.`).
* Each matcher records the tokens it consumed in `matchedTokens`. `getContext(cursorPos)` walks the tree and
  returns `{matcherStack:[innermost…outermost], token}` for the token under the cursor. The query autocomplete uses this
  (§5.3).

### 3. Operator table (`BL`, app.js:52826-52864)

| Operator | Class | Exclusive | What it restricts | `requiredInputs` |
|---|---|---|---|---|
| `match-case:` / `ignore-case:` | `EL` | no | clones the input with `caseSensitive` forced on/off | from child |
| `path:` | `SL` | yes | input keys → `["filepath"]` | `{}` (none) |
| `file:` | `xL` | yes | keys → `["filename"]` | `{}` |
| `content:` | `TL` | yes | keys → `["content"]` | `{content:true}` |
| `line:` | `AL` | yes | runs the child on each `\n`-separated line separately (so `line:(a b)` = both on one line) | content |
| `block:` | `PL` | yes | runs on each non-`list` cache section and on each `listItem` separately | content |
| `section:` | `OL` | yes + self | runs on each heading section (see below) | content |
| `task:` / `task-todo:` / `task-done:` | `FL` | yes | runs on each list item that has a checkbox. todo = `task === " "`, done = any other status char (so `[-]`, `[>]` count as done) | content |
| `tag:` | `RL` | yes | must be followed by plain text (else `Operator "tag" can only be followed by text`) | content |
| `[key]`, `[key:value]` | `sL` | – | frontmatter properties | `{}` |

**`section:` details** (app.js:52692-52750, observed). The sections are computed from `cache.headings`. Each section runs from one heading's
start offset to the **next heading of any level**, so subsections are *not* included in a parent's text. Any text
before the first heading becomes a pseudo-section. Each section also records `children` = the number of following headings with a deeper
level. When `section:` nests inside `section:`, a private data slot on the input (`IL`) carries
`{sections, index}`, and the inner matcher only iterates the outer section's descendant sections. A file with no headings is
treated as one section at top level, and as no match when nested.

**`task:` with an empty quoted string** (`task:""`) is rewritten to the match-anything matcher `eL`. It lists every task, each
with a zero-length range. Bare `task:` matches nothing (app.js:52750-52775, observed).

**`tag:`** (app.js:52784-52826): prepends `#` if missing and builds `^#<escaped>($|\/)` with the `i` flag **always**. Tags are
therefore case-insensitive even under match-case, and `tag:#a` matches `#a` and nested `#a/b` but not `#ab`. It tests inline
`cache.tags` (and returns their offsets) and frontmatter tags. Frontmatter tags are normalised by the `tags` helper `bm` (app.js:34248), which drops
values containing spaces and prefixes `#`. Frontmatter hits are reported as `properties:[{key:"tags"}]`. The "tag" input key
(used by the tag pane filter, `matchTag`) is tested first.

**Property matcher `sL`** (app.js:52041-52103). For every frontmatter key it runs the **key** sub-matcher on a clone whose keys are
`["propertyName"]`. A plain word matches as a substring of the key (regex). A quoted word must equal the key
case-insensitively (`lL` special-cases `propertyName`). Then, if a value matcher exists, it runs on a clone made by
`cloneForPropertyContent(value)`: keys `["content"]`, `content = String(value)`, and the raw value in a private slot (`LL`).
Arrays are tested element by element, and the index is recorded as `subkey:[i]`. Value literals:
`TRUE`/`FALSE` compare the raw value strictly with `true`/`false`. `EMPTY` matches raw `null`. `>x` / `<x` compare the raw value with the
*query string* using JS relational operators. Numbers therefore compare numerically (string coerced) and strings compare
lexicographically, which suits ISO dates (inferred). Result: `{properties:[{key, subkey?, pos?}]}`.

### 4. Matcher contract, tri-state results, combination

Each matcher implements `match(input) → result | null | undefined`, `getInfo()` (human text for "Explain search"),
and `requiredInputs()` (observed):

* **object**: a match. A map from input key to an array of `[start, end]` ranges, e.g.
  `{filename:[[0,4]], content:[[120,125],[300,305]], properties:[…], "canvas-<nodeId>":[…]}`. `{}` means a match with no
  positions.
* **null**: definitely no match.
* **undefined**: *not applicable*. The input lacks the key this operator needs, for example a `file:` term inside the outline filter, which
  only supplies `content`. `NL._match` converts a top-level `undefined` into `{}` (match). An inapplicable term is
  therefore **ignored**, not failed (app.js:52922-52932).

Combinators, observed:
* **AND (`hL`)**: any child returning `null` → `null`. `undefined` children are skipped. Ranges from all children are concatenated per key (`$I`).
* **OR (`pL`)**: the first non-undefined result is adopted, and later matches are merged into it. All undefined → undefined.
* **NOT (`vL`)**: undefined → undefined. A match → `null`. `null` → `{}` (a match without positions).
* `DL.splitContentMatch` (used by line/block/section/task) runs the child on each fragment. It shifts the child's content ranges
  by the fragment's offset, or records a zero-width `[off,off]` if the child matched with no content ranges. It returns a match if any
  fragment matched, `undefined` if any fragment was undefined, and `null` otherwise.

After matching, `NL._match` normalises each standard key with `ix`: sort by start, then merge ranges that overlap **or touch**. `ix`
sorts its input in place and widens the kept range objects in place, but returns a new merged array (app.js:43122).

### 5. The match input (`YI`) and what each file type exposes

`YI` (app.js:51877) holds `strings` (a key→string map), `original` (the full text), `keys` (which strings plain terms may search),
`caseSensitive`, `cache` (the metadata cache entry) and `data` (a private `Map` keyed by sentinel objects `IL` and `LL`). `clone()` is shallow.
Operators restrict a clone's `keys`. **They do not change `strings`**, so `file:` can still see `filename` even though the
default key list excluded it.

`NL.match(file, text)` builds the input (app.js:52874-52905, observed):
* `strings = {filename: file.name, filepath: file.path, content: text}`.
* Default keys: `"filename"` **only for `md`, `canvas` and `base`** (the guard is `Ix(ext)`, true for any *other* extension), and `"content"` only for `md`.
  **Plain words therefore never match attachment names.** Images and PDFs are found only through explicit `file:` or `path:`.
* `cache = metadataCache.getFileCache(file)` for md only.
* **Canvas** (when the Canvas plugin is enabled): the JSON is parsed, and each `type:"text"` node is matched as its own input. That input uses
  the per-node metadata cache from the canvas plugin's index (`index.get(file).caches[nodeId]`). Results go under
  `canvas-<nodeId>`. A separate content-less input is matched for the filename.
* Other entry points (app.js:52906-52921): `matchContent(s)` (keys `["content"]`, used by the outline, tags and bookmarks filters),
  `matchTag(s)` (key `tag`), `matchFilename(path)` and `matchFilepath(path)` (used by the file explorer filter and graph attachment
  nodes).

### 6. Case, word boundaries, Unicode

* The default is case-insensitive. The view's "Match case" toggle constructs `NL` with `caseSensitive=true`. Regexes are compiled with
  `gm` or `gmi` and cached in two dictionaries, one per case mode (`rL`, app.js:51986). Every `_match` call re-arms a 60-second
  idle debounce that clears both caches (`iL`, app.js:51982). There is no `u` flag, so `\p{…}` classes do not work in `/regex/`
  queries (inferred).
* **A plain word** (`cL`) is a regex-escaped substring, so `cat` matches `concatenate`.
* **A quoted phrase** (`lL`) is a substring in filename and filepath, but in **content it is whole-word**. `GI(text)`
  (app.js:51870) adds `(?:^|[^<letters+digits>])` before the phrase when it starts with a letter or digit, and `(?![<letters+digits>])` after it
  when it ends with one. Match offsets use capture group 1, so the boundary char is not highlighted (`oL` with flag,
  app.js:51992-52016). The letter class `WI` is a large Unicode letter table. It **excludes the main Han block (U+4E00-9FD5), hiragana/katakana,
  Hangul syllables and Tibetan**, so phrases in those scripts get no boundary constraint, which suits languages without spaces (observed: those ranges appear in a separate
  `jI` table that `UI` does not include; `jI` is used by word-count, app.js:141258). `WI` does still include CJK Ext-A (U+3400-4DB5), Bopomofo and
  Hangul compatibility jamo, so those do get boundaries (observed, app.js:51870).
* **No diacritic folding or Unicode normalisation** happens anywhere in the query engine or the fuzzy scorer. No `normalize` calls exist in
  43k or 51.9k-53k. Vault paths themselves are NFC-normalised elsewhere (app.js:24168). The PDF viewer alone offers a
  `matchDiacritics` option (§12).

### 7. Execution: queue, time-slicing, liveness

**Driver `VL(app, requiredInputs, queue, onFile, onPause)`** (app.js:52935-53000, observed):
1. Creates a slicer `qI({maxDelay:100})`, i.e. `batchSize 10`, `duration 5 ms`, `maxDelay 100 ms`.
2. Iterates `queue.generator()` (async). For each file it skips `metadataCache.isUserIgnored(path)` ("Excluded files") and
   unsupported files.
3. Reads text with `vault.cachedRead(file)`. This happens **only if the query's `requiredInputs.content` is true** and the file is md or canvas, so
   `file:`, `path:` and `[prop]` queries never touch the disk. Read errors are logged and treated as empty text.
4. Checks `runnable.isCancelled()`, then awaits `onFile(file, text)`.
5. `qI.shouldPause()` returns true when `processed % batchSize == 0` and more than `duration` has elapsed. It then calls `onPause`, and
   `qI.pause()` waits on `SC(cb, maxDelay)`. That helper is `requestIdleCallback` with a timeout of `maxDelay`, racing a `setTimeout(maxDelay)`, or `requestAnimationFrame`
   when `maxDelay` is 0 or `requestIdleCallback` is missing (app.js:37677). The `qI` defaults are `batchSize 10, duration 5 ms, maxDelay 0` (app.js:51844). After the pause it resets the clock.

**Work queue `GT`** (app.js:45376-45433): a `qT` FIFO (an array plus a moving offset, compacted when the offset passes half the length,
app.js:45248) behind an **infinite async generator**. While items exist it marks the runnable running (`onStart`) and
yields them one at a time. When the queue drains it calls `runnable.stop()` (`onStop`) and *suspends* on a deferred promise. A later
`add()` / `addList()` resolves that promise on a `setTimeout(0)`, so the same search keeps running for newly changed files. `cancel()`
ends the generator. `_T` (app.js:45350) is the start/stop/cancel state machine with callbacks.

**Live search binding `Gj`** (app.js:74165-74223) owns one `GT` per running search. `start()` sorts `vault.getFiles()` by
the current sort order **before** enqueueing, so results arrive roughly in display order. It also subscribes to:
* `vault` `create` and `modify` → re-queue **non-md** files only,
* `metadataCache` `changed` and `vault` `rename` → re-queue the file (md is re-queued only after its cache is rebuilt, so
  `content` and `cache` agree),
* `vault` `delete` → remove from the queue and from the results.

Each time a file is processed again, its result is either replaced or removed (`dom.addResult` / `removeResult`). An open search
panel therefore updates live as you type in notes (observed).

**Text cache**: `cachedRead` returns a per-`TFile` `WeakMap` entry. A file is cached only when its text length is at most `vault.cacheLimit` =
**65536** (app.js:50318-50323, 50400). Larger notes are re-read from disk on every search pass (inferred cost).

**Hidden-panel throttle**: if the search pane was visible at the last pause but is now hidden, the per-file callback
awaits `el.onNodeInserted(...)`, which suspends the scan until the panel is shown again (app.js:100214-100230, inferred from code).

**Not in a worker**: `worker.js` contains no search code. The app's workers are the "Metadata Cache Worker" (`worker.js`,
app.js:62691), the "Graph Worker" (`sim.js`, app.js:88592) and word-count's inline Blob worker (app.js:141292); none of them searches.
Search, fuzzy matching and unlinked mentions all run on the UI thread (observed).

### 8. Global search plugin `E2` and view `S2`

**Plugin `global-search`** (app.js:99748-99952). Default on. It registers:
* Command `global-search:open`, hotkey `Mod+Shift+F`. It pre-fills the query with the window selection or the editor selection,
  quoted if the selection contains a space. Quirk: this command escapes only the *first* `\` and `"` (non-global `replace`), while the editor
  context-menu path escapes all of them (app.js:99763-99778 vs 99934-99939, observed).
* View type `search`, ensured in the left sidebar on `layout-ready`.
* Folder context menu "Search in folder" → `path:"<folder>/" `. Editor selection menu "Search for '<sel>'".
* `openGlobalSearch(query)` → `workspace.ensureSideLeaf("search","left",{state:{query}})`. `getGlobalSearchQuery()` reads
  the leaf state. The tags pane and search bookmarks use this for Mod-click "add/remove term" toggling.
* New CLI handlers (`registerCliHandler`): `search`, `search:context` and `search:open`, with options `query`, `path`, `limit`, `total`,
  `case`, `format=text|json` (app.js:99834-99896). The CLI path differs from the view: it iterates `getMarkdownFiles()`
  sequentially with no queue, and returns `{file, matches:[{line, text}]}`. Line numbers are computed by splitting the text before each
  match (app.js:99795-99832).
* Plugin data `global-search.json` stores only the copy-results options (§8.5).

**View `S2`** (app.js:99952-100282):
* UI: `SearchComponent` with a "Match case" right decorator (`uppercase-lowercase-a`), a settings toggle, and three toggles: Collapse results,
  Show more context, Explain search terms. A result-count button opens a menu with "Copy search results" and fires the workspace
  event **`search:results-menu`** (bookmarks hooks in here). A sort dropdown offers the 6 orders from `HL`.
* Typing: `onChange` stops the running search, then starts a new one through `debounce(startSearch, 0)` (next tick). Clearing the box
  stops immediately. Enter forces a start. `startSearch` empties the results, compiles `new NL(app, query, matchingCase)`, renders
  "Explain search" (`renderSearchInfo` walks the tree and prints `getInfo()`, with `Key:`/`Value:` children for properties),
  starts the queue, and calls `VL`. The result count text updates on each pause and on queue stop.
* History: `requestSaveSearch = debounce(saveSearch, 5000, resetTimer)` saves the query to per-vault localStorage key
  **`<appId>-recent-searches`**, de-duplicated, newest first, **max 20**. The autocomplete shows the history when the box is empty.
* Keyboard (own `Scope`): Enter or Mod+Enter opens the focused result (Mod = new tab), arrows move focus, Left/Right collapse or expand, and
  Shift+Up/Down shows more context on the focused snippet.
* View state persisted in `workspace.json`: `query, matchingCase, explainSearch, collapseAll, extraContext, sortOrder`.

**Sort orders** (`HL` / `qL`, app.js:53001-53031): `alphabetical` / `alphabeticalReverse` (by `basename` with
`Intl.Collator(undefined,{usage:"sort",sensitivity:"base",numeric:true})`, `BT`), `byModifiedTime` / `…Reverse` (mtime desc/asc) and
`byCreatedTime` / `…Reverse`. An unknown id falls back to alphabetical. **There is no relevance sort.**

#### 8.3 Query autocomplete (`k2`, app.js:99561-99748)

The autocomplete is a `PopoverSuggest` attached to the input on desktop (mobile has a button). It only opens when the selection is collapsed and the cursor is at
the end or before a space. It tokenizes and parses the text up to the cursor, then asks `getContext(cursor)`:
* inside `[...]` key position → fuzzy-ranked (`prepareFuzzySearch`) property names from `metadataTypeManager.getAllProperties()`.
  Enter inserts `"key":`, Shift+Enter inserts `"key"] `.
* after `tag:` → fuzzy-ranked tags from `metadataCache.getTags()`.
* after `path:` → fuzzy-ranked folder paths.
* otherwise → operator list `path: file: tag: line:() section:() [property]`, filtered by prefix (the list lacks `content:`, `block:`,
  `task*:` and `match-case:`), then history.
Inserted strings containing `[]():` or whitespace are auto-quoted (app.js:99717).

#### 8.4 Results tree (`QW`, `KW`, `XW`, `YW`)

* `QW` (app.js:72215) holds `vChildren` (one `KW` per file), a `resultDomLookup: Map<TFile,KW>` and a virtualized scroller `uO`.
  `addResult` replaces any existing row for the file and keeps its collapsed state. `onChange` is debounced (0 ms): it re-sorts children
  with `WL(sortOrder)` and toggles the empty state. `getMatchCount()` sums the lengths of *all* range arrays (filename, filepath, content,
  propertyName, tag, properties) over all files. **"N results" counts matches, not files** (observed, `QI` app.js:51911).
* `KW` (file row) title. If `filepath` matched, the full path is shown with filepath and filename ranges merged (filename
  ranges shifted by the dir length). Otherwise the name is shown (the basename for md if all matches fit inside it). A flair shows the match count excluding
  filename hits. Rows are draggable as files. Hover triggers `hover-link` with `source:"search"` and a scroll hint. The context menu uses
  `handleLinkContextMenu` plus "Delete".
* **Snippet construction** (`renderContentMatches`, app.js:71791-71874):
  * Default ("less context"): `bx(content, match)` gives the same line only, extended at most **100 chars** each side, with `...` truncation
    flags (app.js:43251).
  * "Show more context" (`getMatchExtraPositions`, app.js:71875-71922), in order of preference: (a) if the match is inside a list item,
    the item's line start through the end of its **nested child items**, using the `parent` line links. (b) Else, if inside a cache
    section, the whole section. (c) Else, scan up to ±1000 chars to line ends. If that line is a list item (`dR` finds a bullet or number
    marker), extend through the following lines whose leading `>`/whitespace prefix is longer, i.e. its nested lines. Otherwise expand to the
    blank-line-delimited paragraph (`/\r?\n\r?\n/y`), still capped at ±1000 chars.
  * Consecutive matches that start before the current snippet's end are folded into the same `XW` (which grows if needed) unless
    `separateMatches` is set. Backlinks' unlinked mentions set it.
  * Property matches are grouped by key into `YW` rows that render `key: value` with highlights. Clicking one opens with
    `eState.propertyMatches`.
* `XW` (snippet) has chevrons to grow the window by one list item, section or line up or down (`getPrevPos` / `getNextPos`).
  Clicking opens the file with `eState.match = {content, matches}`. Before opening, an optional `mutateEState` runs, which canvas uses to add `nodeId`.
* **Landing on a match** (`setHighlight`, app.js:114288-114333): the editor converts content offsets to positions in batch
  (`mR`), adds `is-flashing` highlights, puts the cursor on the first match and scrolls it into view. Offsets refer to the text
  snapshot read at search time (inferred: they can drift if the file changed since).

#### 8.5 Copy results (`x2`, app.js:100282)

The modal builds a list of result files. Options are saved in `global-search.json`: `showFullPath` (path vs `getShortName()`),
`linkStyle` (`none|wikilink|markdown`) and `listStyle` (`none|-|*|num`).

#### 8.6 Embedded ` ```query ` blocks (`Zj`/`tU`, app.js:74475, 74804)

In reading view and live preview (`"query" === lang`, app.js:112244), the block is replaced by `div.internal-query` with a header
and a `QW`. It uses its own `Gj` live queue and the same `VL` driver, case-insensitive, with newlines → spaces. **Self-match guard**: when
scanning the note that contains the block, every ` ```query … ``` ` region is overwritten with spaces of equal length before matching. Offsets stay valid
and the query does not match itself (app.js:74826-74829). The block has no options syntax (sort and collapse are not configurable).

#### 8.7 Other users of `NL`

The same compiled query is used by: backlinks filter (`passSearchFilter(file, content)`), outline filter (`matchContent` on
`#H1#H2#H3` heading paths), tags filter (`matchContent(tag)`), bookmarks filter (`matchContent(group/title path)`), file explorer
filter (`matchFilepath`), graph groups/filters (with their own `GT` queue, `matchTag` for tag nodes, `matchFilename` for
attachments, app.js:100830-100940), and two more panes (app.js:131390, 137240, 137902; publish uses `matchFilepath`).

### 9. Fuzzy search (quick switcher, command palette, link suggest)

#### 9.1 `prepareQuery(q)` (`sx`, app.js:43133)

1. `t = q.toLowerCase()`.
2. **Tokens**: whitespace (`/\s/`) splits words. Each **punctuation** char (`rx` = U+2000-206F, U+2E00-2E7F, and
   ``\'!"#$%&()*+,-./:;<=>?@[]^_`{|}~``) and each **CJK** char (`ax` = Tibetan, kana, CJK Ext-A, CJK Unified, CJK Compat, half-width
   katakana) becomes its own single-char token. Example: `foo.bar baz` → `["foo", ".", "bar", "baz"]`.
3. **fuzzy**: the array of all non-space chars of `t`.
Result: `{query: q, tokens, fuzzy}`.

#### 9.2 `fuzzySearch(prepared, text)` (`hx`, app.js:43182)

* Empty query → `{score: 0, matches: []}`.
* Pass 1: `ux(tokens, …, isFuzzy=false)`. If that returns null, pass 2: `ux(fuzzy chars, …, isFuzzy=true)`. Whole-token matches are tried
  first and single-char subsequence is the fallback.

`ux(units, query, text, isFuzzy)` (app.js:43160, observed):
* Lowercases `text` for searching, but uses the original-case text for boundary tests.
* For each unit **in order**, finds `indexOf(unit, cursor)`, where `cursor` = end of the previous unit's match.
  The match is **greedy-leftmost, order-sensitive, non-backtracking**: `note my` does not match `My Note` in either pass.
  If any unit is missing → `null`.
* **Mid-word penalty** `o`: for a match starting at `u > 0` whose char `h` is neither punctuation nor CJK, with `p` the char before it:
  * if `h` is upper case **and** `p` is upper case (inside an ALLCAPS run) → penalise;
  * else if `h` is lower case **and** `p` is not punctuation, not whitespace and not CJK (inside a word) → penalise;
  * an upper-case `h` after a lower-case `p` (a camelCase hump), anything after a space or punctuation, digits, and the first char are **not** penalised;
  * in fuzzy mode a char that is contiguous with the previous match (`u === cursor`) is never penalised.
  Each penalised unit adds 1 to `o`.
* Ranges: a new `[u, u+len]` starts unless it is contiguous with the last range, in which case it is extended.

#### 9.3 Score (`cx`, app.js:43149)

Let `R` = ranges, `Q` = query length (**including spaces**), `T` = text length, `o` = mid-word count:

```
score = 0
      − (R.length − 1)                              // 1 point per gap between matched runs
      − o / 10                                      // 0.1 per mid-word start
      − (R.last.end − R.first.start + 1 − Q) / 100  // 0.01 per char of spread beyond query length
      − R.first.start / 1000                        // 0.001 per char before the first match
      − T / 10000                                   // 0.0001 per char of candidate length
```

Higher is better, and the score is ≤ 0 in practice. The weights are lexicographic in spirit: number of gaps ≫ mid-word starts ≫ spread ≫ position ≫
length.

Worked example (inferred from the formula): query `mn` vs `My Note`. Pass 1 (`"mn"` substring) fails. Pass 2 matches `m`@0 and `n`@3 with no
penalties (both are word starts), so R = `[[0,1],[3,4]]`. Score = −1 − 0 − (4−0+1−2)/100 − 0 − 7/10000 = **−1.0307**. The query
`note` vs `My Note` matches in pass 1 at 3 with no penalty: score = −0 − 0 − (7−3+1−4)/100 − 3/1000 − 7/10000 = **−0.0137**.

#### 9.4 `prepareSimpleSearch(q)` (`gx`/`vx`/`fx`, app.js:43201-43225)

Splits the lowercased query on single spaces. **Every** word must occur somewhere (any order). All occurrences are collected
(the scan resumes at `pos + len + 1`), merged with `ix`, and scored with `cx(ranges, Q, T, 0)`, so there is no mid-word penalty.

#### 9.5 `sortSearchResults(results)` = in-place sort by `match.score` descending (stable in V8, so ties keep input order).

`renderMatches(el, text, ranges, offset)` builds a fragment, wrapping ranges in `span.suggestion-highlight`. It clamps ranges to the
text and supports a negative `offset` (the command palette uses it to highlight the part after `"Plugin: "`).

#### 9.6 Path-aware variant `UB(fuzzyFn, path)` (app.js:66106)

`UB` first fuzzy-matches the **last path segment** and shifts the ranges to full-path coordinates. If that fails, it matches the full path and
subtracts **1**. A basename hit therefore usually beats a folder-path hit.

### 10. Quick switcher (`switcher`) and the `D5` family

**Plugin `rie`** (app.js:135243). Command `switcher:open`, hotkey `Mod+O`, ribbon icon. Only one modal is open at a time (`activeModal`).
Settings in `switcher.json`, defaults `{showExistingOnly:false, showAttachments:true, showAllFileTypes:false}`. The last option is
visible only if the vault config `showUnsupportedFiles` is on.

**Candidate generation `D5.getSuggestions(q)`** (app.js:111571-111646, observed). The scan is synchronous on every keystroke, with no debounce and
no index:
* **Empty query** → `workspace.getRecentFiles({…type filters})`, up to 10, minus excluded files. No scoring.
* Otherwise, for each `vault.getFiles()` entry passing the type predicate (md → `shouldShowMarkdown`, canvas/base →
  `shouldShowNonAttachments`, images → `shouldShowImages`, other → `shouldShowAllTypes || (shouldShowNonImageAttachments &&
  registry.isExtensionRegistered(ext))`):
  * `type:"file"`: `UB(prepareFuzzySearch(q), pathWithoutMdExtension)`;
  * `type:"alias"`: one per frontmatter alias (`aliases` key, case-insensitive), plain fuzzy on the alias text;
  * files under "Excluded files" are kept but get **−10** and are rendered `mod-downranked`.
* `type:"unresolved"`: when `shouldShowUnresolved` is set, every distinct unresolved link target in `metadataCache.unresolvedLinks`.
* `type:"bookmark"`: if the Bookmarks plugin is on, bookmarks are matched by `groupPath + title`. File bookmarks are included only when they
  have no subpath and pass the type predicate. Others are included only when `shouldShowNonFileBookmarks` (quick switcher: true, groups excluded).
* `sortSearchResults`, then the modal truncates to `limit` = **20** (`OT` default 100).
* **No recency boost when typing** (observed). Recency only fills the empty-query list. (The CLI `__files` completer is different: it puts
  recent files first, but keeps them in vault order rather than recency order, app.js:58559.)

**Keys and creation** (`oie`, app.js:135304):
* Enter opens the selection, and Mod+Enter opens it in a new tab (`getLeaf(isModEvent)`). Files and aliases → `openFile`. Unresolved →
  `openLinkText(linktext, activePath)`. Bookmark → `bookmarks.openBookmark`.
* **Shift+Enter** (and Mod+Shift+Enter) chooses `null`, which calls `workspace.openLinkText(inputValue, activePath, newTab)`. That
  creates the note (folder rules apply via the link-resolution path).
* No results with non-empty input and `supportsCreate` → a single `null` row reading "Enter to create".
* **Tab** autocompletes the input to the selected item's path, cut just after the next `/` following the last highlighted char
  (`wx`). If it is already equal, Tab appends `/`. This works as folder drilling (app.js:111524-111537).
* Rows are draggable as links (`dragManager.dragLink(path, "", alias)`).

**Variants** (all subclass `D5` and only flip flags and `onChooseSuggestion`):
`J5` "choose file to insert" embed picker (images only, `context:"embed"`). `U8` "insert received text into file" (md + unresolved,
creates via `createNewMarkdownFileFromLinktext`, then `insertIntoFile`). `A9` canvas "add note from vault" (create allowed,
attachments toggle). `P9` canvas "add media" (non-md). `I9` canvas "add image". `zte` / `qte` are note-composer target pickers
(merge / extract; role inferred from their `composer` fields).
`context` selects which registry decides "supported" extensions: `viewRegistry` for opening, `embedRegistry` for embedding.

### 11. Command palette (`command-palette`)

* Command `command-palette:open`, hotkey `Mod+P`, ribbon. The modal `fte` is a `FuzzySuggestModal` with `limit` 100, matching on `command.name`
  (`"Plugin: Command"`). The full name is fuzzy-matched in one pass. Rendering splits at `": "` into a prefix span and a name span, with a shifted highlight
  offset.
* **Item list** (`getCommands`, app.js:127340-127364), cached for the life of the modal (`commands=null` on open and close).
  `app.commands.listCommands()` runs every command's `checkCallback(true)`, so only applicable commands show (exceptions logged, app.js:115157).
  Pinned commands come first, in the user's pinned order. The rest are sorted by name with the collator, then **stably reordered by recency** (`pte`:
  index in `recentCommands`, otherwise ∞). Empty query = pinned, then most-recent-first, then A→Z. With a query, the fuzzy score
  decides and this order breaks ties.
* `sortSuggestions` adds `name.length / 10000` only when `score > 0`. Fuzzy scores are almost never positive (they can exceed 0 only when
  the query has extra spaces), so this tweak is effectively dead (inferred).
* Choosing a command in the palette runs it through `R8` (`checkCallback(false)` or `callback()`) and moves the id to the front of `recentCommands`, which is capped at **100** and stored in
  localStorage key **`<appId>-recent-commands`** (app.js:127436-127445). Commands run by hotkey or from elsewhere do **not** update this list (observed: it is only written there). Pinned ids live in `command-palette.json` `{pinned:[ids]}`, edited in the settings
  tab, which uses `hte`, a picker of not-yet-pinned commands. Hotkeys are shown as `kbd.suggestion-hotkey`, using custom ones, else the defaults.

### 12. In-file find (brief)

* **Editor (CM6)** `r_` (app.js:78044): find and replace with plain **case-insensitive substring** search. It uses CM6's `SearchCursor` with a
  `toLowerCase` normaliser and **no regex** support. Counting is capped at 9999. Backwards search scans in 10 000-char windows (app.js:94922-94936).
  Highlights use `obsidian-search-match-highlight`. Keys: Enter / Shift+Enter, Alt+Enter = select all matches, Mod+Alt+Enter = replace all.
* **Reading view** `$W` (app.js:72355): lowercase `indexOf` over each rendered section's text nodes. F3 / Mod+G steps through matches, with `n / total`
  shown.
* **PDF** `F0` (app.js:97167): wraps pdf.js's find controller via its `eventBus`. Options `highlightAll, caseSensitive,
  matchDiacritics, entireWord` persist in localStorage `pdfjs-search-settings`.

### 13. Backlinks (`backlink`)

**Plugin `x8`** (app.js:113368): view type `backlink` in the right sidebar. Commands `backlink:open`,
`backlink:open-backlinks` (split with a view linked to the current file) and `backlink:toggle-backlinks-in-document`.
**Status bar**: on `file-open` and `metadataCache` `resolved`, it sums `resolvedLinks[src][thisPath]` over every other source.
That counts link *occurrences*, not files, in an O(#files) scan (observed). Data `backlink.json` `{backlinkInDocument}` → `workspace.backlinkInDocument`.
**In-document backlinks** mount the same `D8` component into `div.embedded-backlinks` inside the Markdown view
(app.js:114428, 114696). They are toggled per view through the view state `backlinks`.

**Component `D8`** (app.js:113583-114192) renders two `QW` trees, "Linked mentions" and "Unlinked mentions" (collapsed by default).
It has buttons for collapse-all, more context, sort (the same 6 orders) and a filter box (`debounce(updateSearch, 300, reset)`, any
`NL` query). Panel state: `collapseAll, extraContext, sortOrder, showSearch, searchQuery, backlinkCollapsed, unlinkedCollapsed`.
A collapsed section is not computed at all.

**Linked mentions** (`recomputeBacklink`, app.js:113839):
1. Candidate files are md plus any extension with a registered `metadataCache.linkUpdaters` entry (canvas), pre-sorted by sort order and fed
   to a `GT` queue.
2. A cheap prefilter yields only files where `resolvedLinks[file.path][target.path]` exists. Others are removed from the results.
3. Survivors are read (`vault.generateFiles(gen, cached=true)` wraps the generator and adds `cachedRead` content). The
   filter query is applied. Then every reference in `frontmatterLinks`, `links` and `embeds` (`jm`) is **re-resolved** with
   `getFirstLinkpathDest(linkpathWithoutSubpath, sourcePath) === target`. Body references contribute `content` ranges.
   Frontmatter link references contribute `properties` rows: the `key` is split on `.`, and numeric parts become array indices (`subkey`).
   Canvas files use the canvas index's per-node caches (`canvas-<id>` ranges) and file embeds.
4. The slicer is `qI({batchSize:2, maxDelay:100})`. Events: `metadataCache` `resolve` re-queues that file, `vault` `rename` re-queues it or
   recomputes everything if the renamed file is the target, `vault` `delete` removes it.

**Unlinked mentions** (`recomputeUnlinked`, app.js:114044), observed:
1. Patterns: `new RegExp(GI(basename), "gi")` plus one per frontmatter alias. They are **whole-word, case-insensitive, Unicode-letter
   boundaries**. The alias JSON is remembered, and a later metadata change to the target re-runs the scan only if the aliases changed.
2. Scans **every markdown file** except the target itself and excluded files. Applies the filter query. Runs each regex over the
   full text.
3. Drops a hit that lies inside any existing `links` / `embeds` range (`Wm`), *regardless of where that link points*, or inside the
   frontmatter block. Hits inside code blocks, inline code, URLs and similar are **not** excluded (inferred: there is no check against sections).
4. Each hit is its own snippet (`separateMatches`) with a **"Link"** button (`onMatchRender`). The button reads the file fresh, splices
   `fileManager.generateMarkdownLink(target, sourcePath, "", matchedText)` at the stored offsets, and calls `vault.modify` (app.js:114160-114190).
   This respects the user's wikilink/markdown and relative-path settings, and keeps the original text as the alias.
5. Slicer `qI({maxDelay:100})`. Vault `create` and `modify` re-queue files.

### 14. Outgoing links (`outgoing-link`)

`_te` / `Gte` / `Kte` (app.js:129762-130305). It follows the active file (`T2`). State: `linksCollapsed, unlinkedCollapsed`.
* **Links** (`recomputeLinks`): all `frontmatterLinks`, `links` and `embeds` of the current md file, sorted by offset. Each is resolved with
  `getFirstLinkpathDest(path, source)`. Unresolved targets are normalised by stripping `.md`. Items are **de-duplicated by
  resolved path + subpath**. Rendering is incremental (`qI({batchSize:20, maxDelay:100})`, app.js:130084), and stale rows are dropped when the run finishes. Listed in document order.
* **Unlinked outgoing mentions** (`recomputeUnlinked` + `processInfo`, app.js:130133-130300). This is the inverse of backlinks' unlinked mentions:
  it builds a dictionary `lowercase name → {text, files[]}` from **every other markdown file's basename and aliases** (one name can map
  to several files). It sorts the names and, for each, uses `indexOf` on the lowercased current text, starting after the frontmatter. Each
  candidate is confirmed with a **sticky** whole-word regex at that position (`GI` with flags `giy`; lastIndex moves back one char when the pattern has
  a leading boundary group). Hits inside existing links or embeds are skipped. Each hit renders destination-file buttons. Clicking one
  rewrites the text into a link and escapes `|` as `\|` when the hit is inside a table section (app.js:130285-130287). Backlinks' Link
  button lacks that escape (observed difference).

### 15. Tags view (`tag-pane`)

`tre` / `sre` / `ore` (app.js:140334-140682). Right sidebar view `tag`. State: `sortOrder` (default **`frequency`**), `useHierarchy`
(default true), `showSearch`, `searchQuery`.
* Data: `metadataCache.getTags()` (app.js:62735). The cache is iterated with excluded files skipped. Every inline and frontmatter tag occurrence counts
  (no per-file de-duplication). Each occurrence also increments **every ancestor** (`#a/b/c` → `#a/b`, `#a`). Results are merged
  case-insensitively, and the displayed casing is the variant with the most occurrences. Recomputed in full on `metadataCache` `finished`,
  debounced 10 ms.
* Nested mode builds parent nodes by splitting on `/`, keyed by lowercase tag. Leaf labels show `parent/` dimmed plus the last segment.
  Sorts: name A→Z / Z→A (collator) or frequency high/low (ties broken by name), applied recursively.
* Click → `openGlobalSearch("tag:#x")`. **Mod-click** adds the term to the current global query or removes it (app.js:140403-140412).
* Folds: localStorage key `tag-pane-fold` holds the lowercase ids of **collapsed** parent tags (the tag tree does not set
  `prefersCollapsed`). Filter: the `NL` query through `matchContent(tag)`.

### 16. Outline (`outline`)

`Jte` / `ene` / `Zte` (app.js:130376-130837). It follows the active file. State: `followCursor, showSearch, searchQuery`.
* Builds a tree from flat `cache.headings` with a level stack: pop while the top's level ≥ the current level, then attach. This tolerates skipped levels.
  DOM rows are reused across updates by an in-place reconcile (`tx`, app.js:43097). The match key is the same level and text.
* **Active heading**: in reading view, the last heading whose end line ≤ the scroll line. In the editor, the heading containing the cursor
  (`ZF`). Updated on `editor-selection-change` (20 ms debounce) and `markdown-scroll` (20 ms). With "follow cursor" it scrolls into
  view.
* Filter: `NL.matchContent` on the item's `path` = `#H1#H2#H3`, so a parent-heading term keeps its children. Matches inside the
  heading text are highlighted.
* **Drag a heading onto another position to move the whole section.** The section runs from the heading to the next heading of ≤ level. The text is spliced,
  separator newlines are normalised (`$te` ensures a trailing blank line), and the result is saved with one `vault.modify` (app.js:130574-130610).
* Click → focus the corresponding leaf and `setEphemeralState({line})`. Hover → `hover-link` with `path#heading`.

### 17. Bookmarks (`bookmarks`)

`h9` (plugin, an `Events` emitter) and `c9` (view `bookmarks`, left sidebar) (app.js:120346-121217).
* Item factories (app.js:111426-111473): `file {path, subpath?}`, `folder {path}`, `group {title, items[]}`, `graph {title, options}`,
  `url {url, title}`, `search {query}`. All carry `ctime` and an optional `title`. The parent pointer is stored under `Symbol("parent")` (`U2`,
  app.js:101420), so it is never serialised.
* Lookup caches rebuilt on change: `bookmarkLookup[path]` (files without subpath, and folders) and `urlBookmarkLookup[url]`. Tab
  headers get a filled bookmark action when the view's file or URL is bookmarked (`updateTabHeaders` on `layout-change`).
* Rename handling: `vault` `rename` rewrites matching `file` and `folder` paths. **Deletes are not pruned.**
* Opening: file → `openLinkText(path+subpath)`. graph → opens a graph view and applies the stored options. url → `window.open`. folder →
  file explorer `revealInFolder`. search → global search, with Mod-click toggling the term in the current query. `openBookmarks` opens
  several in sibling tabs.
* Commands: `bookmarks:open`, `bookmark-current-view`, `bookmark-current-search`, `unbookmark-current-view`,
  `bookmark-current-heading`, and `bookmark-current-section`. The last one binary-searches (`Qb`) the section, list item or heading under the cursor.
  A heading gives `subpath "#<heading>"`. Anything else reuses the block's `^id`, or generates a random 6-char id and inserts it into the
  note only after the bookmark modal is confirmed. A non-empty selection becomes the bookmark title (app.js:120746-120795).
  Menus: file, files, editor-heading, tab group (bookmark all tabs), leaf (graph/web view), `search:results-menu`.
* CLI: `bookmarks` (list, `json|tsv|csv`) and `bookmark` (add file/subpath/folder/search/url/title).
* View: manual order with drag and drop (`moveItem`), groups behave as folders, filter = `NL.matchContent(item.path)`. Copy and paste uses clipboard MIME
  `obsidian/bookmarks` (JSON array).
* Migration: if `bookmarks.json` is absent, it reads legacy `starred.json` `{items}` once on layout ready. Missing files are dropped, file titles
  are removed, and `ctime` is filled.

### 18. File explorer (`file-explorer`)

`Mte` plugin (app.js:128122) and view `RO` (app.js:54239-55076). **The file explorer view is `RO`** (registered by `Mte` under `OO = "file-explorer"`, app.js:128172, 54225); `c9` is the bookmarks view (`r9 = "bookmarks"`, app.js:120064, 120827).
* One item object per path in `fileItems` (`PO` file, `LO` folder), created on `vault` `create` at load from `getAllLoadedFiles()`. Items are DOM
  templates cloned via `uM`. Titles and drag handlers are attached lazily on first render (`onRender`).
* **Sorting** (`getSortedFolderItems`, app.js:54871): **folders always first and always A→Z by name** (collator, numeric). Files use the
  selected comparator (`HL` orders: name, mtime, ctime and their reverses). `sort()` is debounced 20 ms and deferred while the pane is hidden. A
  `modify` event only re-sorts in mtime modes. Scroll position is preserved across re-sorts.
* Reveal: `file-explorer:reveal-active-file` expands ancestors and calls `infinityScroll.scrollIntoView(item, 4)`, then flashes it. "Auto reveal"
  (state `autoReveal`) runs on sort and file-open. If the pane is hidden, the reveal is queued until it is inserted.
* **Drag and drop** (`attachDropHandler`, app.js:54898): hovering a folder for **750 ms** while dragging auto-expands it. Dropping a
  file or folder calls `fileManager.renameFile(item, vault.getAvailablePath(dest))`, which updates links. Multi-select drops call the batch mover `LI`.
  Moving a folder into itself or a descendant is refused (`FI`). OS files dropped in are imported through `app.importAttachments(..., targetFolder)`.
  Multi-select comes from the tree controller (`selectedDoms`). Dragging a selected item drags the whole selection (`dragFiles`).
* Filter box (hidden button, opened by command) runs `NL.matchFilepath(path)`. `showUnsupportedFiles` toggles a CSS class plus the filter.
* Rename: in-place `contenteditable` title with its own Scope (Enter / Escape), validated live (`YL` → tooltip error).
* State: `sortOrder, autoReveal, showSearch, searchQuery` (+ one-shot `newFile` to start renaming a just-created file).
* Folds: localStorage `file-explorer-unfold` holds the **expanded** folder paths (`prefersCollapsed`, app.js:53846-53867).

### 19. Shared tree and virtualization (`pO` + `uO`)

* `pO` (app.js:53638) is the controller for explorer, outline, tags and bookmarks. It handles focus and selection (`selectedDoms`, shift and mod range select),
  keyboard (arrows, Enter, Delete or Mod+Backspace, F2 rename via callback), `setSearchFilter(pred)` → `applySearchFilter`. A node is shown if it
  or any descendant passes the filter, and hidden nodes get `.is-filtered-out`. It also handles `toggleCollapseAll` and folds persisted to localStorage
  `<id>-folds`, or `<id>-unfold` when `prefersCollapsed`.
* `uO` (app.js:53357) is the **variable-height virtual list for nested trees**, also used by search results:
  * Each node has `info {height, childTop, computed, queued, hidden, next, width, childLeft…}`. `compute()` lays out at most
    `renderBlockSize` = **50** uncomputed nodes per pass. It measures real heights with `getBoundingClientRect` (the distance to the next visible sibling, which captures
    margins). It divides by a `yScale` that corrects for CSS zoom, and re-queues itself through `SC(…, 50)` (idle callback) until everything is computed.
  * `updateVirtualDisplay`: the visible window is `scrollTop ± max(25% of viewport, 300 px)`. Off-window siblings are **detached**. A
    zero-height "pusher" div gets `margin-bottom` = the skipped height, and `childrenEl.minHeight` = the total height. Unmeasured nodes use the average
    measured height. Re-virtualisation on scroll happens only when the scroll moves more than `max(viewportHeight, 300)/2`.
  * `scrollIntoView` forces up to 10 compute passes (each capped at 9999 nodes instead of 50) so offsets are exact, then scrolls (app.js:53576-53588).
  * Sticky folder headers in RTL and LTR are handled by `coverEl` margin and padding tricks.

### 20. Recent files (`P3`, app.js:106547)

* `lastOpenFiles` is an MRU list of paths, persisted in `workspace.json` (`lastOpenFiles`) and restored on load. It also picks the file opened in a
  fresh layout (app.js:107636).
* `collect(file)` puts the path first, then keeps at most **25 md, 10 canvas, 10 image and 10 other** of the previous entries.
* It is fed by `vault` `create` and by `onFileOpen(newFile, previousFile)`. That call **records the *previous* active file**, not the newly opened one
  (app.js:108322, 106582-106584, observed). The current note is therefore absent until you leave it, and the empty-query quick switcher shows the
  note you came from first. Ctrl+O, Enter is "go back" (inferred intent).
* Renames are rewritten in place. `getRecentFiles(opts)` filters by type flags with `maxCount` default 10. `getLastOpenFiles()` = all
  types, 10.
* `D5`-based choosers call `workspace.addRecentFile` when a file is chosen (e.g. `J5`).

### 21. `[[` link suggest (brief, uses the same scorer)

`jB` / `WB` (app.js:65671-66105): the trigger is `[[` with no `]` after it. Modes: `file`, `heading` (`#`), `block` (`#^`), display/alias (`|`), and the global
heading and block searches `[[##` and `[[^^`. The candidate list comes from `metadataCache.getLinkSuggestions()`: every supported file (md shown without
extension), one entry per alias, and every unresolved link target (truncated to 500 chars). It is built once per suggest session and cached in
`fileSuggestions`. An empty query is sorted by mtime. Typed queries are matched with `UB` for files and `prepareFuzzySearch` for aliases and linktext, with
excluded files at −10, time-sliced by `qI()` with its defaults (10 items, 5 ms, yield via `requestAnimationFrame`) and cancellable through a runnable (app.js:65918-65992). Typing `#` or `^` accepts the selection and moves to the
heading or block mode.

---

## Data formats & on-disk files

| File / key | Where | Shape |
|---|---|---|
| `.obsidian/bookmarks.json` | bookmarks plugin `saveData` | `{ "items": Item[] }`. Item = `{type:"file", ctime, path, subpath?, title?}` · `{type:"folder", ctime, path, title?}` · `{type:"group", ctime, title, items: Item[]}` · `{type:"search", ctime, query, title?}` · `{type:"graph", ctime, title, options: GraphOptions}` · `{type:"url", ctime, url, title}` |
| `.obsidian/starred.json` | legacy, read once for migration | `{ "items": [{type:"file"|"folder"|"search"…, path, title?, ctime?}] }` |
| `.obsidian/global-search.json` | search plugin | `{showFullPath?: bool, linkStyle?: "none"|"wikilink"|"markdown", listStyle?: "none"|"-"|"*"|"num"}` (copy-results options only) |
| `.obsidian/switcher.json` | quick switcher | `{showExistingOnly: false, showAttachments: true, showAllFileTypes: false}` |
| `.obsidian/command-palette.json` | command palette | `{pinned?: string[] /* command ids in display order */}` |
| `.obsidian/backlink.json` | backlinks | `{backlinkInDocument?: bool}` |
| `.obsidian/workspace.json` | workspace layout | `lastOpenFiles: string[]` and per-leaf view `state`: search `{query, matchingCase, explainSearch, collapseAll, extraContext, sortOrder}`. backlink `{file, collapseAll, extraContext, sortOrder, showSearch, searchQuery, backlinkCollapsed, unlinkedCollapsed}`. outgoing-link `{file, linksCollapsed, unlinkedCollapsed}`. outline `{file, followCursor, showSearch, searchQuery}`. tag `{sortOrder:"frequency"|…, useHierarchy, showSearch, searchQuery}`. file-explorer `{sortOrder, autoReveal, showSearch, searchQuery}`. markdown `{…, backlinks: bool}` |
| localStorage `<appId>-recent-searches` | search history | `string[]`, newest first, ≤ 20 |
| localStorage `<appId>-recent-commands` | palette MRU | `string[]` command ids, ≤ 100 |
| localStorage `<appId>-file-explorer-unfold` | explorer folds | expanded folder paths |
| localStorage `<appId>-tag-pane-fold` | tag folds | lowercase ids of collapsed tags |
| localStorage `<appId>-<treeId>-folds` | other trees | collapsed node ids |
| localStorage `<appId>-pdfjs-search-settings` | PDF find | `{highlightAll, caseSensitive, matchDiacritics, entireWord}` |
| clipboard `obsidian/bookmarks` | bookmarks copy/paste | JSON `Item[]` |

`<appId>` is the per-vault app id prefix used by `app.loadLocalStorage` / `saveLocalStorage` (`this.appId + "-" + key`, wrapped in try/catch).

Search results never persist. Positions in `eState.match` are in-memory `[start, end]` UTF-16 offsets into the text snapshot.

---

## Rebuild notes

**Essential ideas worth copying**
1. **Matcher tree with tri-state results** (match / no match / not applicable). "Not applicable" lets one query
   language serve very different inputs: whole files, a heading path, a tag string or a file path. A filter box can accept the full syntax and
   ignore operators that don't apply. Return ranges per field from every matcher. Highlights, snippets and "jump to match" then come for free.
2. **Declare required inputs per operator** and load content lazily. Metadata-only queries (`path:`, `file:`, `[prop]`) never read files.
   Note that Obsidian's `tag:` needlessly declares `content` even though it only uses the cache. Fix that in a rebuild.
3. **Search as a long-lived, cancellable job fed by a queue**, not a one-shot function. Pre-sort the queue in display order, re-enqueue on
   `metadata changed`, remove on delete. The open search panel then stays live for free. Time-slice by *elapsed time per batch* and
   yield to idle callbacks. This keeps a 10k-note vault responsive without a worker.
4. **Scope operators split content into fragments** (line, block, section, task) using the parser's cached sections and list items, then
   re-run the child matcher per fragment and offset-shift its ranges. That one abstraction gives you `line:(a b)` semantics cheaply.
5. **Fuzzy scorer**: two passes (whole tokens, then subsequence), in-order greedy match, and a score made of *lexicographic* tiers (gaps ≫ mid-word
   starts ≫ spread ≫ position ≫ length). It is simple, fast and predictable. Add basename-first matching for paths (`UB`) and an alias pass.
6. **Unlinked mentions** = whole-word regex of title plus aliases, minus ranges already covered by links and frontmatter, with a one-click
   "link it" that goes through the same link generator as everything else.
7. **One virtualized tree** for every sidebar list (explorer, outline, tags, bookmarks, search results). Measure real heights lazily, detach
   off-screen nodes, use pusher margins and estimate unmeasured heights with the average.

**What I would change**
* Add a real **inverted index** (or SQLite FTS5/tantivy in a Tauri backend) for content terms. Use the linear scan only as the verifier for
  positions and for structural operators. Obsidian's design is O(vault) per keystroke and re-reads notes over 64 KB from disk on every search.
* Run the scan **off the UI thread** (Rust side or worker) and stream `{path, ranges}` back. Keep the matcher tree serialisable.
* Offer **relevance ranking** (BM25 plus a title/heading boost) alongside name and date sorts. Obsidian has none in global search.
* Make the tokenizer treat all whitespace as separators. Allow lowercase `or` / `and` if desired. Support `u`-flag regexes.
  Add optional **diacritic folding** (NFD and strip combining marks) for both engines. Obsidian has none, which matters for accented
  vocabularies.
* Fuzzy: allow out-of-order word matches (score them lower) and add a **recency/frequency boost** in the quick switcher. Obsidian only
  shows recents for an empty query. Consider an optimal (DP) alignment instead of greedy-leftmost to avoid odd highlights.
* Unlinked mentions: skip code, inline code, URLs and math, and only exclude links that actually point at the target.
* Keep the small UX details: Tab-to-folder drilling, Shift+Enter to create, Mod-click to add or remove a tag or search term, the
  "previous file first" recents list, the whole-word quoted phrase, "Explain search", and the self-blanking embedded query.

**Incidental (safe to skip)**: the copy-results modal formats, CLI handlers, the `TRUE`/`EMPTY` top-level quirks, the command-palette length tweak,
and the Canvas per-node handling (unless you have a canvas).

---

## Open questions

1. ~~Exact behaviour of top-level `TRUE` / `FALSE` / `EMPTY`~~ **Confirmed at runtime** ([14](14-runtime-verification.md)):
   `TRUE` and `FALSE` match 0 files, and `EMPTY` matches every Markdown note (12 of 12). Lowercase `or` is an ordinary word
   (`alpha or zzz` → 0), while `alpha OR zzz` → 1.
2. **Performance envelope**: how long a full `content` scan takes on a large vault, and how much the 64 KB `cacheLimit` matters. Is
   `setFileCacheLimit` ever raised at runtime (only the setter was seen, app.js:50456)? Probe: time `startSearch` in DevTools.
3. **`vault.generateFiles` ordering vs. `GT` re-queues** when a file is modified mid-scan: are duplicate results or flicker possible? Probe
   at runtime by editing during a long backlinks scan.
4. **Bookmarks for deleted files**: no prune was seen on `delete`. Confirm whether the view hides them (`shouldDisplay`) or shows them broken.
5. **Graph group queries** use `NL.match` with `requiredInputs`. Their full evaluation path (app.js:100830-100990) was only skimmed (graph
   worker's scope).
6. **The panes at app.js:131390 / 137240** also construct `NL`. Not identified in detail (probably the properties view and another plugin list).
7. **Hidden-pane search suspension** (§7) is inferred from the `onNodeInserted` await. Confirm by starting a long search and switching sidebar tabs.
8. **CLI** (`registerCliHandler`, `__files`) appears to be a newer subsystem. ~~How it is exposed~~ Resolved: see [01](01-boot-and-main-process.md) and [12](12-cli.md).
