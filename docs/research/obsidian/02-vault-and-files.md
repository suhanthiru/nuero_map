# Vault and storage layer (Obsidian 1.14.4 desktop)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian keeps a vault as a plain folder on disk and mirrors it in memory in two layers. The lower layer is the
**adapter** (`FileSystemAdapter` on desktop, `CapacitorAdapter` on mobile). It owns a flat table that maps each
normalized vault path to its on-disk "real path" plus a stat (`ctime/mtime/size`). It runs every filesystem operation
through **one serialized promise queue** guarded by a 60 s watchdog, and it turns both its own writes and native
`fs.watch` notifications into a small set of string events (`file-created`, `modified`, `renamed`, ...). The upper
layer is the **Vault** (`iI`). It turns those events into a tree of long-lived `TFile`/`TFolder` objects, which keep
the same identity across renames. It also keeps a bounded text cache in a WeakMap and re-emits public events
(`create/modify/delete/rename/raw/config-changed`). Above both sits the **FileManager** (`fB`). It holds the user-level
policy: where new notes and attachments go, how links are written, link rewriting after a rename (a snapshot-and-diff
algorithm over the metadata cache), trash policy, and front-matter edits. Paths and files whose name starts with a dot
(`.obsidian`, `.trash`, `.git`) never enter the tree. They show up only as `raw` path events, and the config
subsystems listen for those to detect external edits to `app.json`, plugin `data.json` files, and so on. In the
Electron main process, the vault "identity" is a 16-hex-character id in `%APPDATA%\obsidian\obsidian.json`.
Vault files are served to the renderer through a per-launch random `app://<36 hex>/` origin.

---

## Where it lives

| Minified id | Public / inferred name | Role | Lines (pretty) |
|---|---|---|---|
| `Tl` `Dl` `Pl` `Il` `Ll` `Ol` `Nl` `Vl` | basename / dirname / basename-no-ext / strip-ext / ext (lowercased) / join-ext / linktext name helpers | pure path-string helpers on `/`-separated vault paths | app.js:24136-24183 |
| `Al` | `isHiddenPath` (inferred) | true if **any** path segment starts with `.` | app.js:24144 |
| `Rl` | (inferred) `normalizeSlashes` | collapse `\` and `/` runs to `/`, trim leading/trailing `/`, empty becomes `/` | app.js:24170 |
| `Fl` | **`normalizePath`** (export map) | `Rl` + replace U+00A0/U+202F with space (`xl`, app.js:24133) + `.normalize("NFC")` | app.js:24167 |
| `Bl` | (inferred) | slashes only, no trimming | app.js:24174 |
| `Hl` / `zl` | MIME to extension map | used for pasted/downloaded data | app.js:24184-24210 |
| `Ul` | stat to `{ctime,mtime,size}` | `ctime` = rounded **birthtimeMs**, not POSIX ctime | app.js:24218 |
| `Gl` | debounce/throttle factory | `(fn, ms, resetOnCall)` with `.cancel()` / `.run()` | app.js:24224-24265 |
| `Yl` | microtask coalescer | at most one call per microtask, latest args | app.js:24267 |
| `nc` | **FileSystemAdapter** | desktop adapter (Node `original-fs`) | app.js:24289-25327 |
| `wA/kA/CA/EA/MA/SA/xA` | forbidden-character tables | per-platform name rules | app.js:46758 |
| `TA` / `DA` / `AA` | isValidPath / **checkPath** (throws) / sanitize | name validation | app.js:46759-46790 |
| `PA` | error normalizer | maps "does not exist" messages to `code = "ENOENT"` (mobile) | app.js:46791 |
| `LA` | mobile FS wrapper over Capacitor `Filesystem` plugin (`Dw`) | 5 MiB inline threshold, 1 MiB chunked appends | app.js:46806-47135 |
| `BA` | **CapacitorAdapter** | mobile adapter | app.js:47140-48029 |
| `WT` | serial promise queue | `then(task, task)` chaining | app.js:45293 |
| `GP` | external-file monitor (inferred name) | one `fs.watch` per opened out-of-vault file, inode check | app.js:50025-50106 |
| `KP` | external file manager | `file:`-prefixed paths, WeakRef cleanup every 5 s | app.js:50107-50168 |
| `YP` | appearance key list | keys routed to `appearance.json` | app.js:50169 |
| `XP` | vault config defaults | `getConfig` fallback table | app.js:50169-50229 |
| `QP` | **Events** | `on/off/offref/trigger/tryTrigger` | app.js:50230-50283 |
| `$P` | `".obsidian"` | default config dir | app.js:50283 |
| `ZP` | **TAbstractFile** | `vault, path, name, parent, deleted` | app.js:50283-50299 |
| `JP` | content cache | `WeakMap<TFile,string>` | app.js:50299 |
| `eI` | **TFile** | `stat, basename, extension, saving` | app.js:50299-50334 |
| `tI` | **TFolder** | `children[]`, `isRoot()` | app.js:50334-50362 |
| `nI` | TExternalFile | path = `file:` + absolute path, `users` set, `monitor` | app.js:50362-50392 |
| `iI` | **Vault** | tree, config, read/write API | app.js:50392-51226 |
| `GL` | DataTransfer to file list | paste/drop extraction, Electron clipboard fallbacks | app.js:53046-53090 |
| `KL` / `YL` / `XL` | rename validation / plus warning / perform rename | file-explorer naming rules | app.js:53091-53126 |
| `TR` / `DR` | drop-effect tables | `effectAllowed` checks | app.js:61903-61921 |
| `AR` | drag manager (`app.dragManager`) | ghost, edge scroll, draggable payloads | app.js:61922-62222 |
| `IR` | draggable to link text | file/files/link/heading/bookmarks | app.js:62230-62267 |
| `OR` | editor paste/drop handler | attachments, HTML, uri-list | app.js:62268-62483 |
| `zR` / `qR` | apply link changes to text / rewrite one link | used by every link updater | app.js:62609-62660 |
| `WR` | **MetadataCache** (relevant bits) | `linkUpdaters`, `iterateAllRefs`, `updateInternalLinks`, `fileToLinktext`, `isUserIgnored` | app.js:62666-63482 |
| `QR` | metadataTypeManager | `types.json` | app.js:63509-63755 |
| `hB` / `pB` / `dB` | rename heading / block id, updating links | subpath renames | app.js:64179-64297 |
| `fB` | **FileManager** | policy layer | app.js:64297-65012 |
| `vB` / `gB` / `mB` / `yB` | process-front-matter core / compute link change / deep merge / split front matter | | app.js:65013-65060 |
| `Dm` / `Am` | wikilink / markdown-link regexes | | app.js:34318 |
| `zm` / `qm` / `jm` | getLinkpath / parseLinktext / iterate refs of a cache | | app.js:34542-34565 |
| `Xm` | stripHeadingForLink | also used to sanitize attachment names | app.js:34586 |
| `rte` | canvas link updater (implements the generic `linkUpdaters` contract) | | app.js:126517-126636 |
| `Q3` / `Z3` | internal (core) plugin wrapper / manager | `<id>.json`, `core-plugins.json` | app.js:109920-110129 / 110129-110234 |
| `U3` + `H3` (Plugin) | community plugin manager / plugin `loadData`-`saveData` | `community-plugins.json`, `plugins/<id>/data.json` | app.js:109230-109880; `H3` 108925-109178 |
| hotkey manager | | `hotkeys.json` | app.js:46176-46235 |
| `oD` | custom CSS | `themes/`, `snippets/` | app.js:45482-46105 |
| Workspace `L3` bits | `T3/D3` = `workspace.json` / `workspace-mobile.json` | layout persistence | app.js:106543, 107488-107510, 107817-107840 |
| `P3` | recent files tracker | `lastOpenFiles` | app.js:106546-106600 |
| `xoe` (App) | `initializeWithAdapter`, `saveAttachment`, `getOverrideConfigDir`, boot | | app.js:144983-145300, 146021, 146222, 146258-146383 |
| Settings "Files & links" | option lists and config-folder override UI | | app.js:143120-143360 |
| main.js | `app://` protocol, vault registry, IPC `vault*`, `trash` | | main.js:3837-3868, 4071-4081, 4365-4416, 4589-4700, 4896-5205, 5372-5392, 5557 |
| btime addon | `resources/app.asar.unpacked/node_modules/btime` | sets file **birth time** (Windows/macOS) | install dir (binary) |

---

## How it works

### 1. Layering and object model

* **Adapter table** (`nc.files`, observed app.js:24299, 25154-25161). A plain object keyed by the **normalized vault
  path** (no leading slash; the root is `"/"`). Each value is one of these shapes:
  * `{type:"file", realpath, ctime, mtime, size}`
  * `{type:"folder", realpath}`

  `realpath` is the vault-relative path *as it exists on disk*: the casing and Unicode form the OS reported, or a
  path through a symlink. Folders carry no stat.
