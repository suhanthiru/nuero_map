# Metadata cache, markdown indexer and link graph (Obsidian 1.14.4)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian's "brain" is one class, `MetadataCache` (`WR`, app.js:62666-63482). It keeps two in-memory dictionaries, mirrored in an IndexedDB database called `<vaultId>-cache`. The first maps **path → {mtime, size, sha256}**. The second maps **sha256 → CachedMetadata**, so the cache is content-addressed. A changed file is read on the main thread, hashed with WebCrypto SHA-256, and sent to **one** dedicated Web Worker (`worker.js`, "Metadata Cache Worker"). Files go one at a time through a promise-chain queue. The worker runs a **forked remark-parse v8 (tokenizer-era mdast parser)** with about 20 Obsidian-specific tokenizers and transformers: wikilinks, embeds, tags, block ids, `%%` comments, `==mark==`, `$math$`, callouts, footnotes, task characters and YAML frontmatter. YAML is parsed with the `yaml` v2 library (eemeli), using YAML 1.2 core schema. It then flattens the mdast tree into the `CachedMetadata` JSON. Link resolution (`resolvedLinks` / `unresolvedLinks`) is **not** persisted. It is recomputed on the main thread after every parse and on every startup. A cooperative, idle-callback-yielding queue does this work and emits `resolve` per file and `resolved` when the queue drains. Resolution is case-insensitive and uses a basename multimap (`uniqueFileLookup`). Ambiguity is broken by: exact path, then "same-folder-subtree first", then shortest full path. **Aliases are never used to resolve links on desktop**; only the Publish-site resolver uses them. Backlinks have **no reverse index**: every consumer scans `resolvedLinks` or re-resolves every reference. Property typing (`MetadataTypeManager`, `QR`) is a thin layer: a `.obsidian/types.json` override table plus value-shape inference from the frontmatter objects.

---

## Where it lives

| Minified id | Public / inferred name | Role | Lines |
|---|---|---|---|
| `WR` | `MetadataCache` (public) | in-memory + IDB cache, worker client, link resolver, events | app.js:62666-63482 |
| `jR` | (paged IDB loader) | loads the `metadata` store 300 records at a time | app.js:63483-63499 |
| `VR` | `metadataCache.blockCache` | main-thread per-file "block list" (for `[[note#^` suggestions) | app.js:62503-62588 |
| `QR` | `MetadataTypeManager` (`app.metadataTypeManager`) | property registry, `types.json`, type inference | app.js:63509-63755 |
| `XR` | (inferWidgetType) | value → widget-type inference | app.js:63503-63508 |
| `UR`, `_R`, `GR`, `KR`, `YR` | default types / date formats / date regexes | constants | app.js:63502 |
| `tN`,`vN`,`gN`,`mN`,`yN`,`bN`,`wN`,`kN`,`EN`,`MN`,`TN`,`AN` | property widgets text/property/aliases/tags/folder/file/date/datetime/number/checkbox/multitext/unknown | `{type, icon, validate, render, reservedKeys?}` | app.js:67218-68110 |
| `Im` | (computeCachedMetadata) — main-thread copy | mdast → CachedMetadata | app.js:34368-34470 |
| `cm`, `om`, `am`, `sm`, `lm` | parse(), Parser class, mdast transformers, hast transformers, hast handlers | main-thread copy of the parser | app.js:33461-34169 |
| `pm` | `getFrontMatterInfo` (public) | raw frontmatter span finder | app.js:34170-34200 |
| `dm` | (parseFrontmatterNode) | YAML → object | app.js:34201-34212 |
| `gm` / `mm` / `ym` / `bm` / `wm` | `parseFrontMatterEntry` / `parseFrontMatterStringArray` / `parseFrontMatterAliases` / `parseFrontMatterTags` / (cssclasses) | frontmatter helpers | app.js:34222-34270 |
| `Pm` | (frontmatterLinks extractor) | walks frontmatter for `[[..]]` / `[..](..)` strings | app.js:34319-34367 |
| `Lm`,`Om`,`Fm`,`Rm`,`Bm`,`Nm`,`Vm` | compact/expand positions, migrate | persistence codec | app.js:34471-34528 |
| `zm` / `qm` | `getLinkpath` / `parseLinktext` (public) | split `path#subpath` | app.js:34542-34549 |
| `Wm` / `jm` / `Um` | `iterateCacheRefs` (public) / (iterate incl. frontmatterLinks) / `iterateRefs` (public) | reference iteration | app.js:34550-34564 |
| `_m` | `getAllTags` (public) | frontmatter + inline tags | app.js:34565-34581 |
| `Ym` / `Xm` | `stripHeading` / `stripHeadingForLink` (public) | heading normalisation | app.js:34582-34588 |
| `$m` | `resolveSubpath` (public) | `#heading#sub`, `#^block`, `#[^fn]` | app.js:34594-34660 |
| `od`, `ud`, `fd`, `ed` | isInternalUrl, normalizeLink, parseWikilinkInner, headingText | link-text helpers | app.js:28920-28990 |
| `rm`, `iR` | tag regex, isValidTag | tag rules | app.js:33461, 61408-61412 |
| `FR`, `RR`, `BR`, `NR` | strip `.md`, sort-by-path-length, "links mention name", "is suggestable value" | resolver helpers | app.js:62484-62502 |
| `zR`, `qR`, `gB` | apply link edits to text/YAML, rewrite one link's text, compute link change after rename | link rewriting | app.js:62609-62665, 65020-65040 |
| `fB` | `FileManager` (public) | rename → link update flow | app.js:64297-65012 (renameFile 64404, runAsyncLinkUpdate 64419, updateAllLinks 64483) |
| `WT` | (PromiseChainQueue) | serial work queue | app.js:45293-45303 |
| `qT`, `_T`, `GT` | Queue, Runnable, (AsyncWorkQueue w/ generator) | link-resolver and backlink queues | app.js:45248-45433 |
| `qI` | (TimeSlicer) | `shouldPause()/pause()` cooperative yielding | app.js:51840-51869 |
| `SC` | (scheduleIdle) | requestIdleCallback with timeout, else rAF | app.js:37677-37697 |
| `Wb` | (MultiMap) | `uniqueFileLookup`, backlink result sets | app.js:36426-36468 |
| `Gl` | `debounce` (public) | `didFinish` debounce | app.js:24224 |
| `nP` / `iP` / `Tb` | sha256 hex | content hash | app.js:48401-48418, 36360 |
| `Tl`,`Dl`,`Pl`,`Il`,`Ll`,`Nl`,`Vl`,`Wl` | basename, dirname, stem, strip-ext, ext, link-name, strip-.md, isExternal(`file:`) | path helpers | app.js:24133-24215 |
| `eI` / `nI` | `TFile` / `TExternalFile` | vault files; external files are `file:`-prefixed | app.js:50299-50392 |
| `Ej`, `Pj`, `Sj` | (WorkerClient), shared preview-parse worker, worker factory | reading-view async parse | app.js:72722-72771, 72830 |
| `W$` | (PublishLinkResolver) | Publish-site resolver with alias + permalink fallback | app.js:87546-87635 (used by `fJ` 90608) |
| `x8`, `T8`, `D8` | backlinks core plugin, view, backlink renderer component | backlink queries | app.js:113368-114192 |
| `_te`, `Gte`, `Kte` | outgoing-links core plugin, view, renderer | outgoing link queries | app.js:129762-130305 |
| `ite`, `rte` | canvas index, canvas link-updater | non-markdown references | app.js:126435-126636, registered 126827 |
| worker `dr`/`ur`/`fr`/`hr`/`pr` | parse(), Parser, mdast transformers, hast transformers, hast handlers | worker parser | worker.js:11197-11912 |
| worker `onmessage` | — | `{metadataCache: ArrayBuffer}` and `{parseSections, options}` | worker.js:12040-12165 |
| worker `Vn` | `yaml.parse` (yaml v2) | frontmatter | worker.js:11093-11119 (lib 6746-11088) |

