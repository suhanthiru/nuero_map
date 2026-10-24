# Obsidian 1.14.4 — architecture overview

> Part of the [Obsidian 1.14.4 teardown](README.md). This page ties the subsystem documents together:
> how the pieces fit, what happens when you start the app or type a character, where state lives,
> which patterns repeat everywhere, and what the teardown found that looks wrong. Details and line
> citations are in the linked documents. Nothing here is Obsidian code.

## In one paragraph

Obsidian is a single-page TypeScript application, about 146k lines once pretty-printed, running in an Electron 43
window with full Node access. It has no UI framework: plain classes build DOM through helpers that `enhance.js`
adds to the browser's prototypes, and one `Component` tree owns every listener and child. The app sits on a
layered core:
- a **file-system adapter** that mirrors the disk into a flat path table;
- a **Vault** that builds a tree of file objects with stable identities;
- a **MetadataCache** that parses every note in a worker (remark-parse 8 plus about 20 Obsidian tokenizers and
  transformers) into a content-addressed IndexedDB cache, then resolves links on the main thread;
- a **Workspace** layout tree of splits, tab groups and leaves that hosts views;
- **registries** (views, embeds, post-processors, commands, link updaters, CLI handlers, Bases functions) that
  ~30 core plugins and any number of community plugins fill in through the same `Plugin` API.

The editor is CodeMirror 6 driven by a CodeMirror 5 Markdown mode, and Reading view is a separate
remark → HTML pipeline. The main process is thin: windows, an `app://` file protocol, 47 IPC channels, a CLI pipe,
menus and web-viewer ad blocking. Updates replace the whole app package (`obsidian.asar`) without reinstalling.

## Process and package model

```
 Obsidian.exe (Electron 43.7.7 main process)
 │
 ├─ resources/app.asar  ── boot loader (unminified) ── hourly update check, RSA-verified download,
 │                         picks the newest obsidian-X.Y.Z.asar in %APPDATA%\obsidian, else the bundled one
 │
 └─ obsidian.asar/main.js ── windows · app:// protocol · 47 ipcMain channels · menus · CLI pipe server
        │                     · ad-block request filter · policy.json (work edition)
        │
        ├─ starter window (starter.html/js) ── vault picker, create/open, sandbox vault
        ├─ vault window × N (index.html + app.js) ── nodeIntegration on, contextIsolation off, @electron/remote
        │     ├─ popout windows ── same process, driven by the parent window's JS, styles mirrored
        │     ├─ "Metadata Cache Worker" (worker.js) ── markdown + YAML parsing for the index
        │     ├─ second, unnamed worker.js instance (lazy) ── Reading-view section HTML for long notes
        │     ├─ "Graph Worker" (sim.js) ── WASM force simulation, PixiJS draws on the main thread
        │     ├─ pdf.js worker, word-count Blob worker
        │     └─ <webview> tags ── web viewer and canvas link cards, per-vault partition, sandboxed
        └─ help window (help.html/js)

 Obsidian.com (22.8 KB console shim) ──JSON {argv,tty,cwd}──▶ \\.\pipe\obsidian-cli-<user> ──▶ main
        ──executeJavaScript: window.handleCli(argv)──▶ app.cli   (IPC "cli" is only the on/off toggle)
```

See [01 — boot and main process](01-boot-and-main-process.md) and [12 — CLI](12-cli.md).

## The core layers

| Layer | Public name (minified id) | Job | Doc |
|---|---|---|---|
| Platform adapter | `FileSystemAdapter` (`nc`), `CapacitorAdapter` (`BA`) | flat table path → {type, ctime, mtime, size}; one FIFO I/O queue with a 60 s watchdog; native `fs.watch`; reconcile-by-stat | [02](02-vault-and-files.md) |
| Vault | `Vault` (`iI`), `TFile`/`TFolder` | object tree with identities that survive renames; read/modify/process; config folder | [02](02-vault-and-files.md) |
| Index | `MetadataCache` (`WR`) | path → {mtime, size, sha256} and sha256 → CachedMetadata in IndexedDB; worker parse; link resolution; property types | [03](03-metadata-cache-and-links.md) |
| File operations | `FileManager` (`fB`) | rename with link rewriting, new-file placement, attachments, `processFrontMatter` | [02](02-vault-and-files.md) |
| Layout | `Workspace` (`L3`) + `WorkspaceLeaf`/`Split`/`Tabs`/… | layout tree, deferred views, history, `workspace.json` | [06](06-workspace-and-ui.md) |
| Views | `MarkdownView`, Reading view, canvas, Bases, graph, PDF, … | the things in tabs | [04](04-markdown-rendering.md), [05](05-editor-and-live-preview.md), [09](09-canvas-and-bases.md), [graph](../obsidian-graph-teardown.md) |
| Extensibility | `Plugin` (`H3`), internal plugin wrapper (`Q3`) | one registration API for core and community features | [07](07-plugins-and-api.md), [11](11-core-plugins.md) |
| Services | Sync, Publish, account | WebSocket sync with client-side encryption, HTTP publish | [10](10-sync-publish-account.md) |