* **Vault map** (`iI.fileMap`, app.js:50395). A plain object from path to a `TAbstractFile`. Every object has a
  `parent` pointer, and every folder has an **unsorted** `children` array (sorting is a UI concern). The root is a
  `TFolder` with `path "/"` and an empty `name` (app.js:50446-50448). `isEmpty()` means "only the root exists".
* **Identity is stable.** A rename mutates the existing object in place (`setPath`, app.js:50691-50700). It does not
  create a new one. The link-update algorithm (section 21) depends on this (observed).
* `TFile.basename` is the name without the last extension. `extension` is lowercased. Names like `.x`, `x.` or
  `noext` have no extension (`Pl`/`Ll`, app.js:24152-24163) (observed).
* `TFile.saving` is a counter of writes in flight (section 13).
* `TFile.stat` is set from adapter events (`file-created`, `modified`) (app.js:50669-50681).

### 2. Path model and normalization

* All vault paths use `/`. **`normalizePath` (`Fl`)** does four things (observed app.js:24167-24173):
  1. collapses runs of `/` or `\` into one `/`,
  2. strips leading and trailing slashes, mapping an empty result to `/`,
  3. turns NBSP (U+00A0) and narrow NBSP (U+202F) into spaces,
  4. applies Unicode **NFC**.
* Every public Vault entry point normalizes its input (`create`, `createBinary`, `createFolder`, `rename`, `copy`,
  `exists`, `readRaw`). `read(file)` uses `file.path`, which is already normalized (observed app.js:50733-51035).
* The adapter keeps both forms. The key is NFC; `realpath` is whatever `readdir` returned (macOS may return NFD).
  `getRealPath(path)` walks up the ancestors until it finds a known entry, then appends the remaining suffix to that
  entry's `realpath` (observed app.js:25260-25269). `getFullPath` joins the result with `basePath`. A path that
  starts with `file:` is treated as an **absolute OS path**: `getFullPath` only strips the `file:` prefix
  (app.js:25270-25275). This is how external files share the same adapter.
* The desktop adapter uses Node's **`original-fs`**, not `fs` (app.js:146358). Inferred reason: Electron's
  asar-aware `fs` would treat a `.asar` file inside a vault as a directory.

### 3. Serialized I/O queue and the 60 s watchdog

* Each adapter has a single `promise` chain. `queue(task)` appends the task with `then(run, run)`, so one failure
  does not break the chain. **Every operation is strictly FIFO**: reads, writes, stats, existence checks, and the
  reconciliations triggered by watchers (observed app.js:25282-25292).
* On desktop, each queued task is raced against a promise whose `reject` is saved in `killLastAction`.
  `thingsHappening` is a **60 000 ms trailing debounce** of `kill()`. The timer is re-armed when a queued task
  **starts running** (the call sits inside the task wrapper, not in `queue()` itself), and `listRecursive` re-arms it
  once per directory. Queuing more work does not re-arm it, because queued tasks cannot start while one is stuck. So
  any single task that runs 60 s without such a ping is rejected with `Error("File system operation timed out.")`
  and the queue moves on. The underlying fs call is not cancelled (observed app.js:24291, 25279-25292; consequence
  inferred). Its purpose is to keep a stuck
  network drive from freezing the whole app.
* The mobile adapter queue has **no watchdog** and no race (observed app.js:48018-48022).
* `WT` (app.js:45293) is the same chaining pattern without the race. FileManager uses it for link updates, and CSS
  uses it for theme loads.

### 4. Initial scan (`Vault.load`, app.js:50600-50615)

1. `adapter.watch(vault.onChange)` (app.js:24951-24968):
   1. stops any existing watchers and sets `handler`,
   2. calls `startWatchPath("/")` **before** listing, so no change is missed,
   3. queues `listAll()`.
2. `listAll` resets the table to `{ "/": folder }` and calls `listRecursive("")` (app.js:24325-24360):
   1. `readdir` the directory,
   2. for each child, emit `raw`,
   3. hidden children go to `reconcileDeletion`; all others go to `reconcileFileInternal` (`lstat`),
   4. **all children of a directory run in parallel** (`Promise.all`), and sub-folders recurse through
      `reconcileFolderCreation`.

   The whole scan occupies **one queue slot**, so watcher events that arrive meanwhile wait behind it (observed).
   Inferred: concurrency is unbounded at the JS level but limited by libuv's thread pool.
3. On Linux only, `watchHiddenRecursive(configDir)` follows (section 6).
4. Each `file-created` / `folder-created` event becomes `TFile` / `TFolder` creation plus a **`create`** event, **on
   initial load too**. The metadata cache and other consumers therefore treat startup as a large batch of creations
   (observed app.js:50661-50675; consequence inferred).
5. Boot order in `initializeWithAdapter` (app.js:144983-145262):
   1. `new Vault(adapter)`,
   2. a sanity probe `readRaw("")`; ENOENT means the vault folder vanished, so the vault chooser opens,
   3. apply the config-dir override,
   4. `setupConfig()`,
   5. create the managers, load hotkeys and plugins,
   6. `metadataCache.preload()`, then **`vault.load()`**,
   7. `metadataCache.initialize()`, then `workspace.loadLayout()`.

### 5. File watching (desktop)

| Platform | Mechanism | Hidden folders | Evidence |
|---|---|---|---|
| Windows, macOS (`tc` true) | **one** `fs.watch(basePath, {recursive:true, persistent:false, encoding:"utf8"})` | covered by the recursive root watcher | app.js:24289, 25046 |
| Linux | one non-recursive `fs.watch` **per directory**, added by `reconcileFolderCreation` | only `configDir` and its subfolders (`watchHiddenRecursive`) | app.js:25172, 24969-25019 |
| any | extra watcher for each **symlinked directory** (a recursive watch does not follow links) | n/a | app.js:25217 |

* There is **no chokidar and no polling** on desktop (observed). On mobile, a native plugin delivers events through
  `Dw.addListener("change")` (app.js:47836).
* The `change` callback receives `(eventType, filename)`. The adapter ignores the event type and builds
  `watchedRealPath + "/" + filename`, then calls `onFileChange`. A watcher `error` triggers `onFileChange` on the
  watched folder itself, which notices when that folder was deleted (observed app.js:25046-25052).
* `onFileChange` normalizes the slashes, defers through `setTimeout(0)`, NFC-normalizes, and queues
  `reconcileFile(realpath, path, confirmed=false)` (app.js:25063-25071).
* **There is no time-window debounce.** Coalescing comes from three places (observed):
  1. a burst of events becomes queued reconciles, and each reconcile re-`stat`s the current state;
  2. **modification events are suppressed when `mtime` (rounded to ms) and `size` are both unchanged**
     (app.js:25149), which absorbs duplicate notifications and the echo of the app's own writes;
  3. **an unconfirmed deletion is re-checked after 100 ms** (section 7), which absorbs "delete then recreate"
     atomic saves from external editors.
* When a raw path under `configDir` arrives, the Vault calls `watchHiddenRecursive` on it so that new plugin folders
  get watched. This is a no-op on Windows/macOS (observed app.js:50703, 24975).

### 6. Reconciliation algorithm (the core)

`reconcileFile(realpath, path, confirmed=true)` (app.js:25079-25117) runs these steps in order:

1. Emit **`raw(path)`**, for every path, including hidden ones.
2. If `Al(path)` (hidden), go to `reconcileDeletion` and stop. Hidden entries are therefore never kept.
3. If the parent is not in the table, reconcile the parent first. Missing ancestors are created top-down.
4. On a case-insensitive FS (not for the root): `readdir` the parent and require that the **exact** basename
   (after NBSP mapping and NFC) is listed. If it is missing, treat the path as deleted. This catches case-only
   renames made outside the app (observed app.js:25096-25099).
5. `lstat` the path:
   * **file**: `reconcileFileCreation`. If the entry already exists as a file, update `realpath` and emit
     `raw` + **`modified`** only if `mtime` or `size` changed. If it existed as a folder, remove it first. A new
     entry emits **`file-created`** with its stat.
   * **directory**: `reconcileFolderCreation`. A new entry emits **`folder-created`**, starts a watcher (Linux),
     and runs `listRecursive` on its contents. An existing entry only gets its `realpath` refreshed.
   * **symlink**: section 11.
6. ENOENT goes to `reconcileDeletion(confirmed)`. Other errors are logged with `console.error` and ignored.

`reconcileDeletion(realpath, path, confirmed)` (app.js:25230-25256):

* For path `"/"`, emit **`closed`**. The vault root vanished; the App reopens the vault chooser
  (app.js:145000-145002).
* Stop any watcher on the path. If the path is unknown, return.
* If **not confirmed** (the event came from a watcher), schedule `reconcileFile(path)` again after **100 ms**,
  confirmed this time, and return.
* Otherwise remove all descendants (prefix scan over the whole table) and the entry itself, emitting
  **`file-removed`** / **`folder-removed`**.

The adapter's own operations (`write`, `mkdir`, `remove`, `trash*`, `copy`, `update`) finish by calling
`reconcileInternalFile(path)`, which is a **confirmed** reconcile. As a result, **the Vault tree is already updated
when the write promise resolves**. `Vault.create` relies on this: it returns `getAbstractFileByPath(path)` right
after `adapter.write` (observed app.js:50745-50748).

### 7. Event vocabulary

| Adapter event (handler args) | Vault reaction | Public Vault event |
|---|---|---|
| `raw(path)` | reload config if the path is `app.json` / `appearance.json`; watch new hidden folders (Linux) | `raw(path)` |
| `folder-created(path)` | `new TFolder`, attach to parent | `create(folder)` |
| `file-created(path, path, stat)` | `new TFile`, set `stat`, attach | `create(file)` |
| `modified(path, path, stat)` | update `stat`; **drop cached text unless `saving > 0`** | `modify(file)` |
| `file-removed` / `folder-removed(path)` | detach, delete from map, set `deleted = true` | `delete(file)` |
| `renamed(newPath, oldPath)` | detach, `setPath`, reattach under the new parent, move the map key | `rename(file, oldPath)` |
| `closed(path)` | | `closed` |
| — | `setConfig` / external reload | `config-changed(key)` |
| — | an external file gains its first user | `external-watch(file)` |

(observed app.js:50661-50704, 50385, 50536)

`Events.trigger` copies the listener list before iterating. **A listener exception is rethrown asynchronously**
through `setTimeout`, so one bad plugin cannot break event delivery (observed app.js:50262-50281).

### 8. Hidden files, ignored folders, user filters

* **Hidden rule:** a path is hidden if any segment begins with `.` (`Al`). Hidden paths are excluded from the tree on
  every adapter, which covers `.obsidian` (or any custom config dir), `.trash`, `.git` and `.DS_Store`
  (observed app.js:24144, 24370, 25087). `node_modules` and similar names are **not** excluded by the vault (only
  Sync filters them).
* Plugins and core code reach hidden files through `vault.adapter` directly (`read`, `write`, `exists`, `list`,
  `stat`). The Vault's `readConfigJson` / `writeJson` / `readPluginData` helpers wrap the adapter (observed
  app.js:50538-50598).
* The file explorer refuses user-typed names that start with `.` (`msgBadDotfile`, app.js:53091-53095). Inferred
  reason: such a file would vanish from the tree immediately.
* **`userIgnoreFilters`** ("Excluded files") is *not* a filesystem filter (observed):
  * It is stored as an array of strings in `app.json`, and `null` when empty (app.js:143289-143291).
  * The MetadataCache compiles each entry when the `config-changed` event fires (app.js:63414-63430):
    * `/.../`-wrapped entries become a case-insensitive regex;
    * any other entry becomes a case-insensitive **prefix** match (`^` + escaped string).
  * `isUserIgnored(path)` memoizes results per path (app.js:63435).
  * Search, graph, quick switcher, backlinks, properties, bases and metadata iteration consult it (for example
    `iterateFileCache`, app.js:62727-62733, and many call sites at 93841, 99813, 111585, 119810, ...).
  * Excluded files still exist in `vault.fileMap`, still get `create/modify` events, and still show in the file
    explorer.
* `showUnsupportedFiles` (default false) hides files whose extension has no registered view. This is a UI-level
  filter (app.js:63431-63434).

### 9. Case-insensitive filesystems and Unicode

* At construction, `insensitive` defaults to `macOS || Windows`. `testInsensitive()` then probes the real FS
  (observed app.js:24304-24318):
  1. delete any stale `<vault>/.OBSIDIANTEST`,
  2. create `<vault>/.OBSIDIANTEST`,
  3. check whether `.obsidiantest` exists,
  4. delete the probe.

  So a case-sensitive APFS volume or a case-folding Linux mount is detected correctly.
* Effects of the flag:
  1. **`reconcileFile`** confirms the exact name with `readdir` (section 6).
  2. **`rename`** allows the destination to "exist" only when it differs from the source by case alone, which enables
     case-only renames (app.js:24765-24766).
  3. **`exists(path, sensitive=true)`** also checks the exact name through `readdir` (app.js:24879-24883).
* **Lookups in the vault are case-sensitive.** `getAbstractFileByPathInsensitive` is a **linear scan** over
  `fileMap`. `getAvailablePath` uses it, so on every OS a new `Untitled.md` collides with an existing `untitled.md`
  (observed app.js:50638-50647, 51056-51061).
* The CapacitorAdapter's `testInsensitive` is a no-op, so on mobile the flag stays false (observed app.js:47148-47166).

### 10. Symlinks

* `lstat` is used, so links are detected (app.js:25125-25134). `reconcileSymbolicLinkCreation` (app.js:25188-25229)
  handles them:
  1. Resolve the target with `fs.realpath`. If the target is broken, ignore the link silently.
  2. **Loop and duplicate guard:** if another watcher's resolved path equals the target, or is an ancestor or
     descendant of it, ignore the link. This also blocks links that point back into the vault.
  3. `stat` (following the link). A file becomes a normal file entry. A directory gets its own watcher (on
     Windows/macOS too, because the recursive root watch does not follow links), then `reconcileFolderCreation`.
* Real paths stay link-relative, so writes go through the link.
* `watchers[path].resolvedPath` stores the canonical target of every watched directory (app.js:25053).
* `watchHiddenRecursive` uses `lstat`, so it does not follow symlinked subfolders of `.obsidian`.

### 11. Read path and the content cache

* `adapter.read`: `readFile(utf8)` inside the queue. `readBinary` returns an `ArrayBuffer` slice copied out of the
  Node Buffer (`Xl`) (app.js:24481-24523).
  * Inferred bug: in `read`, the `try/catch` wraps a *returned* promise. An async read error therefore never
    triggers the intended "reconcile after failed read", although `readBinary` does trigger it.
* **`vault.read(file)`** strips a leading **UTF-8 BOM** (U+FEFF) and caches the text (app.js:50793-50806).
  `readRaw(path)` performs no BOM strip and no caching. `adapter.process` and `readJson` see the raw text, BOM
  included (inferred: a BOM-prefixed JSON config file fails to parse).
* **`cachedRead(file)`** returns the WeakMap entry if one exists, otherwise calls `read`. There is no stat check, so
  correctness depends on watcher invalidation (observed app.js:50807-50813).
* Cache admission (observed app.js:50318-50329, 50400, 50456-50464):
  * text longer than `cacheLimit` is not cached;
  * `cacheLimit` defaults to **65 536** characters and can be changed with `setFileCacheLimit`, which also evicts
    entries over the new limit;
  * `readBinary` of an `.md` file at or under the limit decodes UTF-8 and fills the cache.
* Invalidation: an external `modified` event clears the cache **unless** a write is in flight (`saving > 0`);
  delete or rename keeps the object, which `deleted` or the new path marks.
* **Encoding:** always UTF-8. No encoding detection, and no line-ending conversion in the adapter or the vault
  (observed: plain `utf8` reads and writes). Inferred: CRLF files survive `vault.process` byte-for-byte. The editor
  path (CodeMirror 6 splits on `\r\n?|\n` and joins with `\n` by default, app.js:14891-14947) will normalize to LF
  when a CRLF note is saved from the editor. **Confirmed at runtime** ([14](14-runtime-verification.md)): after one
  edit and a save from the editor, the whole file was rewritten with LF line endings.
* `iterateFiles` / `generateFiles` are async generators that yield `{file, content}`. They read only `md`
  (`generateFiles` also reads `canvas`), optionally through the cache (app.js:51131-51216).

### 12. Write path, write options, birth time

* **Adapter writes are not atomic.** Each one is a direct `writeFile` / `appendFile` on the target, with no temp
  file and no rename (observed app.js:24524-24641). Afterwards `applyWriteOptions` runs, and a `finally` block runs
  `reconcileInternalFile` even if the write failed.
* `applyWriteOptions(fullPath, {ctime, mtime, immediate})` (app.js:24675-24690), in order:
  1. `ctime`: call **`btime(fullPath, ctime)`** synchronously, which sets the *birth/creation* time;
  2. `mtime`: `fs.utimes(path, mtime/1000, mtime/1000)`, setting both atime and mtime;
  3. `immediate()`: a callback the Vault uses to update its cache **after the bytes land and before
     reconciliation emits `modified`**.
* **btime addon** (observed in the install folder `resources/app.asar.unpacked/node_modules/btime`; package says
  "Change the birth time (btime) of a file on Windows and MacOS"):
  * It is an N-API module (node-addon-api 6.1.0). Its JS shim validates the path (non-empty, no NUL) and the time
    (an integer in ms, `0 ≤ t ≤ 2^48-1`), converts the path to a long path (`\\?\` on Windows), and calls the
    binding.
  * On Windows the binary imports **`CreateFileW` + `SetFileTime` + `CloseHandle`**.
  * On Linux it is a no-op. A non-zero native result throws.
  * The renderer loads it through `require("btime")` inside a try block. If loading fails, `btime` becomes a no-op
    (app.js:146364-146372).
  * The main user is **Sync**, which passes `{ctime, mtime}` from the server when writing downloaded files
    (app.js:139873-139889, 140142-140161). Undo of bulk edits restores `mtime` (app.js:64995).
* Vault-level wrappers (app.js:50896-51019):
  * `create` / `createBinary` / `createFolder`: normalize, run `checkPath`, run `adapter.exists` (case-insensitive
    on insensitive FS), and throw `"File already exists."` / `"Folder already exists."`. Inferred: the `exists` check
    runs in a separate queue slot from the write, a small TOCTOU window.
  * **`modify(file, text, opts)`**: `saving++`; `opts.immediate` writes the new text into the cache; on error the
    cache is cleared and the error rethrown; `finally` runs `saving--`.
  * `modifyBinary` / `append` / `appendBinary`: same pattern, but `immediate` **clears** the cache.
  * **`process(file, fn, opts)`**: the adapter reads, calls `fn(text)` synchronously, and **skips the write if the
    result equals the input**; otherwise it writes. The whole read-modify-write occupies **one queue slot**, so it is
    atomic relative to other app I/O but not relative to external editors (observed app.js:24642-24674). The Vault
    then caches the result.
* **Echo suppression for own writes:** the write's own reconcile emits `modified` once. The later `fs.watch`
  notification finds the same mtime and size and stays silent (inferred from app.js:25149).
  * Edge case (inferred): an external or Sync write that keeps **both** the old size and an identical `mtime` emits
    no `modify` event, so caches and metadata can go stale.
* **Timestamps:** `ctime` = `Math.round(birthtimeMs)`, `mtime` = `Math.round(mtimeMs)` (app.js:24218).
  Inferred: on Linux filesystems without birth time, `ctime` may be 0 or fall back to whatever Node reports.

### 13. Rename, copy, delete, trash

* **`adapter.rename(old, new)`** (app.js:24750-24791):
  1. Refuse if the destination exists, unless this is a case-only change on an insensitive FS; the error is
     `"Destination file already exists!"`.
  2. `fs.rename`.
  3. **Without re-statting**, re-key the table entry, recompute `realpath`, and emit `renamed(new, old)`.
  4. For folders, move the folder's own watcher, then re-key and emit `renamed` for **every descendant** (prefix
     scan). Descendant events follow the folder's event, so in `Vault.onChange` the folder already sits at its new
     key when the children move, and they stay in its `children` array.
  5. The later watcher events for the old path find nothing in the table, and the new path's stat matches, so no
     duplicate events fire (inferred).
* `vault.rename(file, newPath)`: normalize, `checkPath`, `adapter.rename`. It does **not** create missing parent
  folders. External files go to the external file manager (section 14).
* `getNewPathAfterRename(name)` (app.js:50294-50317) replaces control characters `\x00-\x1F` with spaces, trims,
  re-appends the original extension for TFiles, and prefixes the parent path. The rename UI therefore cannot change
  an extension; `fileManager.renameFile` with a full path can.
* `copy`: recursive copy with **`COPYFILE_EXCL`**, which refuses to overwrite, then a reconcile of the destination
  (app.js:24792-24853). `vault.copy` additionally NFC-normalizes and checks the path.
* `delete`: `unlink` for files. For folders it uses `fs.rm(path, {recursive: force, maxRetries: 5})`, with retries
  for Windows `EBUSY`/`EPERM` (app.js:24460-24480, 50844-50861).
* **Trash** (`trashOption`: `"system"` by default, `"local"`, or `"none"`; FileManager.trashFile app.js:64700-64723):
  * `system`: `vault.trash(file, true)`, then `adapter.trashSystem`, then the **sync IPC `trash`**, where the main
    process calls `shell.trashItem(fullPath)` and returns true or false (main.js:5187-5196, app.js:146361-146363).
    **If the system trash fails, the vault falls back to local trash** (app.js:50862-50878).
  * `local`: `trashLocal` creates `<vault>/.trash` and moves the item there **flattened to its basename**, so folder
    structure is not preserved. Name collisions get `" 2"`, `" 3"`, ... before the extension (app.js:24428-24459).
    `.trash` is hidden, so it never appears in the tree. A desktop command `workspace:show-trash` reveals it in the
    OS file manager when the option is `local` (app.js:107359-107364).
  * `none`: `vault.delete(file, force=true)`, which is permanent.
* **Delete prompt and unlinked attachments** (`promptForDeletion`, app.js:64608-64677):
  1. If `promptDelete` (default true), confirm. The dialog text depends on the trash mode and warns about non-empty
     folders and existing backlinks. A "don't ask again" checkbox sets `promptDelete = false`.
  2. Collect the deleted note's resolved outgoing links to **non-note** files, meaning extensions other than
     `md/canvas/base` (`Lx`, app.js:43280).
  3. Trash the note.
  4. Remove from that set any file still linked from any other file in `resolvedLinks`.
  5. Apply `deleteUnlinkedAttachments`: `always` trashes them, `ask` shows a checklist modal (`tB`), `never` keeps
     them.

### 14. External files (outside the vault)

* On desktop only (`canOpenExternalFiles`), `getFileByPath`, `getAbstractFileByPath` and
  `getAbstractFileByPathInsensitive` fall through to `externalFileManager.getExternalFile(path)` for paths that start
  with `file:` (app.js:50616-50647).
* `KP.getExternalFile` (app.js:50115-50137):
  1. resolve to an absolute path with forward slashes;
  2. **`lstatSync`** the path, a synchronous call on the UI thread; anything that is not a regular file is ignored;
  3. create a `TExternalFile` whose path is `file:<abs>` and a monitor `GP` that holds only a **`WeakRef`** to the file;
  4. start a **5 s interval** that drops entries whose TFile was garbage-collected, and stop the interval when the
     map is empty (app.js:50161-50167).
* Views call `file.addUser(view)` / `removeUser` (app.js:55245-55259, 99343-99349). The first user starts the monitor
  and emits `external-watch`, which makes the metadata cache parse the file. The last user stops the monitor and
  clears the cache and metadata (app.js:50383-50390).
* The monitor `GP` (app.js:50038-50105) works like this:
  * It runs `fs.watch` on the single file. On non-Windows systems it records the **inode** and, when the inode
    changes (an atomic replace by another editor), restarts the watch on the new inode.
  * On each change it `lstat`s the file and compares `ctime`/`mtime`/`size`. A difference triggers vault `modify`,
    with the cache cleared unless saving. A missing file stops the monitor and triggers vault `delete`.
* Renaming an external file calls `adapter.rename("file:"+old, "file:"+new)`. The adapter has no table entry for it
  and emits nothing, so the manager re-keys the entry itself and emits vault `rename` (app.js:50142-50160).
  `fileManager.renameFile` skips link updates for external files (app.js:64409).

### 15. Resource URLs (`getResourcePath`) and the `app://` protocol