---

## How it works

### 1. Ownership and lifecycle

**Construction** (observed, app.js:62667-62698, 145014): `new WR(app, vault)` creates:
* `worker = new Worker("worker.js", {name: "Metadata Cache Worker"})`, with `onmessage → onReceiveMessageFromWorker`;
* `workQueue` (`WT`), a promise chain where every task runs after the previous one settles. This makes parsing **strictly serial**;
* `uniqueFileLookup` (`Wb` multimap), keyed by lowercase file *name* (with extension) → array of `TFile`;
* `fileCache` `{}` (path → FileEntry) and `metadataCache` `{}` (hash → CachedMetadata);
* `resolvedLinks` / `unresolvedLinks` `{}`;
* `linkUpdaters` `{}`: per-extension plug-ins that can iterate/rewrite references in non-markdown files (only `canvas` registers, app.js:126827);
* `blockCache` (`VR`);
* `didFinish`, a debounce of `trigger("finished")`, 10 ms, timer reset on each call;
* starts the link-resolver loop immediately (`linkResolver()`), and wires `finished` and `resolved` to `checkCleanCache`.

**App start order** (observed, app.js:145240-145296):
1. `metadataCache.preload()` starts **in parallel** with `vault.load()` (the filesystem scan).
2. After the vault loads: `metadataTypeManager.registerListeners()`, then splash "Loading cache...", then `await metadataCache.initialize()`.
3. Workspace layout loads. Startup does **not** wait for indexing to finish.
4. At the end of startup: `metadataCache.showIndexingNotice()`.

**`_preload`** (observed, app.js:62965-63038):
* Opens the IndexedDB `app.appId + "-cache"`, **version 19**, through the `idb` wrapper (`lA`, app.js:46702). `appId` is the vault id from the main process `ipcRenderer.sendSync("vault").id` (app.js:146270, 144732).
* The `upgrade` callback **deletes and recreates** the `file` and `metadata` object stores. Any schema bump therefore wipes the cache.
* It loads all `file` keys and values with one `getAllKeys` + `getAll`. It loads `metadata` in **pages of 300** (`jR`: `getAll(IDBKeyRange.lowerBound(key), 300)`).
* Each metadata record goes through `Vm` (migration). If the record changed, it is written back. It then goes through `Nm` (expand compact positions) before it lands in `metadataCache`.
* If IndexedDB fails it logs `"Failed to load cache, unable to open IndexedDB"` and continues with an empty, unpersisted cache.

**`initialize`** (observed, app.js:63039-63065):
1. Await preload.
2. `setInterval(cleanupDeletedCache, 600000)` (10 min).
3. Fill `uniqueFileLookup` from every loaded `TFile` (key = `name.toLowerCase()`).
4. Reconcile every cached path:
   * file gone → `deletePath`;
   * metadata for its hash missing → `computeFileMetadataAsync`;
   * `stat.mtime` or `stat.size` differs → `computeFileMetadataAsync`;
   * otherwise → only `queueFileForLinkResolution`.
5. Every vault file not in the cache → `computeFileMetadataAsync`.
6. `initialized = true`. `watchVaultChanges()`, `updateUserIgnoreFilters()`, perf marks `vault.metadata` / `vault.metadataListeners`.
7. **`trigger("finished")` fires synchronously here**, even though parse jobs may still be queued. A `setTimeout(cleanupDeletedCache, 60000)` follows.

So `finished` really means "initial reconcile done", not "all parsed" (inferred from the call order). Code that needs the fully clean state uses `onCleanCache(cb)`. `isCacheClean()` is true when `inProgressTaskCount === 0`, the resolver queue is empty and the resolver is not running (app.js:63189-63191).

**Vault events** (observed, app.js:62950-62958):

| Vault event | Handler |
|---|---|
| `create` | `onCreate` |
| `modify` | `computeFileMetadataAsync` |
| `delete` | `onDelete` |
| `rename` | `onRename` |
| `external-watch` | `computeFileMetadataAsync` (for `TExternalFile`s opened from outside the vault) |
| `config-changed` | `onConfigChanged` (only `userIgnoreFilters` matters) |

### 2. Per-file parse pipeline (`computeFileMetadataAsync`, app.js:63212-63323)

For a vault `TFile` (observed):
1. Add it to `uniqueFileLookup` (every extension, not only md).
2. Non-md files: save the file record `{mtime, size, hash: ""}` and stop. Attachments get file records so `getCache()` returns `{}` for them.
3. md file: look up the existing record. A fast path skips parsing when `record.mtime === stat.mtime && record.size === stat.size && metadataCache[record.hash]` exists. It then only queues link resolution.
4. If the file has no record, it immediately writes a placeholder `{mtime:0,size:0,hash:""}`. A crash mid-index then forces a reparse next start (inferred).
5. `inProgressTaskCount++`, then queue a task on `workQueue`:
   * `vault.readBinary(file)` → ArrayBuffer;
   * decode to a string with `TextDecoder` (`Cb`); this string is passed to listeners;
   * `sha256(bytes)` as lowercase hex (`nP` → `crypto.subtle.digest("SHA-256")` → `Tb` hex);
   * update the record `{mtime, size, hash}` and save it;
   * **Hash hit**: if `metadataCache[hash]` already exists (file touched but unchanged, or byte-identical to another file), queue link resolution and `trigger("changed", file, text, cache)`. No worker round trip.
   * Otherwise start a 10 s timer that shows the Notice `"Indexing taking a long time for <path>"`. Then call `work(buffer)`, the worker round trip. When the result arrives: `saveMetaCache(hash, cache)`, queue link resolution, `trigger("changed", file, text, cache)`. If the result is null it logs `"Metadata failed to parse"`.
   * `finally`: `inProgressTaskCount--`; at 0 → `didFinish()` (debounced `finished`).

