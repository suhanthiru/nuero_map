# Obsidian 1.14.4 — full teardown

A static reverse-engineering study of the Obsidian desktop app, done with REA and
plain parsing tools on 2026-10-20/21. The goal is to understand how every part of
Obsidian is built so Neural Map can borrow *ideas*. Nothing in this folder is
Obsidian code: every document describes behaviour, data formats, algorithms and
constants in our own words. Do not paste code from Obsidian's bundle into this
repo (Obsidian is closed source, `"license": "UNLICENSED"`).

The graph view was covered first, in more depth, in
[`../obsidian-graph-teardown.md`](../obsidian-graph-teardown.md).

## Documents

Start with the overview, then read whichever subsystem you need.

| Doc | Covers |
|---|---|
| [00 — Architecture overview](00-architecture-overview.md) | how the pieces fit, startup and edit walkthroughs, where state lives, recurring patterns, security model, bugs found, key numbers, open questions |
| [01 — Boot and main process](01-boot-and-main-process.md) | boot loader and updater, Electron windows and their webPreferences, the 47 IPC channels, `app://` protocol, `obsidian://` URIs, CLI transport, enterprise policy, web-viewer ad blocking, fuses, Tauri mapping |
| [02 — Vault and files](02-vault-and-files.md) | `FileSystemAdapter`, file watching and reconciliation, `Vault` and `TFile`, the `.obsidian` config folder and every config file, `FileManager`, attachments, trash, link updates on rename |
| [03 — Metadata cache and links](03-metadata-cache-and-links.md) | the parse worker, IndexedDB cache, `CachedMetadata` fields, the Markdown tokenizer rules, link resolution order, backlinks, property types |
| [04 — Markdown rendering](04-markdown-rendering.md) | Reading view pipeline (remark → HTML → DOMPurify), sections and recyclers, post-processors, embeds, callouts, math, Mermaid (trust gate), Prism, hover previews, HTML→Markdown, PDF export, slides |
| [05 — Editor and live preview](05-editor-and-live-preview.md) | CodeMirror 6 + the CM5 HyperMD-derived Markdown mode, live-preview decorations and widgets, tables, images, lists, folding, saving, the `Editor` API, suggests, vim, paste |
| [06 — Workspace and UI](06-workspace-and-ui.md) | renderer boot sequence, `enhance.js`, `Component`, keyboard and hotkeys, layout tree and `workspace.json`, deferred views, popouts, menus, modals, settings, trees, theming tokens, **accessibility audit**, i18n |
| [07 — Plugins and API](07-plugins-and-api.md) | how community plugins are loaded and evaluated, the `require` map, the `Plugin` API, core plugin registry, plugin and theme directory and installs, `obsidian://` actions, security model |
| [08 — Search and navigation](08-search-and-navigation.md) | search query language and engine, fuzzy scoring, quick switcher, command palette, backlinks and unlinked mentions, outgoing links, tags, outline, bookmarks, file explorer, virtual tree |
| [09 — Canvas and Bases](09-canvas-and-bases.md) | JSON Canvas rendering, interaction, undo and indexing; the `.base` schema, formula language and function library, query execution, views, plugin API |
| [10 — Sync, Publish, account](10-sync-publish-account.md) | account API, Sync transport, protocol, data model, reconciler and end-to-end encryption design, Publish upload and site runtime, every network endpoint, licensing checks |
| [11 — Core plugins](11-core-plugins.md) | the other 18 core plugins (daily notes, templates, note composer, file recovery, word count, web viewer, …), settings tabs, release notes, sandbox vault |
| [12 — CLI](12-cli.md) | the renderer-side CLI command registry, every built-in and plugin command, output formats, security semantics |
| [13 — Rebuild blueprint](13-rebuild-blueprint.md) | how to rebuild an Obsidian-class app on Tauri 2, and a ranked list of what Neural Map should borrow |
| [14 — Runtime verification](14-runtime-verification.md) | live probes on a throwaway vault: Mermaid gate, comment-link corruption bug, CRLF, Bases precedence, search keywords, canvas safety, hotkey bug, accessibility tree |
| [Graph view](../obsidian-graph-teardown.md) | worker + WASM physics, PixiJS renderer, hover fade, semantic zoom (earlier, separate study) |

## Target