## What happens when…

### …the app starts

1. **Boot loader** (`app.asar/main.js`): register the privileged `app:` scheme, write a random install `id` if
   missing, pick the newest downloaded `obsidian-X.Y.Z.asar` (or the bundled one), `require` its `main.js`, and
   queue an update check. The update check runs hourly after that.
2. **Main** (`obsidian.asar/main.js`): single-instance lock and CLI pipe; read `obsidian.json` (vault registry);
   open one window per vault that was open at last quit, or the starter window.
3. **Renderer boot**: `enhance.js` patches prototypes. `app.js` loads i18n, then asks main over sync IPC for the
   vault, version, `policy` and a `terms` string. It builds the Node adapter and constructs `App`.
4. **`App` initialisation** runs about 20 timed steps (full table in [06 §1](06-workspace-and-ui.md)):
   - core setup: Vault, then Workspace, FileManager, MetadataCache and the plugin managers, then the settings modal;
   - appearance: theme, fonts and CSS;
   - managers: property types, secrets and hotkeys;
   - the **30 core plugins**, then the **community plugins**, one at a time behind a 3 s "taking long" watchdog;
   - `vault.load()`, which scans the tree while the metadata cache preloads from IndexedDB in parallel;
   - `metadataCache.initialize()`;
   - `workspace.loadLayout()` from `workspace.json`, with only visible tabs actually built;
   - `layout-ready` and the queued `onLayoutReady` callbacks, one per macrotask;
   - the opening behaviour (last note, new note or daily note).
5. **Background**: changed files are re-parsed in the worker. Links are re-resolved on the main thread in time
   slices on every launch. Unreferenced cache entries are garbage-collected after 60 s, then every 10 min.

### …you type one character in a note

1. A CodeMirror 6 transaction updates the editor state. The CM5-derived Markdown mode re-tokenises the
   affected lines through Obsidian's fork of `StreamLanguage`.
2. **Live preview** recomputes two layers:
   - inline hide/reveal per "formatting group" near the cursor (a `ViewPlugin`);
   - block widgets for embeds, math, tables, callouts and images (a `StateField`).
   Decorations are frozen while the mouse is down or an IME is composing.
3. Other open views of the same note get the unsaved text through the `quick-preview` event. A Reading view in
   a split then re-parses the note, in the worker for notes of 10,240 characters or more. It diffs top-level
   sections by HTML string equality and moves expensive widgets (Mermaid, MathJax, Prism, embeds) over from
   replaced sections.
4. **Save**: `requestSave` fires 2 s after the *first* unsaved edit; the timer is not reset by later edits.
   Saves are immediate on blur, close, mode switch and Mod-S. `vault.modify` → adapter write in the FIFO
   queue → the adapter reconciles the path before the promise resolves, so the tree is already current; the
   watcher echo is absorbed by the mtime+size check.
5. **Index**: the vault `modify` event queues the file in `MetadataCache`. It reads the file, hashes it with
   SHA-256, and if the hash is new, sends the bytes to the worker. The worker returns `CachedMetadata`, which is
   stored by hash. `changed(file)` fires, the file's links are re-resolved into `resolvedLinks` /
   `unresolvedLinks`, and `resolve(file)` fires.
6. **Consumers update**: backlinks pane, outgoing links, tags, outline, open global searches (they re-queue the
   file), Bases views (they re-evaluate just that file), the graph (it rebuilds from `resolvedLinks`), the word
   count worker (200 ms debounce), File Recovery (snapshot at most every 5 min per file), and Sync (re-uploads a
   file at most once per 10, 20 or 30 s after its last sync, depending on file size).

### …you rename a note

`FileManager` snapshots every resolvable reference in the vault, renames the file (the `TFile` object is mutated
in place, so open views and bookmarks keep working), re-resolves, and rewrites only the links whose target
changed. It keeps each link's alias, `!`, `<>` and frontmatter form. Other file types join in through
`metadataCache.linkUpdaters[ext]`; canvas is the built-in example. Whether it asks first is the
`alwaysUpdateLinks` setting. See [02](02-vault-and-files.md) and [03](03-metadata-cache-and-links.md).