* The renderer asks the main process for `file-url` and gets back **`app://` + 36 random hex characters + `/`**,
  regenerated **on every launch** (main.js:4365, 4981-4983; app.js:36710).
* `adapter.getResourcePath(path)` (app.js:24691-24698):
  1. convert the absolute path to a `file:` URL;
  2. strip `file:///`, or turn the `file://` UNC prefix into `%5C%5C`;
  3. prepend the prefix;
  4. append `?<mtime>` as a **cache buster**, or `Date.now()` if the file is unknown.

  Inferred consequence: resource URLs must never be persisted.
* The main process prefers `protocol.registerFileProtocol` and falls back to `protocol.handle` only when the old API
  is missing (main.js:4896-4950). Electron 43.7.7 still has `registerFileProtocol` (observed in the `Obsidian.exe`
  strings), so the file-protocol branch is the one that runs (see [01 §5](01-boot-and-main-process.md)):
  * `app://obsidian.md/...` serves the app bundle from the loaded asar, guarded against path traversal, and sets
    `X-Frame-Options: DENY`.
  * `app://<random>/...` serves **any absolute path on disk**; there is no vault-root check (observed). On non-Windows
    a leading `/` is restored.
  * **UNC/network paths** get `X-Frame-Options: DENY` and a **"network drive" confirmation dialog per host**. An
    allowed host is remembered in memory until restart; a refusal is not remembered. Inferred purpose: stop embedded
    `\\host\share` links from leaking NTLM credentials.
  * In the running branch, HTTP Range (206) for media and the MIME type come from Chromium's file loader (inferred).
    The unused `protocol.handle` fallback implements Range itself and sends `Last-Modified` and
    `Access-Control-Allow-Origin: *`.