For a `TExternalFile` (`nI`, path `file:<abs path>`, observed 63215-63247): the same queue is used. Its metadata is stored only on `file.metadata`, is never persisted, and is skipped if the file has no "users" or its stat changed.

**Consequence of content addressing** (inferred, strong): two byte-identical notes (empty notes, template copies) share **one** `CachedMetadata` object. `getFileCache(a) === getFileCache(b)`.

### 3. Worker round trip

* `work(buf)` (app.js:63365-63373) throws `"Work queue must be sequential!"` if a request is already outstanding. It stores the promise resolver in `workerResolve` and calls `postMessage({metadataCache: buf}, [buf])`. The buffer is **transferred**, so it is zero-copy; it was decoded and hashed before the transfer.
* `onReceiveMessageFromWorker` (63399-63401) resolves the single pending promise with `e.data`. There are no request ids: one slot, enforced by the serial queue.
* Worker side (worker.js:12043-12165):
  * a falsy buffer → reply `{}`;
  * otherwise `new TextDecoder().decode(buf)`, then compute the metadata (same algorithm as `Im`, see section 5) and `postMessage(result)` (structured clone, no transfer);
  * an exception logs `"AppWorker exception"` and replies `null`.
* The **same worker.js** also answers `{parseSections: text, options}` (worker.js:12017-12039, 12154-12158). That message returns `{sections:[{html, pos, level}], frontmatter}` for the reading view. That traffic goes to a *second*, lazily created worker instance (`Pj`, shared by all reading views, app.js:72830, 73013-73050). Documents under 10240 chars are parsed synchronously on the main thread instead (app.js:73111).
* Canvas text nodes: shorter than 5000 chars → `Im` on the main thread; longer → `metadataCache.computeMetadataAsync(utf8Bytes)`, through the same serial queue and worker (app.js:126505-126513).

**Worker count** (observed): 1 metadata worker + 1 lazy reading-view parse worker (+ the graph physics worker `sim.js`, which is not related). No pool, and nothing scales with core count.

### 4. The tokenizer (worker.js)

**Engine**: a vendored **remark-parse v8** Parser (old tokenizer/locator architecture). Evidence:
* `blockTokenizers` = blankLine, indentedCode, fencedCode, blockquote, atxHeading, thematicBreak, list, setextHeading, html, definition, table, paragraph;
* `inlineTokenizers` = escape, autoLink, url, email, html, link, reference, strong, emphasis, deletion, code, break, text;
* `interruptParagraph/List/Blockquote` tables (worker.js:1064-1133).

The rest of the stack is vfile, vfile-location, unist-util-visit / visit-parents (worker.js:1616-1652, 5291), mdast-util-definitions, mdast-util-to-hast and hast-util-to-html. Global options are `{breaks: true, commonmark: true}`, with remark's default `gfm: true` (worker.js:11198-11199). It is **not** CodeMirror, micromark or marked. The editor highlighting uses a separate HyperMD-style CM mode (`hmd-internal-link`, app.js:78225). Two different parsers can therefore disagree at the edges (inferred).

Obsidian extends the Parser prototype with three helpers (worker.js:6697-6719):
* inline tokenizer `c(Parser, name, beforeName, fn, locator)`: inserts `name` into `inlineMethods` before `beforeName`. If `beforeName` does not exist it lands before the last entry (`text`); `tag` uses `"image"`, which does not exist.
* block tokenizer `u(...)`: the same for `blockMethods`.
* `f(interruptList, after, name)`: lets a new block construct interrupt paragraphs, lists and blockquotes.

The file is parsed by `dr(text)`: build a vfile and Parser, `parse()`, then run every mdast transformer in `fr` with `(tree, text)` (worker.js:11201-11208).

The parser normalises `\r\n|\r` → `\n` before tokenizing and strips a BOM (worker.js:714-724), and computes `offset` from line/column with **vfile-location over the original text** (worker.js:1810-1830). Offsets therefore index the original (CRLF) string correctly (inferred). Because `TextDecoder` already removes a UTF-8 BOM, offsets are relative to the BOM-less decoded text.

#### Obsidian inline and block extensions (all observed)

| Construct | Kind / placement | Rule | Lines |
|---|---|---|---|
| `==mark==` | inline, before `text` | needs gfm; opening `==` not followed by whitespace; an optional leading colour emoji (red/orange/yellow/green/blue/purple squares and circles) becomes `data-highlight` | worker.js:11177-11233 |
| `[[...]]`, `![[...]]` | inline `ilink`/`iembed`, before `link` | locator `/!?\[\[/g`; match `/^(!?)\[\[(.+?)]]/`: non-greedy, single line (`.`), rejected if the inner text contains `[[` | worker.js:11234-11266 |
| `#tag` | inline `tag`, before `text` | regex below; rejected if all digits (`/^#\d+$/`); locator only accepts `#` at offset 0 of the remaining inline string or after a whitespace char | worker.js:11197, 11267-11285 |
| task `[c]` | inside list-item tokenizer | `/^\[(.)][ \t]/`: **any single char**; `checked = (c !== " ")`, `checklist = c` | worker.js:627-636 |
| `$inline$` / `$$display$$` | inline tokenizer `math` (node `inlineMath`), before `text` | backslash escape, no space after opening `$`, closing `$` not preceded by space and not followed by a digit | worker.js:11303-11339 |
| `$$` block | block `math`, before `fencedCode` | 2+ `$` fence; closes on a line ending with an equal or longer `$` run | worker.js:11340-11385 |
| `^[inline footnote]` | inline tokenizer `inlineNote` (node `footnote`), before `reference` | bracket-depth and backtick aware | worker.js:11393-11437 |
| `[^id]: def` | block `footnoteDefinition`, before `definition` | identifier lowercased; continuation by 4-space indent | worker.js:11438-11495 |
| `[^id]` | inline tokenizer `footnoteCall` (node `footnoteReference`), before `reference` | lowercased id | worker.js:11496-11514 |
| hard breaks | `break` override | with `breaks: true`, a single newline is a `<br>` | worker.js:11530-11543 |
| frontmatter | block `frontmatter`, first in `blockMethods`, `onlyAtStart` | text starts with `---\n`; closing = the next `---` that sits right after a `\n`; node `{type:"yaml", value}` | worker.js:11544-11556 |
| `^blockid` (inline) | inline `blockid`, before `text` | `/^\^([a-zA-Z0-9\-]+)$/` on the **rest of the inline content** (it must be the last thing in that container); `^` must follow whitespace | worker.js:11557-11574 |
| `^blockid` (own paragraph) | block `blockid`, before `paragraph` | `/^\^([a-zA-Z0-9\-]+)(?=$|\n$|\n\n)/` | worker.js:11575-11582 |
| `%%comment%%` | inline `comment` before `text`; block `comment` before `fencedCode` | inline `/^%%(.*?)%%/`; block = a line starting with optional spaces + `%%` with no further `%` on that line, running to the next `%%` (or EOF); **children are tokenised as inline content** | worker.js:11865-11912 |
| callouts | built into the blockquote tokenizer | first line matched against `/^\[!([^\]]+)\]([+\-]?)(?:\s|$)/`; `type` = text before an optional `|`, trimmed, lowercased, whitespace→`-`; `fold` = `+`/`-`; `data` = text after `|` | worker.js:5146-5200 |