| | |
|---|---|
| Product | Obsidian 1.14.4, Windows x64, installed per-user at `%LOCALAPPDATA%\Programs\Obsidian` |
| Runtime | Electron 43.7.7 (Chromium 150.0.7871.250), `Obsidian.exe` 239 MB |
| Boot package | `resources/app.asar` 480 KB, sha256 `3b48654f…506dfd8` — unminified boot loader + updater |
| App package | `resources/obsidian.asar` 27.5 MB, sha256 `146ef847…2b92f` — the real app, replaceable by updates |
| Native addons | `app.asar.unpacked/node_modules/btime` (set file birth time), `get-fonts` (list system fonts) |
| CLI shim | `Obsidian.com` 22.8 KB PE32 console program, sha256 `072b9895…51e2` |
| User data | `%APPDATA%\obsidian\` — `obsidian.json` (vault registry), `obsidian.log`, `id`, Chromium profile (IndexedDB, Local Storage) |

Inside `obsidian.asar`:

| File | Size | Role |
|---|---|---|
| `main.js` | 204 KB | Electron main process (windows, IPC, `app://` protocol, CLI pipe, menus, web-viewer ad blocking) |
| `index.html` + `app.js` | 3.9 MB | the renderer: whole app, webpack 5 + TypeScript downlevelled to ES5, includes CodeMirror 6 |
| `app.css` | 668 KB | every style and CSS variable |
| `worker.js` | 240 KB | "Metadata Cache Worker": markdown/frontmatter parsing off the UI thread |
| `sim.js` | 18 KB | "Graph Worker": WASM force simulation |
| `enhance.js` | 13 KB | DOM prototype helpers (`createEl`, `empty`, `toggleClass`, …) loaded before the app |
| `starter.html/js`, `help.html/js` | 461 KB, 399 KB | vault picker window, help window |
| `i18n.js` + `lib/i18next.min.js` | | UI strings |
| `lib/` | | CodeMirror 5 + vim (legacy modes, vim keymap), pixi.js 7 (graph), mermaid, MathJax, pdf.js 5.3.34, prism, moment, scrypt, turndown, defuddle, readability, reveal.js |
| `sandbox/` | | the "Sandbox vault" notes |

## Method

Everything here is static: no Obsidian code was executed by the analysis.

1. **Identify and hash** the install (`Get-Item`, `sha256sum`), read `obsidian.log`
   and `obsidian.json` to learn which package was loaded.
2. **Electron fuses** with REA `inspect_electron_fuses` on `Obsidian.exe`
   (Evidence `ev_9986ca49…b9b1a`): RunAsNode off, `NODE_OPTIONS` off, `--inspect`
   off, cookie encryption on, embedded ASAR integrity off, OnlyLoadAppFromAsar off,
   file-protocol extra privileges on.
3. **REA application graphs** with `analyze_javascript_application`:
   * `app.asar` complete (summary `ev_c62769f7…`, parent `ev_58e1e1b4…`;
     needs `integrity_policy: record-and-continue` because the unpacked native
     addons were re-signed after packing).
   * `obsidian.asar` complete run timed out at 300 s on the pdf.js files
     (partial parent `ev_5e19fa0e…`); a focused run over `main.js`, `worker.js`,
     `sim.js`, `enhance.js` and the HTML entry points completed
     (parent `ev_c7e88edc…`). From it, the main-process IPC table
     (47 channels, view `ev_00c748ba…`).
   * `inspect_pe_resources` on `Obsidian.com` (`ev_b83396ea…`).
4. **Extract** both ASARs with a 30-line reader of the ASAR header
   ([`tools/asar-extract.js`](tools/asar-extract.js)).
5. **Pretty-print** the minified bundles with the TypeScript compiler's printer
   ([`tools/pretty.js`](tools/pretty.js)): strip source positions so every block
   prints multi-line, and split statement-level comma sequences into statements.
   `app.js` goes from 0 newlines to 146k readable lines.
6. **Build a symbol map** ([`tools/classmap.js`](tools/classmap.js)): walk the AST
   for TypeScript-downlevelled classes (`var X = function (e) { … v(t, e); t.prototype.m = … }(Base)`)
   and native `class` declarations, record base class, constructor fields,
   methods and statics; read every webpack `n.d(exports, { Name: () => id })`
   map. The plugin API export map (`App`, `Vault`, `MetadataCache`, `Workspace`,
   …) names 171 of the 943 classes, and their subclasses and methods name most
   of the rest, because **property and method names survive minification**.
7. **Deep reading** of each subsystem by parallel workers against the pretty
   files, citing line numbers, with every claim marked observed / inferred /
   unknown.
8. **Verification pass.** Six independent checkers re-checked every "Where it
   lives" row against the symbol map and re-opened the cited lines for about
   940 sampled claims (constants, storage keys, algorithms, security
   statements). They made about 150 corrections, mostly line numbers and
   precision. The substantive ones included `app://` running on
   `registerFileProtocol`, the partial API freeze, plugin install ignoring
   policy, a stricter `forced-colors` count, and the corrected Mermaid
   trust-gate analysis. Cross-document contradictions were reconciled.