## Where state lives

| Place | What |
|---|---|
| Vault folder | your notes, attachments, `.canvas` (JSON Canvas 1.0), `.base` (YAML) |
| `<vault>/.obsidian/` | `app.json`, `appearance.json`, `core-plugins.json`, `community-plugins.json`, `hotkeys.json`, `workspace.json`, `types.json`, `bookmarks.json`, `graph.json`, `<core-plugin-id>.json`, `plugins/<id>/{manifest.json,main.js,styles.css,data.json}`, `themes/<name>/`, `snippets/*.css`, `publish.json` |
| `%APPDATA%\obsidian\` | `obsidian.json` (vault registry: id → {path, ts, open}, plus `cli`, `frame`, `insider`, `isWork`, …), `obsidian.log` (never rotated), `id` (install id), downloaded `obsidian-X.Y.Z.asar`, `adblock/` lists |
| IndexedDB (app origin) | `<vaultId>-cache` v19 (stores `file`, `metadata`), `<appId>-backup` (File Recovery), `<appId>-sync` (Sync state **including the master key**), `<appId>-webview` (web viewer history, favicons) |
| localStorage (app origin) | `obsidian-account` (**plaintext** account token, shared by all vaults), `enable-plugin-<appId>` (restricted mode), `<appId>-config` (config-dir override), and, through `app.saveLocalStorage` (which prefixes `<appId>-`): `<appId>-note-fold-<path>`, `<appId>-canvas-<path>`, `<appId>-bases-group-fold-<path>`, `<appId>-mermaid-vault-trust`, `<appId>-recent-searches`, `<appId>-recent-commands`, … (`appId` is the vault id from `obsidian.json`) |
| Electron `safeStorage` | `SecretStorage` per-vault secrets for plugins: `safeStorage` ciphertext in localStorage `<appId>-secrets-encrypted` (Capacitor SecureStorage on mobile) |
| `C:\Program Files\Obsidian[Work]\policy.json` | work-edition feature policy (fails closed: a missing or malformed file turns every feature off) |

## Patterns that repeat everywhere

These are the transferable engineering ideas; each subsystem doc shows its local variant.

1. **One lifecycle primitive.** `Component` keeps a LIFO list of disposers and child components. Views, menus,
   plugins, embeds and windows all own one, so unloading anything cleans up everything it registered.
2. **Serial queues instead of locks.** File I/O (one FIFO with a watchdog), the metadata worker (one file at a
   time), Sync requests (one in flight) and workspace saves all funnel through promise chains.
3. **Reconcile, don't trust events.** File watcher events, sync pushes and metadata messages are treated as hints
   to re-stat or re-hash, never as facts.
4. **Content addressing.** The metadata cache is keyed by SHA-256, File Recovery skips identical snapshots, Sync
   compares hashes to fast-forward, and Publish finds changed files by comparing hashes.
5. **Time slicing on the main thread.** One helper yields every N items once a time budget is spent: search
   (10 files / 5 ms, then idle callback), Bases (10 files / 50 ms), Reading view (5 ms slices), link resolution
   and tree measurement. Obsidian prefers this over workers for anything that needs the vault object model.
6. **Virtualise everything.** One tree component (file explorer, search, outline, tags, bookmarks), Reading view
   sections, Canvas (R-tree culling, at most 10 mounts per frame), Bases table/cards/list, graph (progressive
   centre-out creation), deferred workspace tabs.
7. **Diff by value, reuse DOM.** Reading-view sections are reused by HTML-string equality, live-preview widgets are
   pooled by content, Canvas undo re-imports snapshots by id, and recyclers move rendered diagrams between sections.
8. **Lazy heavy dependencies.** MathJax, Mermaid, Prism, pdf.js and extra CM5 modes load on first use behind a
   promise that runs callbacks synchronously once loaded.
9. **Registries over hard-wiring.** Views by type, embeds by extension, post-processors by sort order, link updaters
   by extension, CLI handlers by name, Bases views and formula functions, URI actions, hover-link sources. Core
   features use the same registries as community plugins.
10. **Files as the source of truth.** Every feature serialises to human-readable files (Markdown, JSON Canvas,
    `.base` YAML, `.obsidian/*.json`), and most watch them for external edits (`workspace.json` is not watched).
    Config files record the mtime of their own writes so they can tell an external change from an echo.

## Third-party stack (as shipped)

| Area | Library |
|---|---|
| Shell | Electron 43.7.7 (Chromium 150), `@electron/remote` 2.1.3, native `btime`, `get-fonts` |
| Editor | CodeMirror 6 (bundled, with Obsidian forks of `@codemirror/view` and `StreamLanguage`), CodeMirror 5.64 for its Markdown mode registry and vim, lezer (Bases formulas) |
| Markdown | remark-parse 8 (old tokenizer API) + mdast-util-to-hast + hast-util-to-html, Obsidian extensions; DOMPurify 3.0.1; `yaml` v2 (YAML 1.2 core schema) |
| Rendering extras | MathJax 4.1.x, Mermaid 11.13.0, Prism 1.30.0, pdf.js 5.3.34, reveal.js 4.3.1, PixiJS 7.2.4 (graph) |
| Content tools | Turndown 7.2.0, Readability, Defuddle 0.19.2 (shipped, not referenced), diff-match-patch |
| Data structures | rbush (canvas), moment, i18next |
| Crypto | WebCrypto (AES-GCM, AES-CTR, AES-CBC-as-block, HKDF, SHA-256), Node `crypto.scrypt` / scrypt-js, an AES-SIV port of miscreant.js |
| Icons | Lucide (≈1,935 icons) |
| Mobile | Capacitor (same `app.js`, platform adapters) |

## Security model in brief

Obsidian trusts everything that runs inside it. Read [01](01-boot-and-main-process.md) and [07](07-plugins-and-api.md)
before borrowing any of this.

* **No isolation.** Vault windows run with `nodeIntegration: true`, `contextIsolation: false`, no sandbox,
  no preload, and `@electron/remote` enabled. Community plugins are evaluated with indirect `window.eval` in that
  context, so they get full Node, Electron and `window.app` access. Plugin manifests declare no permissions.
* **Mitigations that exist:**
  - per-vault Restricted mode and a trust prompt on first open;
  - a remote plugin deprecation list polled every 12 h;
  - a request filter lets only the app's own origin load vault files. The three default-session `webRequest` hooks
    and the protocol `intercept*`/`handle` methods are then overwritten with no-ops. That freeze is partial
    (`unhandle`, `unregisterProtocol`, `register*Protocol`, the other `webRequest` events and
    `setPermissionRequestHandler` stay reachable through `@electron/remote`), so it guards against accidental
    clobbering rather than being a security boundary;
  - `<webview>` tags are forced into a sandbox and allowed to navigate only to http(s);
  - Sync connects only to `*.obsidian.md` (or `127.0.0.1`), checked with built-ins captured at module load;
  - a fail-closed `policy.json` in the work edition.
* **Weak spots found:**
  - `app://<random>/` serves any absolute path;
  - downloaded app updates are signature-checked when downloaded but not when loaded. Dropping an
    `obsidian-X.Y.Z.asar` onto the window installs it after a version check and a confirmation dialog in the
    renderer, with no signature check (main's `copy-asar` only checks the filename prefix);
  - community plugin installs have no hash or signature check;
  - the CLI pipe has no authentication beyond OS permissions and an opt-in toggle, yet exposes `eval`;
  - the account token sits in plaintext localStorage and the Sync master key unprotected in IndexedDB;
  - the default session strips `X-Frame-Options` and CSP `frame-ancestors`, so any site can be iframed in a note.
* **Mermaid trust gate (1.14).** A Mermaid post-processor with no trust check is registered at bundle load, before
  the trust-gated one. **Confirmed at runtime** ([14](14-runtime-verification.md)): in an untrusted vault, Reading view
  loaded `mermaid.min.js` and called `mermaid.render` on the diagram in 6 of 7 opens, while only the "Allow" guard
  was shown. In a trusted vault each diagram is rendered twice. Live preview uses only the gated path (0 renders when
  untrusted). The gate hides output; it does not stop Mermaid from parsing untrusted diagrams ([04 §11](04-markdown-rendering.md)).

## Bugs and oddities spotted

Rows marked **runtime** were reproduced in the [runtime pass](14-runtime-verification.md); the rest come from static reading.

| Where | What | Doc |
|---|---|---|
| Link rewriting (**runtime**) | a link on the opening line of a block `%%` comment is cached 2 characters early; renaming its target corrupts the note (`%% [[B]] …` became `%[](B2.md)]] …`), breaking the comment opener | [03](03-metadata-cache-and-links.md), [14](14-runtime-verification.md) |
| Accessibility (**runtime**) | settings toggles always report "not checked" to screen readers and have no accessible name | [06](06-workspace-and-ui.md), [14](14-runtime-verification.md) |
| Web viewer clear-data dialog | the "History" toggle writes `clearAll` instead of `clearHistory`, so history is always cleared and switching History off and on wipes all browsing data | [11](11-core-plugins.md) |
| Hotkeys (**runtime**) | the first matching hotkey wins even when its command's check fails, so later bindings never run | [06](06-workspace-and-ui.md) |
| Leaf history | the 20-entry cap is a no-op (`unshift` instead of `shift`), and history is not saved | [06](06-workspace-and-ui.md) |
| Canvas (**runtime**) | unknown node types, and edges to missing nodes, are dropped on the next save. Malformed JSON fails safely (empty view, file untouched), but the notice omits the file name | [09](09-canvas-and-bases.md) |
| Bases | `!null` is `null` (**runtime**); cross-file formulas (`file.backlinks`) don't refresh when the other file changes | [09](09-canvas-and-bases.md) |
| Templates | values pass through `String.replace` unescaped (`$&` mangling), and `{{date}}` inside merged content is expanded | [11](11-core-plugins.md) |
| Sync | markdown merge calls `diff_main` with deadline 0 (coarse diffs); the backoff jitter flag can never be off | [10](10-sync-publish-account.md) |
| Vault | a corrupt `app.json` is overwritten after load; batched renames return before they run; local trash flattens folders | [02](02-vault-and-files.md) |
| Link resolution | suffix and folder tests are string checks, not path-segment aware | [03](03-metadata-cache-and-links.md) |
| Rendering | possibly inverted frontmatter invalidation check; `replaceCode` set on a context shared by code blocks; PDF "minimal" and "none" margins identical | [04](04-markdown-rendering.md) |
| Accessibility | ≈87 icon controls aren't reachable with Tab; no dialog/menu/tree/tablist roles; toasts not announced; reduced motion honoured in one place | [06](06-workspace-and-ui.md) |

## Numbers worth knowing

| Constant | Value | Doc |
|---|---|---|
| Editor save | 2 s after the first edit (not a trailing debounce); immediate on blur, close, mode switch | 05 |
| Layout save (`workspace.json`) | at most once per second | 06 |
| Config save / external reload | 1 s debounce / 500 ms after a newer mtime | 02 |
| File-system operation watchdog | 60 s | 02 |
| Watcher delete re-check | 100 ms | 02 |
| Text cache | notes up to 65,536 chars | 02, 08 |
| Metadata cache | IndexedDB v19; GC 60 s after start then every 10 min; loads in pages of 300 | 03 |
| Reading view | worker parse at ≥10,240 chars; 5 ms render slices; one viewport (≥500 px) kept attached; embed depth 5 | 04 |
| Hover preview | 300 ms delay, 500 ms mouse-out poll | 04 |
| Global search | 10 files per check, yield after 5 ms | 08 |
| Quick switcher / palette | 20 results; ≤100 recent commands remembered | 08 |
| Bases scan | 10 files per check, yield after 50 ms (16 ms timeout); view notify debounce 50 ms | 09 |
| Canvas | zoom 1/16×–2×; ≤10 node mounts per frame; 100 undo snapshots, 250 ms merge | 09 |
| Sync | ≤2 MiB binary chunks; 20 s heartbeat (ping after 10 s idle, drop after 120 s); 60 s request timeout; 199 MiB default file cap | 10 |
| Sync crypto | scrypt N=32768 r=8 p=1 → 32-byte key; HKDF-SHA256 sub-keys; AES-256-GCM (12-byte IV) content; AES-SIV paths | 10 |
| File Recovery | ≤1 snapshot per 5 min per file; 7-day retention | 11 |
| Plugin load watchdog / boot watchdog | 3 s / 20 s | 07, 06 |
| Update check | hourly; deprecation list every 12 h; ad-block lists every 4 days | 01, 07 |

## Open questions

A [runtime pass](14-runtime-verification.md) on a throwaway vault answered most of the earlier list:
- the Mermaid gate does not stop rendering;
- `&&` binds tighter than `||` in Bases;
- saving from the editor converts CRLF to LF;
- the hotkey bug is real;
- links in comments are indexed;
- toggles misreport their state to screen readers.

What remains:

| Question | Probe |
|---|---|
| What v3 Sync encryption changes server-side; what the server answers when it needs an upload body | WebSocket capture of a test vault (own subscription) |
| Windows watcher overflow on mass changes | unzip 10k files into a vault |
| Actual NVDA speech (the accessibility tree is now known) | NVDA session on a throwaway vault |
| `sim.js` WASM force constants | disassemble with WABT |

REA's runtime tools could not attach to Obsidian's `app://` window, and its owned-launch capture is blocked by the
disabled `--inspect` fuse, so the runtime pass used `--remote-debugging-port` with a small CDP client
([14](14-runtime-verification.md)).