#### mdast transformers run before metadata extraction (`fr`, all observed)

1. **Checklist** (11286-11302): a list item with `checked` gets a synthetic `checklist` child; `checklist` (the char) stays on the item.
2. **Markdown link → internal link** (11584-11614): every `link` whose URL is "internal" is replaced by `{type:"ilink", converted:true, href}`. Internal means it starts with `./` or `../`, or contains no `:` (`y`, worker.js:6726-6728). `href` = `decodeURI` + normalise; if `decodeURI` throws, the link is left as an ordinary `link` (so not indexed, inferred). Images fall back to the raw URL instead. So `[x](www.example.com)` and `[x](#heading)` count as internal links (inferred).
3. **Image → internal embed** (11615-11639): `![alt](internal)` becomes `iembed` with `title = alt`.
4. **Footnotes** (11640-11711): renumbers references.
   * Inline `^[..]` footnotes become `fnRef` with `data.contentPosition`, and get the identifier `"[inline" + index`, e.g. `[inline0` (app constant `id = "[inline"`, app.js:28925).
   * `[^x]` references **without a matching definition are turned back into plain text**.
   * Synthetic list items holding the footnote bodies are appended in a `footnotes` section at the **end of the root's children**, as a `text` node plus an `element` node.
5. **Image/embed size suffix** (11712-11739): `|100` or `|100x200` → width/height. For `iembed` this only changes the rendered `alt`, so `displayText` keeps `"100"` (inferred).
6. **Block-id attachment** (11740-11777):
   * a root-level `blockid` node is removed and its id copied onto the *previous* root sibling (that is how `^id` under a table, list or quote works);
   * inside a root `list`, each `listItem` takes the id of the blockid it contains, ignoring nested lists;
   * any other root node takes the id of the last blockid anywhere inside it.
   * Inline blockid nodes are **not** removed from their parent's children.
7. **Heading data** (11778-11785): rendering only.
8. **Callout restructuring** (11786-11842): a blockquote with `callout` becomes type `"callout"`, with `callout-title` / `callout-content` children.

**What is excluded from indexing** (inferred from which nodes have `children`): fenced and indented code, inline code, `math`/`inlineMath` and raw `html` keep only `value`. Links and tags inside them are never visited.

**What is *not* excluded** (inferred from the code, **confirmed at runtime** in [14](14-runtime-verification.md)): `%%comments%%` keep tokenised `children`, and the extractor's visitor walks into them. **Links, embeds and tags inside comments are indexed** and show up in `resolvedLinks`, the graph and backlinks. The same goes for content inside callouts, highlights, inline footnotes and table cells.

### 5. Metadata extraction (worker.js:12050-12147; identical main-thread copy `Im`, app.js:34368-34470)

The extractor parses the text, then:
1. If the root's first child is `yaml`, it parses the YAML. If that gives a plain object (not an array or scalar), it sets `frontmatter`, `frontmatterPosition` and `frontmatterLinks`.
2. Each **root child** becomes a `sections[]` entry `{type, position, id?}`. A root child with an `id` also creates `blocks[id.toLowerCase()] = {id, position}`.
3. A single unist-visit walk over the node types `heading, ilink, iembed, tag, listItem, fnRef, footnoteDefinition, definition` fills the remaining arrays (detail in section 6).
4. **Empty arrays and objects are deleted** from the result, so every field is optional.

Positions use 0-based line and column plus a code-unit offset: `xm` subtracts 1 from unist line/column (app.js:34312-34317).

### 6. `CachedMetadata` shape (observed field-by-field)

`Pos = {start: Loc, end: Loc}`, `Loc = {line, col, offset}`:
* `line`: **0-based**;
* `col`: **0-based**, UTF-16 units within the line;
* `offset`: 0-based UTF-16 index into the decoded file text.

`end` is **exclusive**: one past the last char, unist semantics (inferred from remark positions).

| Field | Element shape | How produced | Notes |
|---|---|---|---|
| `links` | `{link, original, displayText, position}` | `ilink` nodes (wikilinks + converted md links) | `link` = normalised href including `#subpath` (no alias); `original` = exact source slice; `displayText` = alias, or for wikilinks without alias the href with `#` turned into `" > "` (e.g. `a > b`), or for md links the plain text of the label |
| `embeds` | same as links | `iembed` nodes (`![[..]]`, `![](internal)`) | `displayText` = alias, alt text or size suffix |
| `tags` | `{tag, position}` | `tag` nodes | `tag` includes the leading `#`, original case |
| `headings` | `{heading, level, position}` | `heading` nodes **whose parent is root** | headings inside blockquotes, callouts and lists are **not** listed; `heading` = raw source text from first to last inline child, trimmed, so markdown syntax such as `[[x]]` and `**b**` stays and a trailing ` ^id` is included (inferred); `level` = 1-6 (setext headings too) |
| `sections` | `{type, position, id?}` | every root child after transforms | types seen in code: `yaml, heading, paragraph, list, blockquote, callout, code, math, thematicBreak, table, html, definition, footnoteDefinition, comment`; notes with footnotes also get trailing `text` and `element` sections from the footnote transformer (inferred quirk) |
| `listItems` | `{position, parent, task?, id?}` | every non-synthetic `listItem` at any depth | see `parent` encoding below; `task` = the single char inside `[ ]`; `position.end` is cut back to the end of the last non-list child, so a nested sub-list is excluded |
| `blocks` | `{[lowercaseId]: {id, position}}` | root sections with `id` + list items with `id` | duplicate ids: last write wins (list items are processed after sections) (inferred) |
| `footnotes` | `{id, position}` | `footnoteDefinition` nodes (id = lowercased label) and inline footnotes (`[inline0`, …, position = the content span) | |
| `footnoteRefs` | `{id, position}` | `[^id]` references that have a definition | |
| `referenceLinks` | `{id, link, position}` | `[label]: url` definitions | reference-style uses `[text][label]` are **not** converted to links, so they never reach `links` or the graph (inferred from the transformer only matching `link`) |
| `frontmatter` | plain JS object | `yaml` v2 `parse()`: YAML 1.2 core schema, `uniqueKeys: true`, strict, logLevel `warn` (app.js:30931-30940) | any YAML error (including **duplicate keys**) → `frontmatter`, `frontmatterPosition` and `frontmatterLinks` are all **absent**, but the `yaml` section remains; dates stay **strings** (no timestamp tag in the core schema) |
| `frontmatterPosition` | `Pos` | position of the yaml node: from the opening `---` to the end of the closing `---` | |
| `frontmatterLinks` | `{key, link, original, displayText}` | `Pm`/`xr`: recursive walk; each **whole string value** that starts with `[[` and ends with `]]`, or is a `[text](internal-url)` | `key` is a dot path with array indices (`related.0`, `parent.child`); no position; a string like `"[[a]] and [[b]]"` is read as ONE link with href `a]] and [[b` (inferred quirk) |