Line references in these documents (`app.js:62666`) point into the
pretty-printed files produced by step 5 for this exact build; they are stable
only for `obsidian.asar` sha256 `146ef847…2b92f`.

### Reproduce

```bash
node docs/research/obsidian/tools/asar-extract.js "%LOCALAPPDATA%/Programs/Obsidian/resources/obsidian.asar" out/obsidian
```

```bash
node --max-old-space-size=12288 --stack-size=65500 docs/research/obsidian/tools/pretty.js node_modules/typescript out/obsidian/app.js out/pretty/app.js
```

```bash
node --max-old-space-size=12288 --stack-size=65500 docs/research/obsidian/tools/classmap.js node_modules/typescript out/pretty/app.js out/map/app
```

Keep the output outside the repo; it is Obsidian's code.

## Code map of `app.js` (pretty-printed line ranges)

| Lines | Contents |
|---|---|
| 1–12.7k | vendor: Capacitor (mobile bridge, secure storage, in-app review), misc libraries |
| 12.5k–12.96k | webpack export maps: CodeMirror 6 modules and the `obsidian` plugin API |
| 13.2k–28.5k | CodeMirror 6 state, view, language, lezer common, stream-language |
| 24.3k | `FileSystemAdapter` (desktop) |
| 39k–46.2k | core UI framework: `Component`, `Scope`, `Keymap`, `Menu`, `View`, `Setting`, `Modal`, `Notice`, theme/CSS manager, hotkey manager |
| 46.3k–48.6k | account client, mobile file systems, crypto primitives (AES-CTR, AES-SIV, …) |
| 50.2k–57.5k | `Events`, `TFile`/`TFolder`, `Vault`, search query engine, trees/virtual lists, workspace items and tabs |
| 57.6k–66k | diff-match-patch, table formatting, `Editor`, `MetadataCache`, properties, `FileManager`, suggest popovers |
| 66k–80k | properties UI, CM6 search, markdown preview renderer, live preview, CodeMirror 5 compatibility layer |
| 80k–93.5k | Bases: values, formulas, filters, query controller and view UI |
| 87.5k–89k | graph renderer (PixiJS) |
| 89k–91k | Publish client |
| 94k–99k | editor views, PDF viewer (pdf.js 5.3.34), embeds registry |
| 99.7k–106k | core plugins (global search, graph), settings, secret storage, release notes, plugin/theme browser |
| 106k–109.2k | URI handler, recent files, `Workspace`, `Plugin` |
| 109.2k–110.2k | community and core plugin managers |
| 110.2k–144k | core plugins: web viewer, backlinks, `MarkdownView`, commands, mobile, Bases views, file explorer, bookmarks, canvas, daily notes, templates, file recovery, note composer, outline, page preview, properties, Publish, Sync, tags, workspaces, settings tabs |
| 144.7k | `App` |

## Evidence ledger (REA, session-scoped)

| Evidence | What |
|---|---|
| `ev_9986ca493fefaa899dfd8144b583fc23d681285c9ce098d23ae6e6f68d5b9b1a` | Electron fuses of `Obsidian.exe` |
| `ev_58e1e1b4468d7d123a68d12da745d7f0c6a824e30118affa768bb8ee4fdb977d` | `app.asar` application graph (complete) |
| `ev_5e19fa0e6eb48ce939f554e5bfcfe7eb09c0cf5047c0815f13a9b38021c6a266` | `obsidian.asar` application graph (partial: timed out on pdf.js) |
| `ev_c7e88edcda8ed2a5b39fbd0fe0a33272ed987141aa62afc93aef0197e1afc1d6` | `obsidian.asar` focused graph: main, worker, sim, enhance, HTML |
| `ev_00c748ba8d5f069784e4ace8c2e061cf24839df5c245042a17275f2943073bca` | 47 `ipcMain` registrations in `main.js` |
| `ev_b83396ea3ff55737df1b855e07c1e5c372c26d79ce20551be639d6cb0fa7bec3` | `Obsidian.com` PE resources |

REA retained Evidence lives in the REA server session; the IDs identify the
records but are not files in this repo.

## Limits

* Mostly static. Anything marked *inferred* was reasoned from code. A runtime
  pass on a throwaway vault ([14](14-runtime-verification.md)) confirmed or
  answered 21 questions. REA's runtime tools could not attach to the `app://`
  window or launch the app (the `--inspect` fuse is off), so that pass used
  `--remote-debugging-port` and a small CDP client. Network traffic and Sync were
  not exercised.
* `sim.js`'s WebAssembly module was not disassembled (no WABT on this machine).
* No native disassembler was configured, so `btime.node`, `get-fonts.node` and
  `Obsidian.com` were read from imports and strings only.
* Mobile (Capacitor) code paths ship in the same bundle but were only skimmed.