* `vault.resolveFileUrl(url)` / `resolveFilePath(abs)` reverse the mapping to find a TFile inside the vault, for
  example when an `<img>` is dragged or HTML is pasted (app.js:51085-51107).
* `getFilePath` returns a plain `file://` URL. `exportTextFile` downloads text through a Blob anchor
  (app.js:24699-24713).

### 16. Vault config: `app.json` + `appearance.json`

* `setupConfig()` (app.js:50472-50499):
  1. ensure `configDir` exists, creating it with `mkdir`;
  2. set `configTs = now`;
  3. read `app.json` and `appearance.json`, and merge them with **app winning**: `config = assign({}, appearance, app)`;
  4. migrate `editorFontFamily` to `textFontFamily`;
  5. **schedule a save unconditionally.** Inferred: an unparseable `app.json` (readJson returns `undefined`) is
     silently replaced about a second later with only the keys that survived.
* `getConfig(key)` returns `config[key]`, falling back to the default table `XP` when the value is `undefined`.
  **Objects and arrays come back as a JSON deep clone**, so callers cannot mutate config by reference
  (app.js:50530-50534).
* `setConfig(key, value)` does nothing if the value is identical (`===`). Otherwise it sets the key (or deletes it
  when the value is `undefined`), calls `requestSaveConfig` (a **1000 ms trailing debounce**), and emits
  `config-changed(key)` (app.js:50535-50537, 50399).