**`listItems[].parent` encoding** (observed, app.js:34452):
* If the item is nested in another item, `parent` is the parent item's 0-based start line. This is a positive number.
* If it is a top-level list item, `parent` is the negative 0-based start line of the *list*, and `-1` when the list starts on line 0.
* Only *trailing* child lists of an item get the "nested" marker. A sub-list followed by more paragraphs inside the same item would yield negative parents (inferred quirk).

**Wikilink inner parsing** (`w` worker.js:6739-6744 / `fd` app.js:28985-28990, observed):
* split at the first `|`, but only if its index is > 0;
* trim both parts;
* drop a trailing `\` from the target (supports `\|` inside tables);
* normalise the target: NBSP → space, trim, Unicode **NFC** (`b`/`ud`).

### 7. Persistence format (observed, app.js:63348-63364, 34471-34528)

| DB | `<vaultId>-cache`, version 19, origin `app://obsidian.md` (seen on disk as a name in `%APPDATA%\obsidian\IndexedDB\app_obsidian.md_0.indexeddb.leveldb`) |
|---|---|
| store `file` | key = vault-relative path; value `{mtime: ms, size: bytes, hash: "<64 hex>" or ""}`. Non-md files have `hash:""` |
| store `metadata` | key = sha256 hex of the raw file bytes; value = a deep JSON clone of CachedMetadata in compact form: every `position` in links, embeds, tags, headings, sections, listItems and blocks becomes `pos: [sLine, sCol, sOff, eLine, eCol, eOff]`; `frontmatterPosition` becomes `frontmatterPos` (same 6-tuple). **`footnotes`, `footnoteRefs` and `referenceLinks` keep full objects** (`Lm` does not walk them). After migration a record also carries `v: 1` |

* **Write path** (`transactionSave`, app.js:62986-63003): a single read-write transaction over both stores, with `durability: "relaxed"`. It is reused for all writes issued in the same microtask turn and dropped by a `queueMicrotask`. If the transaction went inactive, the write is retried on a fresh one. `put` on a value, `delete` on null.
* **Migration** (`Vm`): records with `v < 1` get:
  * legacy array `frontmatter` → null;
  * legacy `frontmatter.pos` → `frontmatterPos`;
  * `frontmatterLinks` computed if missing;
  * every link re-normalised (NFC etc.);
  * `v = 1`, then written back.

  Freshly parsed records are saved **without** `v`, so each new record is migrated and rewritten once on the next startup (inferred minor inefficiency).
* **Garbage collection** (`cleanupDeletedCache`, 63402-63410): metadata entries whose hash no record in `fileCache` references are deleted. It runs 60 s after init and then every 10 min.
* **Reindex**: Settings → "Rebuild vault cache" → `metadataCache.clear()` (clears both stores) → `location.reload()` (app.js:143360-143375).
* `resolvedLinks`, `unresolvedLinks` and `uniqueFileLookup` are **never persisted**.
* The Publish site downloads a JSON of the same compact records (path → record) and expands it with `Nm` (app.js:87557-87558, 90638). Desktop and Publish therefore share the format (inferred).

### 8. Link resolution

**Queue** (`linkResolver`, app.js:63105-63154): a `GT` async generator drains a FIFO `qT`. For each item it:
* calls `resolveLinks(path)`, then `trigger("resolve", file)`;
* consults `qI({maxDelay: 100})` (yield check every 10 items once more than 5 ms has passed, `SC` = requestIdleCallback with a 100 ms timeout).

When the queue empties, the runnable stops → `trigger("resolved")`.
* The queue has **no de-duplication**, so a file can be resolved several times.
* `null` items are pushed on purpose by delete/rename. They resolve nothing but make `resolved` fire (observed 63332, 63345).

**`resolveLinks(path)`** (63158-63174, observed):
* iterates the file's refs via `iterateRefsForFile`. This uses `jm` = **frontmatterLinks + links + embeds**, or the canvas link-updater for `.canvas`;
* for each ref, takes `getLinkpath(link)` (cut at `#`) and calls `getFirstLinkpathDest(linkpath, sourcePath)`;
* builds `resolvedLinks[src] = {targetPath: count}` and `unresolvedLinks[src] = {linkpathWithoutTrailing.md: count}`. Unresolved keys keep the **original case** as written, so `[[Foo]]` and `[[foo]]` are distinct keys.

**`getLinkpathDest(linkpath, sourcePath)` → TFile[]** (app.js:62777-62830, observed). The algorithm in words:
1. Empty linkpath with a source → `[source]`. `[[#heading]]` therefore resolves to self and counts as a self-link.
2. External `file:` paths: resolve by plain path join relative to the source's directory, then try `+".md"`.
3. Lowercase the linkpath. If its basename contains a `.`, look up that exact name in `uniqueFileLookup` (`image.png`, `note.md`). If nothing is found, look up `linkpath + ".md"` instead. If neither exists → `[]`.
4. **Unique basename shortcut**: if the link has no folder part and exactly one file has that name → return it.
5. Relative link (`./`, `../`, `./../`): resolve against the source's folder; return a candidate whose lowercased path equals it exactly.
6. Strip one leading `/`; return a candidate whose full lowercased path equals the link exactly (vault-absolute). For a bare `[[note]]` this means **a root-level `note.md` wins**.
7. If the link started with `/` and step 6 found nothing → `[]`.
8. **Suffix match**: candidates whose lowercased path *ends with* the link path. These are split into those whose path *starts with the source's folder* and the rest. Each group is sorted by **full path string length**, ascending, and the groups are concatenated (same-subtree group first).
9. `getFirstLinkpathDest` takes element 0.

Quirks (inferred from the code): both the suffix test (step 8) and the folder-prefix test are plain string tests, not path-segment aware. `b/note` matches `ab/note.md`, and source folder `projects` prefers `projects-old/...`. The lookup key is lowercase only, with no Unicode case folding beyond `toLowerCase()`. Link hrefs are NFC-normalised in the parser.

**Aliases are not used for resolution on desktop** (observed: there is no alias code in `getLinkpathDest`). Aliases matter only in:
* `getLinkSuggestions()` (app.js:62700-62726): one extra suggestion per alias, plus every unresolved linktext, truncated to 500 chars;
* backlinks "unlinked mentions";
* the Publish resolver `W$`. That resolver tries path, then `+".md"`, then `aliases[lowercase linkpath]`, then `aliases[basename]`. It also builds a `permalinks` map from frontmatter `permalink` (app.js:87553-87594).

**Subpaths** (`resolveSubpath` `$m`, app.js:34594-34660, observed):
* Split the subpath on `#` and drop empty parts.
* A single part starting with `^` → block lookup in `blocks` (case-insensitive). Returns `{type:"block", block, list, start, end}`; `list` = the list item with that id, if any.
* A single part starting with `[^` → footnote by exact id.
* Otherwise a **heading chain** `#A#B#C`: walk the headings in order. Each next part must match a later heading with a *deeper* level than the previous match. Comparison is `stripHeading(x).toLowerCase()`: the chars ``!"#$%&()*+,.:;<=>?@^`{|}~/[]\`` and CR/LF become spaces, whitespace is collapsed, then trimmed (`Gm`, app.js:34582).
* The match ends at the next heading whose level ≤ the matched level. Returns `{type:"heading", current, next, start, end|null}`.
* When generating heading links, `stripHeadingForLink` removes only `: # | ^ \ CR LF %% [[ ]]`.

**`fileToLinktext(file, sourcePath, omitMd=true)`** (app.js:62935-62949, observed). Config `newLinkFormat` defaults to `"shortest"` (app.js:50201):
* `absolute` → vault path (without `.md`);
* `relative` → `../` chain from the source's folder;
* `shortest` → basename, but only if `getLinkpathDest(basename, source)` returns **exactly** `[file]`; otherwise the full vault path. It is not the shortest unique suffix.

The `useMarkdownLinks` default is `false` (app.js:50182).

**Unresolved check**: `isUnresolved(linkpath, source)` returns false until `initialized`.

### 9. Incremental graph maintenance (observed)

* **create** (63208-63211): parse the file, then `updateRelatedLinks([name])`. This re-queues every file whose `resolvedLinks` targets have that basename, or whose `unresolvedLinks` keys end in a path segment equal (lowercased) to the name with or without `.md`. A new file can *steal* an ambiguous link, or *satisfy* an unresolved one.
* **delete** (63324-63334): remove from `uniqueFileLookup` → `trigger("deleted", file, prevCache)`. Then `deletePath`: drop its resolved/unresolved entries and file record, `updateRelatedLinks([basename])`, enqueue `null`.
* **rename** (63335-63347):
  * re-key `uniqueFileLookup`, `resolvedLinks`, `unresolvedLinks` and the `fileCache` record; metadata stays valid because it is keyed by hash;
  * `updateRelatedLinks([oldName, newName])`, enqueue `null`.
  * The renamed file's *own* outgoing links: the runtime pass ([14](14-runtime-verification.md)) moved `f1/Linker.md` (`[[Dup]]` → `f1/Dup.md`) into `f2/`, where `f2/Dup.md` would win. With "Automatically update internal links" on, Obsidian rewrote the link to `[[f1/Dup]]` so its target stayed the same, and `resolvedLinks` for the new path was correct immediately. Staleness was not observed in that case.
* **Link rewriting on rename** (`FileManager.renameFile` → `runAsyncLinkUpdate`, app.js:64404-64533):
  1. Wait for `onCleanCache`.
  2. Snapshot every reference in the vault (`iterateAllRefs`, which includes canvas refs) with its resolved file and the full candidate path list.
  3. Perform the rename.
  4. For each snapshot, re-resolve (`gB`, app.js:65020). Only when the candidate list changed (or became empty) does it generate new link text: `fileToLinktext(oldTarget) + subpath`, with the wikilink-vs-markdown style kept from `original`.
  5. Group the changes by source file. If `alwaysUpdateLinks` (default `false`) is set, apply them; otherwise prompt "Always update / Just once / Do not update".
  6. Apply with `updateInternalLinks`. Body changes are offset splices (`zR` + `nE`). Frontmatter changes **re-parse and re-stringify the whole YAML block** (`PF`/`IF`), so YAML formatting can change. Canvas uses its link-updater (`applyUpdates`).
  7. `qR` keeps aliases (and, when the old link had a folder part, updates an alias that equalled the old basename), keeps `\|` escapes, and keeps `<...>` md-link brackets; otherwise it percent-encodes spaces (`hd`).

### 10. Backlinks and outgoing links (consumers)

* **`getBacklinksForFile(file)`** (62927-62934): iterates *every* reference in the vault (`iterateAllRefs`: all md caches via `jm`, plus canvas) and re-resolves each one. Returns a multimap source → refs. Cost is O(all refs × resolve).
* **Backlinks pane** (`D8.recomputeBacklink`, app.js:113839-114038):
  * queue all md + canvas files, sorted by the pane sort order;
  * pre-filter with `resolvedLinks[src][target.path]` (O(1));
  * read the content of the survivors (`vault.generateFiles`), re-resolve each ref to collect highlight ranges: content offsets, and frontmatter `{key, subkey path, pos}`;
  * yield every 2 items once 5 ms have elapsed (`qI({batchSize:2,maxDelay:100})`).
  * Live updates: listens to `metadataCache "resolve"` and re-queues that one source file (113641-113648, 113792-113801).
* **Unlinked mentions** (114044-114154):
  * one case-insensitive regex per basename and per alias;
  * Unicode-aware word boundaries via `GI`: if the needle starts or ends with a letter or digit, the match must not be flanked by one (app.js:51870-51875);
  * matches inside existing links/embeds (`iterateCacheRefs`) or inside the frontmatter span are discarded;
  * files excluded via `userIgnoreFilters` are skipped.
* **Backlink count** (status bar `x8`, 113499), Bases `file.backlinks` (80836) and CLI `backlinks` (59645): all are **full scans of `resolvedLinks`**. No reverse index exists anywhere (observed).
* **Outgoing links pane** (`Kte.recomputeLinks`, 130032-130132): iterates this file's refs (`jm`) in source-offset order, resolves each, de-dupes by `resolvedPath+subpath`, and yields every 20 items. Its "unlinked" section searches the current note's text for the basenames and aliases of every other note (130133-130231).
* Graph view (`B2`, 100878) reads `resolvedLinks`, `unresolvedLinks`, `getTags()` and `getCachedFiles()` (see the graph worker's findings).

### 11. Tags (observed)

* Inline tag regex (identical in app `rm`, app.js:33461, and worker `cr`, worker.js:11197):
  `/^#[^ -⁯⸀-⹿'!"#$%&()*+,.:;<=>?@^`{|}~\[\]\\\s]+/`
  * The excluded set: Unicode General Punctuation (U+2000-206F), Supplemental Punctuation (U+2E00-2E7F), ASCII punctuation except `- _ /`, and whitespace.
  * Allowed: letters in any script, digits, emoji, `-`, `_`, `/` (nesting).
  * Not allowed: all-digit tags (`#123`).