* `saveConfig` splits keys by the `YP` list. Listed keys go to **`appearance.json`**; everything else goes to
  **`app.json`**. Both files are rewritten every time, as pretty JSON with 2-space indent, and then `configTs = now`
  (app.js:50500-50529, 50578-50598). `writeJson` **swallows errors silently** (app.js:50591-50593).
* **External change detection:**
  1. `Vault.onChange("raw")` sees a path equal to `app.json` or `appearance.json` and calls `reloadConfig`, a
     **500 ms trailing debounce** (app.js:50703, 50401-50444).
  2. `reloadConfig` `stat`s both files. If either `mtime > configTs`, or a stat fails, it re-reads both, diffs each
     key with a JSON-string compare, updates `config`, and emits `config-changed` for each changed or removed key.
  3. Own writes are filtered because `configTs` is set *after* the write.
* **`configDir` override** (observed app.js:146222-146225, 145004-145005, 143329-143353, 50465-50471):
  * The value is stored **per vault in localStorage** under `<vaultId>-config`, and mirrored to Capacitor
    Preferences on mobile (`Nw`, app.js:36798-36815).
  * `validateConfigDir` accepts only names that **start with `.`**, are not `"."`, and contain no forbidden
    characters (including `/` and `\`). The config folder is therefore always a hidden, top-level folder, which keeps
    it out of the tree by construction (inferred rationale).
  * An invalid value falls back to `.obsidian`. Changing it requires a reload (the UI button "Relaunch").

### 17. Other config files and the mtime-stamp pattern

* **Pattern.** Several subsystems pass an **explicit `mtime: Date.now()`** to the write and remember the same number
  as `lastSave`. On a `raw` event for their file (throttled to 50 ms) they `stat` the file. Only
  **`mtime > lastSave`** counts as an external edit, which then calls `onExternalSettingsChange()` and refreshes the
  settings tab. This removes self-echo without content hashing. Users:
  * core plugins: `Q3.saveData` and `handleConfigFileChange`, app.js:110008-110076;
  * community plugins: `saveData` and `_onConfigFileChange`, app.js:109100-109165;
  * `types.json`: app.js:63516-63530, 63695-63706.

  Inferred limitation: on coarse-mtime filesystems (FAT: 2 s), an external edit made in the same tick can be missed.
* `hotkeys.json` reloads on **any** `raw` event for that path after 50 ms, with no mtime check (app.js:46182-46212).
* `workspace.json` (desktop) and `workspace-mobile.json` (mobile) are written by `Workspace.saveLayout` straight
  through `adapter.write` (pretty JSON), throttled to **1000 ms from the first change** (`Gl` without reset,
  app.js:106634, 107817-107840). They are read once at layout load (app.js:107488-107510). **Nothing watches them for
  external changes** (observed: no `raw` consumer).
* The CSS manager listens to `raw` events for the active theme file, the `themes/` folder (`theme.css` /
  `manifest.json` / `*.css`) and `snippets/*.css`, with reloads debounced at 100 ms or 2000 ms (app.js:45495-45498,
  45623-45629).
* Sync queues every `raw` event under `configDir` into its own special-file scanner (app.js:139388-139396).

### 18. FileManager: new file naming and placement

* `getNewFileParent(sourcePath, newName)` dispatches on the extension of the new file name through
  `fileParentCreatorByType` (plugins can register more; canvas does). For `md` it applies `newFileLocation`
  (app.js:64308-64336):
  * `root` (default): the vault root;
  * `current`: the folder of the source file;
  * `folder`: the `newFileFolderPath` folder, falling back to root if that path is not a folder.
* `createNewFile(parent, name, ext, content)` (app.js:64356-64378):
  1. trim the name and drop a duplicated extension;
  2. `normalizePath`;
  3. `getAvailablePath(prefix + name, ext)`. Without a name it uses the localized "Untitled".
  4. `getOrCreateFolder(dirname)`, with a case-insensitive lookup;
  5. `vault.create`.
* **`getAvailablePath(base, ext)`** tries `base.ext`, then `base 1.ext`, `base 2.ext`, ... using the
  **case-insensitive** lookup (app.js:51056-51061).
* `createNewMarkdownFileFromLinktext` (used for clicking unresolved links) validates the name with `TA`. It uses the
  configured parent only when the link text has no `/` (app.js:64337-64348).
* The startup path for `openBehavior = "new"` builds its own "Untitled N" by listing the target folder (up to 500
  tries) (app.js:145139-145158).

### 19. Link generation

* **`generateMarkdownLink(file, sourcePath, subpath?, alias?)`** (app.js:64861-64872):
  * The link text comes from `metadataCache.fileToLinktext(file, sourcePath, omitMdExt)`. `omitMdExt` is true for
    wikilinks.
  * A link to a heading in the same file collapses to just the subpath.
  * **Markdown style** (`useMarkdownLinks: true`): `[display](url)`. The URL percent-encodes only spaces, backslashes
    and some control characters (NUL, 0x08, 0x0B, 0x0C, 0x0E-0x1F; not tab, LF or CR) (`hd`, app.js:28971). For notes
    the display text defaults to `basename`; for other files it is empty.
  * **Wikilink style** (default): `[[text|alias]]`. When the alias equals the link text case-insensitively, the alias
    replaces the link text and is dropped, so the alias's casing wins.
  * Callers prepend `!` to embed; drop and paste code does this automatically for embeddable extensions (`Fx`).
* **`fileToLinktext`** follows `newLinkFormat` (app.js:62935-62949):
  * `absolute`: the full path, without `.md` for wikilinks;
  * `relative`: `../` hops from the source folder;
  * `shortest` (default): the bare name if `getLinkpathDest(name, source)` resolves **uniquely** to this file,
    otherwise the full path.

### 20. Link updates on rename (snapshot-diff), subpath renames, the link-updater registry

* **`fileManager.renameFile(file, newPath)`** wraps `vault.rename` in **`runAsyncLinkUpdate`** (app.js:64404-64482):
  1. **Batching.** If an update is already running (`inProgressUpdates` is an array), push this rename function and
     **return immediately**. Inferred: the caller's promise resolves before the rename actually runs. Folder moves
     and multi-select moves get coalesced into one link pass.
  2. Otherwise, enqueue on `updateQueue` (`WT`):
     1. wait for **`metadataCache.onCleanCache`**, meaning no pending parses;
     2. **snapshot every reference in the vault** (`iterateAllRefs`, which covers markdown caches plus each registered
        link updater's references) whose link path currently resolves. Each entry records
        `{sourceFile, reference, resolvedFile, resolvedPaths[]}`;
     3. run the rename, then drain any batched renames until none remain;
     4. call `updateAllLinks(snapshot)`.
  3. **Diff** (`gB`, app.js:65020-65040). For each snapshot entry, resolve the original link text again from the
     source's *current* path. If the resolution is now empty or differs from the recorded list, compute the new link
     text from the **same `resolvedFile` object**, which has been mutated to its new path. This is why stable
     identity matters. The new text is `fileToLinktext(resolvedFile, sourcePath, isWikilink) + subpath`. If it differs
     from `reference.link`, record a change built by `qR`.
  4. `qR` (app.js:62637-62660) rewrites one link and preserves its syntax:
     * **Wikilinks** keep the `!` prefix, the alias, and an escaped `\|` when present. If the old alias equalled the
       old basename and the old link contained a folder, the alias is updated to the new basename.
     * **Markdown links** keep the display text (renamed too if it equalled the old name), the title, and the `<...>`
       angle-bracket form; the URL is re-encoded.
  5. Changes are grouped per source file. If `alwaysUpdateLinks` is false (the **default**), a modal offers "Always
     update" (which sets the option), "Just once", or "Do not update" (app.js:64483-64533).
  6. `metadataCache.updateInternalLinks(changes)` (app.js:62886-62926) runs per source file:
     * a file whose extension has a registered **link updater** gets `updater.applyUpdates(file, changes)`;
     * otherwise `vault.process(file, text => zR(text, changes))`. `zR` (app.js:62609-62636) splices body links by
       offset, sorted descending, and rewrites **front-matter link values** through their dotted key path, then
       re-serializes the YAML.
     * A notice reports how many links in how many files changed.
* **The link-updater registry is generic.** `metadataCache.linkUpdaters[ext]` is an object with four methods:
  `iterateReferences(cb)`, `iterateReferencesForFile(path, cb)`, `applyUpdates(file, changes)` and
  `renameSubpath(file, oldSubpath, newSubpath)` (app.js:62873-62883, 62892-62905).
  * **Canvas is the only built-in implementation** (`rte`, registered by the canvas plugin, app.js:126828-126830).
  * It reports text-node links plus file-node embeds, and rewrites text nodes inside the canvas JSON
    (app.js:126522-126581).
  * The backlinks plugin also uses the registry: it scans `md` files plus every extension that has a link updater
    (app.js:113862-113864).
  * Inferred bug: `rte.renameSubpath` never increments its counter, so the "Canvas updated N embed cards" notice never
    appears (app.js:126604-126629).
* **Heading and block-id renames** (`pB` / `dB` on `hB`, app.js:64179-64297) build the same change map for links
  that target `#Heading` or `#^block`. They apply it through `updateInternalLinks` and the editor, then call
  `renameSubpath` on every link updater.

### 21. Front matter helpers

* **`processFrontMatter(file, fn, opts)`**, for `md` files only (app.js:64932-64945, 65013-65019):
  1. inside `vault.process`, locate the YAML block (`pm`) and parse it;
  2. call `fn(obj)` to **mutate it in place**;
  3. if `obj` is empty, **remove the whole block**; otherwise re-serialize (`IF`) and splice the result back in place,
     or prepend `---\n…---\n` if there was no block.
* `insertIntoFile(file, text, "append" | "prepend")` (app.js:64893-64931) merges the front matter of both sides with
  a deep merge (`mB`: arrays concatenated and deduplicated, objects merged recursively). Between the two bodies it
  inserts whichever of nothing, a single newline, or a blank line is needed so they end up one blank line apart.
* `renameProperty` / `deleteProperty` iterate all cached files that are not user-ignored and rewrite the front matter
  through `process` or `processFrontMatter`. They also move or unset the property's assigned type (app.js:64534-64604).

### 22. Attachments: folder resolution, paste, drop, remote download

* **`vault.getAvailablePathForAttachments(name, ext, sourceFile)`** (app.js:51063-51084) reads
  `attachmentFolderPath` (default `"/"`). The settings UI maps four modes onto it (app.js:143182-143187):

| Value | Meaning |
|---|---|
| `"/"` | vault root |
| `"."` or `"./"` | same folder as the source note (root if there is none) |
| `"./sub"` | sub-folder `sub` under the source note's folder |
| anything else | that vault-absolute folder |

  It then:
  1. normalizes the folder;
  2. sanitizes the name with `stripHeadingForLink` (`Xm`): `: # | ^ \`, CR/LF, `%%`, `[[` and `]]` become spaces,
     whitespace collapses, and the result is **truncated to 250 characters**;
  3. **creates the folder if missing**, using a case-insensitive lookup;
  4. calls `getAvailablePath` for a collision-free name. If the configured path is a *file*, it falls back to root.
* `fileManager.getAvailablePathForAttachment(filename, sourcePath?)` splits the name and extension, and uses the
  active file when no source path is given (app.js:64966-64980).
* `app.saveAttachment(name, ext, data)` combines that path lookup with `vault.createBinary` (app.js:146021-146035).
* **Paste and drop into the editor** (`OR`, app.js:62268-62483):
  * **Order of precedence.** Plugins first see the workspace events `editor-paste` and `editor-drop`, and can
    `preventDefault`. An internal draggable (file, files, link, heading, bookmarks) becomes link text through `IR`,
    and `Alt` (`Shift` on macOS) defers to the view's own drop logic.
  * **Data transfer.**
    * HTML that carries the marker comment `<!-- obsidian -->` plus plain text means a copy from Obsidian itself;
      the plain text is used.
    * Otherwise `text/markdown` is preferred.
    * Otherwise HTML is converted to Markdown when `autoConvertHtml` is on (Turndown rules at app.js:61880-61900).
      Embedded `data:` PNG/JPEG images over 1000 characters are pulled out and saved as "Pasted image" attachments.
    * Otherwise a `text/uri-list` becomes `[title](url)`, with `!` for image extensions.
  * **Dropped OS files** (`GL`, app.js:53046-53090):
    * The real path comes from `electron.webUtils.getPathForFile`.
    * **A file already inside the vault is linked, not copied.** Other files are read and copied in through
      `saveAttachment`.
    * `Ctrl` (`Alt` on macOS) inserts a `file:///` link to the external file instead of copying it.
  * **Clipboard fallbacks** when the paste has no file items and Shift is not held:
    * Electron `clipboard.readImage()` becomes a PNG;
    * a copied file from Windows Explorer arrives as the `FileNameW` format (UCS-2);
    * a copied file from macOS Finder arrives as `public.file-url`.
  * **Naming.** Unnamed image data is called "Pasted image", and `saveAttachment` appends
    `moment().format("YYYYMMDDHHmmss")` (app.js:62468). Multiple inserted files are separated by blank lines.
* **Download remote images** (`downloadAttachmentsForNote`, app.js:64724-64860):
  1. find `http(s)` and `data:` image URLs in the body and image paths in front-matter values;
  2. show a gallery to choose which to download;
  3. pick a name from `Content-Disposition`, then the URL basename, then `Image.<ext>` from the MIME type;
  4. save through `saveAttachment`;
  5. rewrite the note in one `process` pass, splicing by offset in descending order. Front-matter values become
     `[[link]]`.

### 23. Drag manager (`AR`, app.js:61922-62222)

* Global capture listeners on `dragstart`, `dragover` and `dragleave` track one `draggable` payload of type `file`,
  `folder`, `files`, `link`, `heading` or `bookmarks`. Each payload carries an icon and title for the ghost element.
* The payload also puts an `obsidian://` URL into the DataTransfer, so dropping onto other apps works
  (`dragFile` / `dragFiles` / `dragLink`, app.js:62119-62169).
* Ghost: a custom `.drag-ghost` div follows the cursor. The native drag image is replaced with a 1x1 transparent GIF
  (app.js:61901-61902, 62223-62229).
* Edge auto-scroll: walk up from the hovered element to the first scrollable ancestor. Inside a band of
  `min(size/3, 50px)` near an edge, scroll at a speed proportional to depth, driven by `requestAnimationFrame`
  (app.js:61989-62058).
* Drop targets register through `handleDrop(el, cb)`. The callback returns an `{action, dropEffect, hoverEl,
  hoverClass}` hint used during `dragover`.
* On mobile, a drag shorter than 5 px opens the context menu, plus a vibrate if nothing handled it
  (app.js:62063-62079).
* `onDragStartGlobal` also lets you drag an `<img>` whose `src` resolves to a vault file, as if it were a file
  (app.js:61950-61961).

### 24. Name validation and forbidden characters (app.js:46758-46790, 53091-53101)

| Platform | Characters forbidden in any segment (`MA`) | Extra rules (`DA`, Windows only) |
|---|---|---|
| Windows | `* " \ / < > : \| ?` | the last segment may not end in `.` or space; its base name may not match `CON PRN AUX NUL COM1-9 LPT1-9` (case-insensitive) |
| macOS, Linux | `\ / :` | none |
| Android | `\ / : * ? < > "` | none |

* `checkPath` (`DA`) **throws** with a message that lists the characters, NBSP-separated for display. The Vault calls
  it on create, createBinary, createFolder, rename and copy. Raw adapter writes are not checked.
* **Link-unsafe characters** `# ^ [ ] |` (`SA`) cause only a *warning* in rename dialogs (`YL`).
* Other rename errors: an empty name, a name starting with `.`, or a duplicate (`checkForDuplicate`).
* `AA(name, "_")` is meant to replace forbidden characters with `_` and collapse repeats. Because `MA` has no `g`
  flag, only the **first** forbidden character is actually replaced (observed app.js:46758, 46782-46790; the rest
  survive). Sync uses it to sanitize the device name inside conflicted-copy names, `"<name> (Conflicted copy <device> <yyyymmddhhmm>).<ext>"` (app.js:139867-139869).
  Mobile export uses it too (app.js:47611).
* Sync also skips files that fail `TA`, and on Android skips `* ? < > "` (app.js:139718).

### 25. Vault registry and IDs (main process)

* The user data dir is `%APPDATA%\obsidian` (`v`). Small JSON stores use the helpers `ae` (write), `ee` (read) and
  `ce` (delete), all synchronous, on `<userData>/<name>.json` (main.js:4071-4081).
* **`obsidian.json`** (`C`) holds `vaults` plus app-wide flags such as `language`, `updateDisabled`, `disableGpu`,
  `insider`, `cli`, `frame`, `adblock`, `adblockFrequency`, `icon` and `isWork` (main.js:4365-4389, 4976-5039).
  * On this machine it holds only `vaults`. One entry was present, with fields `path` (str), `ts` (int) and `open`
    (bool) (observed by structure-only inspection).
  * At startup, entries whose folder no longer exists, or that point at the legacy `<userData>/Obsidian Help` vault,
    are pruned along with their window-state file (main.js:4365, 4369-4376).
  * Orphaned `Partitions/vault-<id>` folders are removed (main.js:4397-4416).
* **Opening a vault** (`h`, main.js:5372-5392):
  1. resolve the path; it must exist and be accessible;
  2. reuse the entry with the same path (refreshing `ts`), or **mint a new id = 16 random hex digits** with
     `{path, ts: now}`;
  3. open or focus the vault window, and call `app.addRecentDocument`.
* `open: true` marks vaults that were open, so they reopen at the next launch (main.js:4393-4396, 4678, 4696, 4763).
* IPC handlers:
  * `vault`: returns `{id, path}` for the sender window. The renderer uses it during boot, and its id becomes
    **`app.appId`** (main.js:5053-5060, app.js:146270, 144732).
  * `vault-list`: returns the registry.
  * `vault-remove`: refused while the vault is open; deletes the entry, the window-state file and the partition.
  * `vault-move`: refused while open (returns `"EVAULTOPEN"`); uses `fs.renameSync` on the folder, then updates the
    path.
  * `vault-open(path, create)`: with `create`, refuses an existing folder and otherwise runs `mkdir -p`.
  (main.js:5061-5121)
* **Per-vault window state** lives in `<userData>/<vaultId>.json`: `x, y, width, height, isMaximized, devTools,
  zoom`. It is written on window close (main.js:4595-4672).
* Opening a file from the OS (`Je`, main.js:5557-5560) has two cases. If the path lies inside a registered vault, the
  main process injects `OBS_ACT {action:"open", file:<relative>}`; otherwise it injects `OBS_OPEN_FILE <abs>` and the
  file opens as an external file.
* **Renderer storage is keyed by `appId`:**
  * localStorage `<appId>-config` (config-dir override), the generic `<appId>-<key>` (`loadLocalStorage`), including
    `<appId>-note-fold-<path>`;
  * IndexedDB `<appId>-cache` (metadata, v19), `<appId>-backup` (file recovery), `<appId>-sync`, `<appId>-webview`.

  (app.js:62978, 128274, 139096, 110246, 115193, 146186-146202)

### 26. Mobile contrast (brief)

* **`LA`** wraps the Capacitor `Filesystem` plugin (`Dw`) relative to a base `directory` (app.js:46806-47135).
  * Text is read and written as UTF-8.
  * Binary data **under 5 MiB** travels as base64 through the bridge. Larger reads `fetch()` the native file URL;
    larger writes truncate the file, then append **1 MiB** chunks.
  * Other operations: `setTimes(ctime, mtime)`, `trash`, `verifyIcloud`, `watchAndStatAll`, `startWatch`.
* **`BA` CapacitorAdapter** keeps the same table and reconcile design (app.js:47140-48029), with these differences:
  * initial listing uses one native **`watchAndStatAll`** call that returns the whole tree with stats (`quickList`),
    falling back to a recursive `readdir`;
  * change events come from a native listener;
  * no watchdog;
  * `insensitive` is always false;
  * there is no symlink branch;
  * `getResourcePath` returns the native URI with no cache buster;
  * `trashLocal` tolerates the error message "Directory exists".

### 27. Timing constants

| Constant | Where | Kind |
|---|---|---|
| 60 000 ms | adapter watchdog `thingsHappening` | trailing debounce (resets) |
| 0 ms | `onFileChange` | `setTimeout` deferral |
| 100 ms | unconfirmed deletion re-check | one-shot |
| 1 000 ms | `requestSaveConfig` (app.json / appearance.json) | trailing debounce (resets) |
| 500 ms | `reloadConfig` | trailing debounce (resets) |
| 500 ms | core-plugins.json save | throttle (first call + 500 ms) |
| 50 ms | hotkeys / types / plugin-data external reload | throttle |
| 1 000 ms | workspace.json save | throttle |
| 100 / 2 000 ms | theme / snippet reload, theme list re-read | throttle |
| 5 000 ms | external-file GC sweep | interval |
| 65 536 chars | `cacheLimit` | content cache admission |
| 250 chars | attachment base-name cap | truncation |
| 5 MiB / 1 MiB | mobile bridge thresholds | |

(`Gl(fn, ms, true)` resets the timer on each call; `Gl(fn, ms)` fires `ms` after the *first* call of a burst with the
latest arguments, app.js:24224-24265.)

---

## Data formats and on-disk files

### Per vault: `<vault>/<configDir>/` (default `.obsidian`)

| File | Writer / reader | Format |
|---|---|---|
| `app.json` | Vault config (non-appearance keys) | flat object; keys and defaults below |
| `appearance.json` | Vault config (`YP` keys) | flat object |
| `core-plugins.json` | `Z3` | **object `{pluginId: boolean}`** (current); a legacy **array** of enabled ids is migrated with `core-plugins-migration.json` |
| `core-plugins-migration.json` | `Z3` (read) | object `{pluginId: boolean}` |
| `community-plugins.json` | `U3` | array of enabled plugin ids |
| `hotkeys.json` | hotkey manager | `{commandId: [hotkey…]}` (hotkey objects use `modifiers` + `key`) |
| `types.json` | metadataTypeManager | `{ "types": { propertyName: widgetType } }` |
| `workspace.json` / `workspace-mobile.json` | Workspace | layout tree (`main/left/right/...`, `active`) + **`lastOpenFiles`** (MRU: up to 25 md, 10 canvas, 10 image, 10 other; app.js:106561-106580) |
| `<corePluginId>.json` | each core plugin's `loadData/saveData` | plugin-defined. Observed ids that persist data: `graph`, `bookmarks`, `daily-notes`, `templates`, `canvas`, `command-palette`, `switcher`, `global-search`, `backlink`, `page-preview`, `note-composer`, `file-explorer`, `file-recovery`, `footnotes`, `tag-pane`, `word-count`, `editor-status`, `webviewer`, `sync`, `workspaces`, `zk-prefixer` (inferred from the `saveData/loadData` calls in each class) |
| `starred.json` | bookmarks (one-time migration read) | `{items:[…]}` |
| `plugins/<id>/manifest.json, main.js, styles.css, data.json` | community plugins | `data.json` is the plugin's own JSON |
| `themes/<name>/theme.css` + `manifest.json` (legacy `themes/<name>.css`) | custom CSS | |
| `snippets/*.css` | custom CSS | |

### Elsewhere in the vault

* `<vault>/.trash/`: the local trash, flat, with collision suffixes `" 2"`, `" 3"`, ...
* `<vault>/.OBSIDIANTEST`: a transient probe at every adapter construction.

### Vault config keys and defaults (`XP`, app.js:50169-50229)

Keys routed to `appearance.json` (`YP`): `accentColor, theme, cssTheme, enabledCssSnippets, showViewHeader, showRibbon,
nativeMenus, translucency, textFontFamily, interfaceFontFamily, monospaceFontFamily, baseFontSize, baseFontSizeAction,
slidingSidebar, floatingNavigation, autoFullScreen`.

| Key | Default | Notes |
|---|---|---|
| `alwaysUpdateLinks` | false | false means prompt on rename |
| `newLinkFormat` | `"shortest"` | `relative`, `absolute` |
| `useMarkdownLinks` | false | |
| `attachmentFolderPath` | `"/"` | see the table in section 22 |
| `newFileLocation` / `newFileFolderPath` | `"root"` / `"/"` | `current`, `folder` |
| `userIgnoreFilters` | null | array of prefix or `/regex/` strings |
| `showUnsupportedFiles` | false | |
| `promptDelete` | true | |
| `trashOption` | `"system"` | `local`, `none` |
| `deleteUnlinkedAttachments` | `"ask"` | `always`, `never` |
| `autoConvertHtml` | true | paste HTML to Markdown |
| `openBehavior` | `""` | `new`, `daily`, `file:<path>` |
| `uriCallbacks` | false | |
| `spellcheck, readableLineLength, strictLineBreaks, propertiesInDocument("visible"), showInlineTitle, autoPair*, smartIndentList, fold*, showLineNumber, showIndentGuide, useTab(true), tabSize(4), rightToLeft, vimMode, livePreview, defaultViewMode("source"), focusNewTab, pdfExportSettings{pageSize:"Letter", landscape:false, margin:"0", downscalePercent:100}, mobilePullAction, mobileToolbarCommands[…], mobileQuickRibbonItem, settingsPopoutWindow, hotkeys{}, types{}` | as listed | editor and UI keys, outside this subsystem |
| `theme` | `"system"` | appearance |

### App-wide (`%APPDATA%\obsidian`)

| File | Content |
|---|---|
| `obsidian.json` | `{ vaults: { <16-hex id>: { path, ts, open? } }, language?, updateDisabled?, disableGpu?, insider?, cli?, frame?, adblock?, adblockFrequency?, icon?, isWork? }` |
| `<vaultId>.json` | window state `{x, y, width, height, isMaximized, devTools, zoom}` |
| `Partitions/vault-<id>/` | per-vault Chromium partition, deleted with the vault |
| IndexedDB / Local Storage | `appId`-prefixed stores (section 25) |

---

## Rebuild notes (design, not code)

**Essential ideas worth copying**

1. **Two-layer model.** A dumb adapter table (`path → {realPath, kind, stat}`) that reconciles against disk, and an
   object tree with **stable identities** on top. Mutate on rename and never recreate. Link rewriting, open editors
   and bookmarks can then hold references safely.
2. **Reconcile instead of trusting events.** Treat every watcher notification as "something about this path may have
   changed". Re-stat, then emit based on the difference:
   * a missing parent gets created first;
   * an unchanged `(mtime, size)` emits nothing;
   * a missing file, when reported by the watcher, is re-checked after about 100 ms.

   This one routine handles initial scan, own writes, external edits, atomic saves, case-only renames and duplicate
   notifications. In Rust/Tauri, `notify` with a short debouncer can feed paths into the same reconciler. Do not map
   `notify` event kinds to operations directly.
3. **Own writes reconcile synchronously before the API call resolves.** Callers then see the new file in the tree
   immediately, and the echo from the watcher is absorbed by the stat compare. Suppressing echo by `mtime + size`
   has a hole (same size, same mtime). A cheap content hash, or a per-path "expected stat after own write" record,
   closes it.
4. **One serialized I/O queue per vault, with a watchdog.** This is simple and eliminates read/write interleavings.
   A per-path queue plus a global queue for structural operations (rename, delete) would allow parallel reads.
   Keep the "timeout releases the queue" behaviour for network drives.
5. **Normalize paths at the API boundary:** `/` separators, no leading or trailing slash, NFC, NBSP to space. Keep the
   on-disk form separately for I/O. Probe case sensitivity per vault instead of assuming it per OS.
6. **Hidden-by-rule config folder.** Any dot-segment is invisible to the tree, and config files are watched through
   a raw path channel. This keeps app state out of the user's notes and lets external edits (git pull, sync) be
   detected.
7. **mtime stamping for config files.** Write with an explicit mtime, remember it, and treat only a strictly newer
   on-disk mtime as an external change. This is cheap and robust. Prefer a content hash on coarse-mtime filesystems.
8. **Link updates as snapshot plus diff.** Before a rename (or a batch of renames), record every resolvable link and
   its target object. Afterwards, re-resolve. Rewrite only links whose resolution changed, preserving each link's
   syntax (alias, embed `!`, `<>`, escaped pipes). Make the "where are references" query a **pluggable registry per
   file type**, as `linkUpdaters` does for canvas, so new file formats participate.
9. **Attachment placement policy** is a single string with four modes (root, same folder, sub-folder, fixed folder),
   plus name sanitization and a collision suffix. That is enough for most users.
10. **Serve files through a private, per-launch random origin**, with Range support and a confirmation gate for
    network hosts. Append `?mtime` to resource URLs for cache busting.

**Incidental, or worth doing differently**

* **Non-atomic writes.** Prefer a temp file + fsync + rename (with care on Windows for open handles, and to keep birth
  time and permissions). Obsidian instead relies on its file-recovery snapshots (IndexedDB) as a safety net.
* **`cachedRead` without stat validation.** Consider validating it against the adapter's last-known mtime.
* **Linear case-insensitive lookup** and repeated full-tree walks in `getFiles` / `getMarkdownFiles`. Keep a lowercase
  index and maintained lists instead.
* **Local trash flattens folders.** Prefer `.trash/<original relative path>`, or a manifest, so restores are possible.
* **Error swallowing.** `writeJson` swallows errors, and a corrupt `app.json` is overwritten after load. Surface parse
  errors and back up the bad file instead.
* **Hard-coded event fan-out.** On Linux, one inotify watch per folder can exhaust `max_user_watches` on large vaults.
  A modern design can use recursive watching where the platform supports it, and fall back to polling for network
  drives.
* **`runAsyncLinkUpdate` batching.** It returns before batched renames finish. Return a promise that resolves after
  the batch.

**Minimal contract to implement (DataAdapter equivalent):**

* `getName`, `exists(path, sensitive?)`, `stat`, `list(path) → {files, folders}`;
* `read`, `readBinary`;
* `write(path, data, {ctime?, mtime?})`, `writeBinary`, `append`, `appendBinary`;
* `process(path, fn, opts)`, an atomic read-modify-write;
* `mkdir`, `rmdir(recursive)`, `remove`, `rename`, `copy`;
* `trashSystem` returning a boolean, and `trashLocal`;
* `getResourcePath`.

Plus an event sink taking `(type, path, oldPath?, stat?)` with these types: `raw`, `file-created`, `folder-created`,
`modified`, `file-removed`, `folder-removed`, `renamed`, `closed`.

---

## Open questions

1. ~~Does the editor convert CRLF to LF on save?~~ **Yes** (runtime pass, [14](14-runtime-verification.md)): every
   line ending becomes LF once the note is saved from the editor.
2. **Birth time on Linux.** What do `ctime` / `stat.ctime` contain on ext4 under Electron's Node version
   (`statx` birthtime or 0)? Runtime probe: create a note on Linux and inspect `app.vault.getFileByPath(p).stat`.
3. **Windows recursive `fs.watch` overflow.** Does a large burst (git checkout of thousands of files) overflow the
   ReadDirectoryChangesW buffer, and does Obsidian ever recover with a full rescan? No rescan path is visible except
   the `error` handler on the watched folder. Probe: mass-create files externally and compare `vault.getFiles().length`
   with the disk.
4. **Exact behaviour of the 60 s watchdog** during a long initial scan of a slow network drive. `listRecursive` keeps
   it alive per directory, but a single slow `lstat` could still trip it. Needs a runtime test.
5. **Who writes `core-plugins-migration.json`?** Only reads are visible here; the writer might be Sync's
   `patchCorePluginsFile` or an older version.
6. **Full list of core-plugin data files.** The list above was inferred from `saveData`/`loadData` presence. Confirm
   it by enabling every core plugin in a scratch vault and listing `.obsidian`.
7. **The `GP` identifier.** The monitor class is the second value of a comma expression whose first value is the
   mobile onboarding class (app.js:49887-50107). The mapping is inferred from `new GP(...)` inside `KP`.
8. **Whether `process()` ever sees a BOM** in practice. Does the editor strip it on first save (so the file loses it),
   or is it preserved? Probe with a BOM-prefixed note.