* Inline tag position rule: `#` must be at the start of the remaining inline text or after whitespace. After another inline token, e.g. `**b**#tag` or `[[x]]#tag`, the remaining string starts with `#`, so it probably *is* a tag (inferred quirk). `(#tag)` is not a tag.
* Frontmatter tags (`parseFrontMatterTags` `bm`):
  * key matched by `/^tags$/i`; the singular `tag` is **not** read;
  * a value that is a string becomes a one-element list; arrays keep only strings;
  * entries containing a space are **dropped**, so `tags: a, b` yields nothing (inferred consequence);
  * `#` is prefixed when missing; no charset validation at this stage.
* `getAllTags(cache)` = frontmatter tags + inline tag strings. It keeps duplicates and does not validate.
* `MetadataCache.getTags()` (62735-62769): counts every valid tag and **every ancestor** (`#a/b/c` adds 1 to `#a/b/c`, `#a/b` and `#a`). It merges case-insensitively and displays the spelling with the highest count. Validation: `iR` = whole string matches `rm`, and is not all digits.
* Aliases: `/^aliases$/i` only; strings trimmed, empties removed. `cssclasses`: `/^cssclasses$/i`, entries with spaces dropped.

### 12. Properties / frontmatter typing (`MetadataTypeManager` `QR`, app.js:63509-63755)

* **Registry**: `properties` maps lowercase key → `{name (display casing), widget}`. Rebuilt in full by `rebuildProperties()` on the first `finished` and whenever a type assignment changes. Updated incrementally in `onCacheChanged`. Files excluded by `userIgnoreFilters` and external files are skipped.
* **Inference** `XR(value)` (observed):

  | Value | Inferred widget |
  |---|---|
  | null / undefined | `text` |
  | string matching `^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d$` | `datetime` (**minutes only**; a value with seconds is inferred as `text`) |
  | string matching `^\d{4}-[01]\d-[0-3]\d$` | `date` |
  | any other string | `text` |
  | number | `number` |
  | boolean | `checkbox` |
  | array of strings (nulls ignored) | `multitext` |
  | anything else (objects, mixed arrays) | `unknown` |

* **Which value wins** (inferred from loop order): a full rebuild keeps the **first non-null value seen**, in `fileCache` insertion order, which follows IDB key order on startup. Incremental `changed` events overwrite with the **latest changed file's** value.
* **`types.json`** (`.obsidian/types.json`): `{ "types": { "<propertyName>": "<widgetType>" } }`.
  * `loadData` merges it, then forces the frozen defaults `aliases→aliases`, `cssclasses→multitext`, `tags→tags` (`UR`).
  * `save()` writes every assigned widget, including those defaults, with `mtime = lastSave`.
  * External edits arrive through vault `raw` events, debounced 50 ms; reload happens only if the file's mtime is newer than `lastSave`.
  * `setType`/`unsetType` save, then `trigger("changed", key)`.
* **Registered widgets** (63546-63557): `aliases, checkbox, date, datetime, file, folder, multitext, property, number, tags, text`, plus the fallback `unknown`.
  * Validators: text/file/folder/property = string; aliases/tags/multitext = string or string[]; number = finite number; checkbox = boolean; date = empty or `moment(v, "YYYY-MM-DD").isValid()`; datetime = empty or `moment(v, ["YYYY-MM-DD[T]HH:mm:ss", "YYYY-MM-DD[T]HH:mm", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm"]).isValid()`.
  * A widget with a `reservedKeys` array is offered in the type menu **only** for those keys (app.js:67131). `aliases` is limited to `aliases` and `tags` to `tags`. `file`, `folder` and `property` have `[]`, so they never appear in the generic menu; they are internal, used by Bases (inferred).
  * The datetime input is formatted as `YYYY-MM-DD[T]HH:mm:ss` and the date input as `YYYY-MM-DD` (app.js:67578-67607).
* **`getTypeInfo(key, value)`** → `{expected, inferred}`:
  * assigned type whose validator accepts the value → both are the assigned type;
  * null value → the known widget of the property;
  * otherwise → inferred from the value.
* **Other APIs**:
  * `getPropertyOccurrences()`: lowercase key → count of files.
  * `MetadataCache.getFrontmatterPropertyValuesForKey(key)`: distinct string values for suggestions. A value is kept only if non-empty, single-line, and not "longer than 100 chars and containing a space". Sorted with `Intl.Collator(numeric, sensitivity base)`.
  * `getAllPropertyInfos()` is deprecated and forwards to `metadataTypeManager.getAllProperties()`.
* **Helpers**:
  * `getFrontMatterInfo(text)` (`pm`) → `{exists, frontmatter, from, to, contentStart}`. It is regex based (`^---\r?\n` … a `---(\r?\n|$)` that follows a `\n`) and CRLF-aware. It is separate from the parser's frontmatter tokenizer, which only sees LF-normalised text.
  * `parseFrontMatterEntry(fm, keyOrRegex)` = an own-property lookup or a key regex test.

### 13. Excluded files (`userIgnoreFilters`, default `null`)

`updateUserIgnoreFilters` (63414-63430): each entry becomes a case-insensitive regex. `/.../` is used as a raw regex; anything else as `^` + escaped prefix. Results are memoised per path.

What exclusion affects (observed): `iterateFileCache` (tags, properties, frontmatter-value suggestions), unlinked mentions, property rename/delete. What it does *not* affect: parsing, `resolvedLinks`, `iterateAllRefs` and `getBacklinksForFile`. Whether the graph and search filter separately is out of scope / unknown here.

### 14. Events (observed)

| Event | Args | When |
|---|---|---|
| `changed` | `(file: TFile, data: string, cache: CachedMetadata)` | after a parse, a hash hit, or an external-file parse. **Not** fired for files that are unchanged at startup |
| `deleted` | `(file, prevCache)` | vault delete |
| `resolve` | `(file)` | after one file's links are (re)resolved |
| `resolved` | `()` | resolver queue drained (fires repeatedly over the session) |
| `finished` | `()` | end of `initialize()`, then debounced (10 ms) whenever `inProgressTaskCount` returns to 0 |

### 15. Indexing notice and performance

* `showIndexingNotice` (63083-63104): waits 1 s. If tasks remain, it shows a persistent Notice "Indexing vault..." / "Some functionality may not be available until this is complete." with a `<progress>` (`max` = number of cached metadata + pending tasks), updated every 300 ms. On `onCleanCache` it switches to "Indexing complete." with class `mod-success` and hides after 3 s.
* **Cost model** (inferred):
  * Cold start = N × (fs read + SHA-256 + structured-clone round trip + single-threaded parse), strictly serial.
  * Warm start = loading all IDB records into JS objects, the mtime/size comparison, and a main-thread re-resolution of every link in every file.
  * The whole metadata set for the vault stays **in memory**.
  * No file-size cap was found for parsing.
  * Main-thread jank is avoided with time-sliced queues (`qI`: 10-item batches / 5 ms budget / idle callback up to 100 ms), not with more workers.
* Other tricks:
  * the transferable ArrayBuffer;
  * content hash to dedupe and to skip reparsing after touch, sync or rename;
  * relaxed-durability batched IDB writes;
  * paged IDB reads;
  * `Gl` debounce of `finished`;
  * the hash-addressed store makes renames free.

---

## Data formats & on-disk files

* **IndexedDB** `<16-hex vaultId>-cache` v19: stores `file` and `metadata` (section 7). Related DBs from other subsystems live in the same origin: `-backup`, `-sync`, `-webview` (app.js:128274, 139096, 110246).
* **`.obsidian/types.json`**: `{"types": {"name": "text|multitext|number|checkbox|date|datetime|aliases|tags|file|folder|property"}}`.
* **Vault config keys used here** (defaults, app.js:50170-50202): `newLinkFormat:"shortest"`, `useMarkdownLinks:false`, `alwaysUpdateLinks:false`, `userIgnoreFilters:null`, `showUnsupportedFiles:false` (the last gates `isSupportedFile` for link suggestions).
* **Worker message protocol** (worker.js:12043-12165):

  | Direction | Message |
  |---|---|
  | → worker | `{metadataCache: ArrayBuffer}` (transferred) |
  | ← worker | `CachedMetadata`, or `{}` for an empty input, or `null` on exception |
  | → worker | `{parseSections: string, options}` (sets parser globals) |
  | ← worker | `{sections: [{html, pos, level}], frontmatter}` |

---

## Rebuild notes

**Essential ideas worth copying**
1. **Two-level, content-addressed cache**: `path → (mtime, size, hash)` plus `hash → parsed metadata`.
   * mtime+size is the cheap gate; the hash is the truth.
   * Renames, sync touches and duplicate files all become free.
   * GC unreferenced hashes lazily.
   * In a Tauri/Rust app: a SQLite or redb table pair, with blake3 instead of SHA-256.
2. **Parse off the UI thread, resolve links separately.** Parsing is per-file and pure (text → metadata), so it parallelises perfectly. Link resolution depends on the global file set and must be redone when files appear, disappear or move. Keep them as two stages with two queues. Obsidian's single serial worker is incidental; use a worker pool or Rust threads (rayon) for cold indexing.
3. **A flat, positional metadata record** (links, embeds, tags, headings, sections, listItems, blocks, footnotes, frontmatter, frontmatterLinks), with 0-based line/col + offset and exclusive ends. Store positions compactly as 6-int tuples. Offsets into the original text are what make rename rewriting and backlink highlighting cheap.
4. **Events**: `changed(file)`, `deleted(file, prev)`, `resolve(file)`, `resolved()`, plus a "clean" barrier (`onCleanCache`). Other features (rename rewriting, properties, backlinks) depend on that barrier.
5. **The resolver contract**: case-insensitive basename multimap. Resolution order: exact relative → exact absolute → unique basename → suffix match with same-subtree preference → shortest path. Make the suffix and prefix tests **segment-aware**, unlike Obsidian, and decide explicitly whether aliases resolve. Obsidian desktop: no; Publish: yes.

**Do better than Obsidian**
* Keep a **reverse index** (`target → {source: count}`) and update it as you rewrite `resolvedLinks[src]`. Backlink counts and graph neighbourhoods become O(degree) instead of O(vault).
* Keep resolution incremental per *dependency*: index which unresolved and ambiguous linkpaths each file depends on. This replaces "re-queue everyone who mentions this basename", and also re-resolves the renamed file's own links.
* Decide deliberately whether comments (`%%`) and footnote bodies count as links. Obsidian indexes links inside comments as a side effect of tokenising comment children.
* Persist resolved links too, or at least resolve in a worker. For a 10k-note vault, Obsidian redoes the whole resolution on the main thread at every launch.
* Use one parser for the editor, reading view and index, or a shared grammar spec. Obsidian runs a remark fork for indexing and a separate CM/HyperMD mode for the editor.
* YAML: Obsidian uses YAML 1.2 core, so dates stay strings and duplicate keys drop *all* frontmatter. Surface YAML errors to the user instead of silently dropping properties.

**Incidental (no need to replicate)**: IndexedDB specifics (version 19 wipe-on-upgrade, relaxed durability), the TypeScript-ES5 async generators, the reading-view `parseSections` HTML path (same worker.js file, separate worker instance), and the 10 s "taking a long time" notice.

**Minimum viable re-implementation order**: (1) file watcher → hash gate → parser → metadata store; (2) resolver + forward/reverse link tables; (3) `resolveSubpath` for headings and blocks; (4) property type registry (inference table + override file); (5) rename-with-link-rewrite using the stored offsets.

---

## Open questions

1. ~~Links in `%%comments%%`~~ **Resolved at runtime** ([14](14-runtime-verification.md)): inline and block-comment links are in `resolvedLinks` and backlinks. **New bug found:** a link on the *opening line* of a block comment is cached 2 characters early (`% [[Target B`). Renaming its target then rewrites the wrong range and corrupts the note: `%% [[Target B]] on the opening line` became `%[](Target%20Bee.md)]] on the opening line`, which breaks the comment opener.
2. ~~Trailing `text`/`element` sections~~ **Confirmed:** a note ending in a footnote definition gets two extra sections, `text` and `element`, on the same line.
3. ~~Heading text with a trailing `^blockid`~~ **Confirmed:** `headings[].heading` keeps `^abc123`; the id is also in `blocks`.
4. ~~Renamed file's own links~~ **Clarified:** in the probed case Obsidian rewrote the moved note's own link to keep its target (see the rename section above).
5. **`v` migration churn**: does every newly parsed record get rewritten once on the next startup? Probe: inspect an IDB record for `v` after a fresh parse versus after a restart.
6. **Memory and time scaling**: there is no size cap or worker pool. Real numbers need a runtime profile on a large vault: time to `onCleanCache`, heap size.
7. **CRLF and BOM files**: offsets look correct (vfile-location over the original text, BOM removed by TextDecoder). Verify `original === text.slice(offset…)` on a CRLF note.
8. **Graph / search exclusion behaviour** for `userIgnoreFilters`: not traced here; it belongs to the graph and search workers.
9. **Mobile**: same `new Worker("worker.js")` path; Capacitor behaviour not examined.
10. No suspicious instruction-like text was encountered in the inspected bundle regions.
