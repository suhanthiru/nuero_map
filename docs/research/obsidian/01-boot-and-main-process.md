# Main process, boot chain, CLI and Electron shell (Obsidian 1.14.4 desktop)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian's Electron main process is deliberately thin. All real work (vault I/O, indexing, UI,
plugins) happens in a renderer that has full Node access (`nodeIntegration: true`,
`contextIsolation: false`, no preload, no sandbox) plus `@electron/remote`. The main process
does six jobs: (1) a two-stage boot that hot-swaps the app package (`obsidian.asar`) from a
signed download, (2) a vault registry and one-window-per-vault manager with per-vault window
state, (3) a custom `app://` protocol that serves the bundled UI from `app://obsidian.md/` and any
local file from a per-launch random host `app://<36 hex>/`, (4) navigation, popup, webview and
permission lock-down, plus header rewriting so arbitrary sites can be iframed and a sandboxed web
viewer with an EasyList-style blocker, (5) a local-socket CLI server (named pipe
`\\.\pipe\obsidian-cli-<user>` or `~/.obsidian-cli.sock`) that forwards argv to a
renderer-side command registry of about 114 commands, with an interactive TUI mode, and (6) 47
mostly synchronous IPC channels for settings that must live outside a vault (update channel,
GPU, frame style, CLI toggle, ad-block lists, custom icon, language). It has no tray, no
global shortcuts, no main-side notifications, no download handler, no preload/contextBridge,
no BrowserView/WebContentsView and no utilityProcess. Electron is 43.7.7 / Chrome 150.0.7871.250
(**observed**: version strings in `Obsidian.exe`).

REA Evidence IDs cited below: IPC inventory `ev_00c748ba8d5f069784e4ace8c2e061cf24839df5c245042a17275f2943073bca`
(parent `ev_c7e88edcda8ed2a5b39fbd0fe0a33272ed987141aa62afc93aef0197e1afc1d6`, 47/47 coverage);
Obsidian.com PE resources `ev_b83396ea3ff55737df1b855e07c1e5c372c26d79ce20551be639d6cb0fa7bec3`;
Electron fuses `ev_9986ca493fefaa899dfd8144b583fc23d681285c9ce098d23ae6e6f68d5b9b1a`.

---

## Where it lives

| Minified id / symbol | Public / inferred name | Role | Lines |
|---|---|---|---|
| `boot-main.js` (whole file) | boot loader (`resources/app.asar/main.js`) | `@electron/remote` init, `app://` scheme privileges, `obsidian.log`, install `id`, updater, picks which `obsidian*.asar` to load | boot-main.js:1-381 |
| `update`, `runUpdate`, `downloadUpdate` | updater | manifest fetch (GitHub raw, then releases.obsidian.md), SHA-256 + RSA verify, gunzip, atomic save | boot-main.js:100-229 |
| `loadApp(asarPath)` | stage-2 loader | `require(<asar>/main.js)` and call it with `(asarPath, updateEvents)` | boot-main.js:230-245 |
| `Et`,`_e`,`Nt` | string helpers | string-array check, truncate with ellipsis, split-once | main.js:14-28 |
| `tt` / `Bt` / `Fo` / `Vt` / `qo` / `$o` | enterprise policy | deny-all default / allow-all default / normaliser / parser / reader / path | main.js:29-73, 3944-3960 |
| `Ut` | display-intersection test | saved bounds still visible on some monitor (2 px slack) | main.js:74-81 |
| `Wt`,`To`,`ot` | semver-ish compare | "is v2 newer than v1" | main.js:82-106 |
| `Re` (+`xo`,`Ht`,`_t`) | ad-block filter list | ABP-subset parser and matcher | main.js:108-207 |
| `P`, `Po`, `Ro`, `Lo`, `Io` | CLI TUI helpers | ANSI palette, ASCII logo, key decoder, shell-like tokenizer, usage-to-flags | main.js:208-280 |
| `nt` | CLI TUI session | line editor, history, Ctrl-R search, completion popup over a socket | main.js:281-713 |
| `zt` | TUI driver | wires the socket `data` stream into `nt` | main.js:714-760 |
| `it` | default English i18n (full app string table) | exported as `window.OBSIDIAN_DEFAULT_I18N`; main uses only `main.*` | main.js:762-3598 |
| `Oo`,`$t`,`Eo`,`No`,`Fe`,`qt` | locale tables + localized obsidian.md / help URLs | | main.js:3599-3665 |
| `Xt`,`E`,`Qt`,`Kt`,`Yt` | main-process i18n | i18next + `i18n/mapping.txt` line-aligned translation files | main.js:3666-3749 |
| `st`,`Bo`,`Vo`,`Uo`,`Wo`,`rt` | macOS Quick Look resource extractor | content-hashed extraction, symlink swap, GC | main.js:3750-3810 |
| `oo` | "terms" string | distribution/trademark acknowledgement checked by renderer | main.js:3812 |
| `no` | URI query parser | `action` + `queryData` from `obsidian://action?k=v` | main.js:3813-3826 |
| `W`/`oe`/`_o` | isMac / isWin / Electron major | | main.js:3827 |
| `io`,`ao`,`lo` | random hex, is-UNC, UNC host | | main.js:3831-3845 |
| `so` | network-drive consent prompt | per-host, memoised, de-duplicated | main.js:3846-3868 |
| `zo` | executable-file detector | extension list + exec bit + magic bytes | main.js:3869-3889 |
| `uo` | native context menu | Look Up (mac), cut/copy/paste/paste-as-text, spelling suggestions | main.js:3890-3934 |
| `he` | try/ignore wrapper | | main.js:3935-3943 |
| `module.exports = function (n, e)` | stage-2 main (`n`=asar path, `e`=update events) | everything below | main.js:3961-5569 |
| `a(argv)` | argv filter | drops exe, `--` switches except `--copy --help --json --md --tsv --csv` | main.js:3971-3976 |
| lock-fail branch | CLI client mode | connect to pipe/socket, send header, pipe stdin/stdout | main.js:3977-4025 |
| `ae`/`ee`/`ce` | JSON store in userData | write/read/delete `<name>.json` | main.js:4073-4081 |
| `we` | ad-block list loader/refresher | cache in `userData/adblock`, timer refresh | main.js:4083-4113 |
| `H` | external link router | scheme allow-list, web viewer hand-off, remote/executable warnings | main.js:4141-4192 |
| `te` / `ie` / `G` / `fe` | per-window wiring | remote.enable, zoom shim, window events, webContents security | main.js:4196-4341 |
| `ct` | bounds sanitiser | default 1024x800 cap, min 300x200 | main.js:4342-4364 |
| `go`,`dt`,`fo`,`le`,`je`,`ht`,`mt`,`gt`,`ft`,`C` | constants + config | default vault path, sandbox path, help path, `app://obsidian.md/`, random host, ad lists, default refresh 4 days, allowed webview permissions, `obsidian.json` | main.js:4365 |
| `kt` | app-menu builder/merger | base template + renderer template, `appCommand` binding | main.js:4440-4551 |
| `se(vaultId, focus)` | open/focus vault window | BrowserWindow #1, state persistence | main.js:4589-4698 |
| `Tt` | small fixed window factory | BrowserWindow #2 (starter/help) | main.js:4699-4721 |
| `ye` / `xt` | starter / help window singletons | | main.js:4723-4749 |
| `At` | execute CLI request in a vault window | `window.handleCli` or `window.cliQueue` | main.js:4772-4794 |
| `Qe` | CLI socket server | JSON header line, 5 s timeout | main.js:4795-4833 |
| `Pt` | CLI request dispatcher | URI / file / command / TUI | main.js:4834-4876 |
| `whenReady` block | protocol, 47 IPC channels, session filters, permissions, app events, launch args | | main.js:4896-5479 |
| `Ze` | `obsidian://` router | | main.js:5482-5527 |
| `He` / `Je` / `Lt` / `Xe` | open file path / open file in vault / send action / renderer mailbox | | main.js:5528-5569 |
| `NF` (app.js) | `app.cli` command registry | parse, validate, dispatch, help, completions | app.js:58413-60483 (helpers `RF`/`BF` 58378-58412) |
| `Plugin.registerCliHandler` | public plugin API | | app.js:109078-109084 |
| `h0` (app.js) | per-window Electron bootstrap | `window.electron`, `electronWindow`, `window.open` file: shim | app.js:96468-96490 |
| `lw` / `GS` / `YS` (app.js) | `requestUrl` transport | IPC `request-url` on desktop, Capacitor `App.requestUrl` on mobile, fetch fallback | app.js:36690-36705, 42940-43018 |
| `OS` (app.js) | native app-menu model | builds template, sends `set-menu` / `update-menu-items` | app.js:42726-42830 |
| `K4` (app.js) | desktop secret store adapter | `remote.safeStorage` | app.js:103537-103594 |
| `BA` (app.js) | `CapacitorAdapter` (mobile vault FS) | mobile counterpart of the desktop FileSystemAdapter `nc` | app.js:47140-48029 |

---

## How it works

### 1. Boot chain (boot-main.js, summary)

**Observed:**

1. Loads `@electron/remote/main` and calls `remote.initialize()` (boot-main.js:9-11).
2. Registers the `app` scheme as privileged: `standard, secure, supportFetchAPI, stream, codeCache, corsEnabled` (boot-main.js:12-21). This has to happen before `ready`, which is why the boot loader does it and not main.js. `codeCache` gives V8 code caching for the 4 MB `app.js`. `stream` and `supportFetchAPI` allow media range streaming and `fetch()` on vault files.
3. `updateEvents` (an EventEmitter) is the only channel between the boot loader and stage 2. The boot loader listens to `insider`, `disable`, `silence`, `check`. Stage 2 listens to `check-start`, `check-end`, `latest-public-version`, `update-manual-required`, `update-downloaded` (boot-main.js:22-34, 381; main.js:4038-4043). Stage 2 also emits `cli`, which nothing listens to (**observed**, main.js:5025).
4. Logger: appends `YYYY-MM-DD HH:MM:SS <msg>` (UTC) to `%APPDATA%\obsidian\obsidian.log` and echoes to stdout unless `silence` is set (boot-main.js:46-76). Only boot-loader messages go to the file. Stage-2 `console.log` reaches stdout only. The file is opened in append mode and is never rotated (**observed**). It therefore grows by a few lines every hourly update check (**inferred**, confirmed by the local log).
5. Install id: `userData/id` holds 16 random bytes as hex and is created if missing or shorter than 16 chars (boot-main.js:77-93).
6. Updater, run hourly (`setInterval`, 60 min) and once at boot (boot-main.js:330, 380):
   * Sends a fire-and-forget ping `https://releases.obsidian.md/desktop?id=<id>&v=<pkgVersion>&p=<platform>` on every check (boot-main.js:106). This is the only usage telemetry in the main process (**observed**). Auto-checks skip it when updates are disabled.
   * Manifest: `raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json` first. If that fetch fails, or the download times out (`ETIMEDOUT` only), it retries with `releases.obsidian.md/desktop-releases.json` (boot-main.js:119-154).
   * Manifest fields: `latestVersion, minimumVersion, downloadUrl, hash, signature`, plus an optional `beta` object with the same fields that is used when `insider` is on (boot-main.js:155-168).
   * If the installer (Electron shell) is older than `minimumVersion`, it emits `update-manual-required` and stops.
   * Download is a gzipped asar. It checks `hash` (base64 SHA-256 of the gz bytes) **and** `signature` (RSA-SHA256 over the gz bytes, verified against an embedded X.509 cert: CN dynalist.io, O Dynalist, valid 2016-05-16 to 2040-05-10). Then it gunzips to `obsidian.asar.tmp`, renames to `obsidian-<ver>.asar`, and emits `update-downloaded` (boot-main.js:175-207).
   * GC: deletes `obsidian.asar.tmp` and every `obsidian-*.asar` that is neither the running version nor the latest (boot-main.js:216-228).
   * HTTP uses `electron.net.request` (Chromium stack, so the system proxy applies) with a spoofed Chrome 86 UA. Auth challenges are cancelled (boot-main.js:301-318).
7. Package selection at startup: picks the highest `obsidian-X.Y.Z.asar` in userData whose version is >= the installer version. If it fails to `require`, it shows an error box and falls back to `resources/obsidian.asar` (boot-main.js:331-379). **The signature is checked only at download time, never at load time** (**observed**). See the fuses section.
8. A global `uncaughtException` handler shows an error box, except for `net::ERR` errors (boot-main.js:319-329).

### 2. Stage-2 startup order (main.js:3961-5480)

**Observed** order:

1. If Electron major < 18: error box "Manual update required", open the download page, quit (3962-3969).
2. `--log-level=3` (3970). Computes `isObsidianExe` from `argv0`, the filtered argv `g`, `isTTY = stdin.isTTY && stdout.isTTY`, and the CLI endpoint `T` (3971-3976).
3. **`requestSingleInstanceLock()` fails, so this process becomes a CLI client and returns** (3977-4025, see section 9).
4. macOS non-MAS with installer > 1.14.2: extract the Quick Look resources (4023-4025, `st`).
5. `--enable-features=SharedArrayBuffer` merged with any user-supplied `--enable-features` (4026-4029).
6. Replaces the uncaught-exception handler. It also ignores "Render frame was disposed before WebFrameMain could be accessed" (4030-4037).
7. Resolves `userData` (`v`), Documents (`V`) and Desktop (`Z`) with fallbacks (4044-4072).
8. Loads `obsidian.json` (`C = ee("obsidian")`), decides work-mode and policy, initialises main-process i18n from `C.language`, purges registry entries whose folder is missing or that point at the legacy `Obsidian Help` vault (and deletes their window-state JSON), GCs orphan `Partitions/vault-*` dirs, syncs `insider`, frame style, update-disable, `disableHardwareAcceleration()` when `C.disableGpu`, and loads the custom icon (4365-4416).
9. Builds the base app menu `Ne = kt([], true)` (4417).
10. Captures early `open-url` / `open-file` during `will-finish-launching` (macOS cold start) (4751-4760).
11. Starts the CLI server `Qe.listen(T)` **before** `ready`. On POSIX it first unlinks a stale socket (4824-4833).
12. `second-instance` handler, Windows `session=` back-channel only (4877-4895).
13. `whenReady`: `app://` handler, 47 IPC channels, `register-cli`, default-session filters, API freeze, permission handler, about panel, dock icon, app menu, `web-contents-created`, `open-file`, `window-all-closed` (quit except macOS), `before-quit`, `will-quit` (close the CLI server, unlink the socket), `activate` (macOS dock click reopens). Then it processes launch args: a trailing `obsidian://…` goes to `Ze`, a queued mac open-file goes to `He`, and if every arg is an existing path each goes to `He`. Finally it either restores vaults (`We`) or clears stale `open` flags (4896-5479).
14. `setAsDefaultProtocolClient("obsidian")` if not already default, on every launch (5480).

### 3. Windows

#### 3.1 Vault window, `se(id, focus=true)` (main.js:4589-4698), BrowserWindow site #1

**Observed** options: `width 800, height 600, minWidth 200, minHeight 150, backgroundColor "#00000000"` (transparent, for macOS vibrancy), `trafficLightPosition {x:19,y:12}`, `show:false`, `frame: C.frame === "native"`, `titleBarStyle: native ? "default" : "hidden"`, followed by the sanitised saved bounds.

`webPreferences`:

| key | value |
|---|---|
| contextIsolation | `false` |
| nodeIntegration | `true` |
| nodeIntegrationInWorker | `true` |
| spellcheck | `true` |
| webviewTag | `true` (web viewer, canvas link nodes) |
| devTools | `policy.devTools` |
| preload / sandbox / partition | **not set**: no preload, unsandboxed, default session |

Lifecycle:
* One window per vault id, kept in map `Y[id]`. Calling it again just restores and focuses the existing window.
* Loads `app://obsidian.md/index.html`. Shows on `ready-to-show` or when `loadURL` settles, whichever comes first (guarded). On show it re-maximises, re-opens DevTools if they were open last time and policy allows, and restores zoom.
* `menuBarVisible = false`. Sets the custom icon on non-macOS.
* State tracking: on `resize`/`move` a 100 ms debounce records `x,y,width,height` only while the window is not maximised, minimised or fullscreen. It also records `isMaximized`, `devTools` (open?) and `zoom` (webContents zoomLevel).
* `close`: marks `closing`, snapshots state, writes `userData/<vaultId>.json`, then a **3 s failsafe** `destroy()` unless the event was default-prevented (the renderer can delay the close to flush saves; `is-closing` lets it ask) (4668-4675).
* `closed`: removes it from `Y`. If the app is not quitting and either the starter is open or other windows remain, it clears the vault's `open` flag. If the last window closes because of quit, `open` stays true, and that is how "reopen the vaults that were open" works on the next launch (`We`, 4761-4765) (4676-4680).
* `did-create-window` (popouts): records `child -> parent` in a `WeakMap` (`Ge`) so vault and menu lookups follow the chain to the root window. Applies the same wiring and context-menu hook (4688-4696).
* The vault folder is registered with `app.addRecentDocument` (jump list / recent documents) by the open-folder routine `h()` that calls `se`, not by `se` itself (5383, 5390).

#### 3.2 Bounds sanitiser `ct` (4342-4364)
Default size is `min(1024, workArea.width) x min(800, workArea.height - 1)` of the primary display. Saved bounds are used only if all four values exist and the rectangle intersects some display's work area with more than 2 px overlap (`Ut`). Width/height without x/y are accepted, and the OS centres the window. Minimum is 300x200.

#### 3.3 Popout windows (renderer-driven), BrowserWindow site #3 (implicit)
The renderer calls `window.open("about:blank", …, "popup[,parented=1],width=…,height=…,x=…,y=…,background=#rrggbb")` (app.js:96490-96510); `parented=1` is added only when the caller asks for it, which only modal popouts (such as settings) do, and only while the main window is fullscreen (app.js:104488). In `setWindowOpenHandler`, main **allows** only `about:blank` with `popup` features (4259-4296). It parses `x,y,width,height,background,parented`, sets `parent` and `fullscreen:false` when parented, and gives the window the same frame style and webPreferences as a vault window plus `affinity:"main-window"`. That option is long removed from Electron, so it is a leftover and ignored (**inferred**). **Inferred design**: because the child is a same-origin `about:blank`, the parent window's JS builds and drives the popout DOM directly. One app instance renders into several OS windows. This is why app code everywhere uses `activeWindow`, `activeDocument`, `el.win` and `el.doc`.

#### 3.4 Starter and help windows, `Tt` (4699-4721), BrowserWindow site #2
Fixed size (starter 800x650, help 600x680), `resizable/maximizable/fullscreenable:false`, `backgroundColor:"#1e1e1e"`, `webPreferences {contextIsolation:false, nodeIntegration:true, devTools: policy.devTools}` (no webviewTag). Both are singletons (`pe`, `Ce`). They load `app://obsidian.md/starter.html` and `help.html`.

#### 3.5 Window event plumbing `G` (4214-4251), `ie` (4205-4213)
* `setFrameZoomLevel(z)` is a monkey-patch on the BrowserWindow. It clamps to [-2.5, 3] and runs `webFrame.setZoomLevel` inside the renderer. It is re-applied on every `did-finish-load`. The menu does ±0.5 per step and Ctrl+0 resets.
* `app-command` browser back/forward and the macOS `swipe` gesture call `history.back()/forward()` in the renderer.
* `focus`/`blur` dispatch a synthetic `focuschange` window event. Fullscreen enter/leave dispatches `fullscreenchange`. Focus also records `focusTime`, which is used to pick the "most recent vault" for URIs and the CLI (`ve`, 4552-4559).
* Always-on-top is a checkbox in the Window menu. It is cleared automatically on maximise or fullscreen. Leaving fullscreen un-parents child windows.

#### 3.6 Starter (vault picker) flow (starter.js:6987-7480)
**Observed**:
* Reads `policy` and freezes it. Migrates the legacy `localStorage["obsidian-vault-path"]` by opening it (7187).
* Recent list: `vault-list`, sorted by `ts` desc, shows basename and parent dir. The context menu has Rename (inline contentEditable, which turns into `vault-move` to the same parent), Move (directory picker, then `vault-move`), Copy vault ID, Reveal (`remote.shell.showItemInFolder`), and Remove (`vault-remove`, then delete IndexedDB databases and localStorage keys prefixed `<id>-`) (7016-7120). Rename/move refuses when the target exists or lies inside the vault.
* **Quick start**: `get-default-vault-path` (`Documents/Obsidian Vault`), then `vault-open(path, create=true)`, then `vault-message(path,{action:"vault-setup"})`. If the folder already exists it falls back to opening it (7207-7213).
* **Create vault**: name + Browse folder (`remote.dialog.showOpenDialogSync`, `openDirectory|createDirectory`). It warns when the path contains Dropbox, iCloud or OneDrive, and on macOS when it is under Documents/Desktop (iCloud Drive). It rejects a trailing `.` on Windows. Then `vault-open(parent + "/" + name, true)` and `vault-message(…{action:"vault-setup"})` or `{action:"sync-setup", vault: JSON}` (7280-7332).
* **Open folder as vault**: directory picker, then `vault-open(path,false)`.
* **Sync sign-in** (only when `policy.sync`): an email/password/6-digit MFA form in the starter itself, then a remote vault list (`/vault/list` with `supported_encryption_version: 3`). "Connect" pre-fills the create form under `get-documents-path` and passes the remote vault descriptor via `sync-setup` (7345-7450). Architecture only; the account protocol is covered elsewhere.
* Language dropdown calls `set-language`. The help icon calls `help`.
* Startup GC: deletes IndexedDB databases named `<id>-browser` whose id is no longer registered (7458-7480).
* On success the starter calls `window.close()`. The vault window appears from main.

#### 3.7 Help window (help.js:4660-4720)
A launcher, not offline docs: links to the localized help site, Discord, forum (`shell.openExternal`), and "Open sandbox vault" (`sandbox` IPC).

#### 3.8 Sandbox vault (main.js:5395-5422)
`sandbox` IPC: if a window for `userData/Obsidian Sandbox` is already open, focus it. Otherwise delete the folder, recursively copy `<asar>/sandbox` into it (a plain byte copy, since asar reads are transparent to `fs`), and open it like any vault. Every fresh open resets the sandbox (**observed**).

### 4. Vault registry and routing

* `obsidian.json.vaults`: `{ <16-hex id>: { path, ts, open? } }`. New ids come from `io(16)`, which uses `Math.random` and is not cryptographic (**observed**, 3831-3836, 5387).
* `h(path)` "open folder as vault" (5372-5394): resolve, check it exists, check `R_OK|W_OK` (`fs.accessSync`), else return `"folder not found"` / `"no permission to access folder"`. Matches existing entries by exact resolved path (case-sensitive string compare, **observed**), bumps `ts`, opens, `addRecentDocument`.
* Lookups: `Ye(name)` matches an id or a case-insensitive folder basename (4560-4567). `Ft(path)` gives the vault containing a path (prefix + separator, 4571-4588). `Dt(win)` gives the vault for a window, following popout parents.
* `Ze(uri)` `obsidian://` router (5482-5527):
  * `obsidian:///abs/path` gives `{action:"open", path}`.
  * `obsidian://vault/<vault>/<file…>` gives `{action:"open", vault, file}`.
  * `sync-setup…` and `choose-vault…` open the starter.
  * Anything else becomes `action` + decoded query params (`no`, 3813-3826). A bare `?flag` is treated as `"true"`, and `#hash` becomes `hash`.
  * Target vault: if `path` is present, the longest registered vault containing it (and `file` is made relative); there is no fallback when none contains it. Otherwise `vault=` by name or id, else the most recently focused window (opening saved vaults or the starter first). It delivers `OBS_ACT` to that window or shows an error box "vault not found".
* `He(path)` from launch args, macOS `open-file`, or the CLI (5528-5556): if it is a directory inside a vault, open that vault. If it is a file inside a vault, `OBS_ACT {action:"open", file: relative}`. A file outside any vault opens in the most recent window as `OBS_OPEN_FILE <abs path>`, and the renderer opens it as the pseudo-path `"file:" + abs` (app.js:108800-108812). With no window at all it shows the starter.
* **Renderer mailbox `Xe(name, win, payload)`** (5565-5569): injects JS. If `window[name]` is a function, call it with the payload. Otherwise set `window[name] = payload` so the renderer picks it up when it registers. Delivery is deferred until `did-finish-load`. It is used for `OBS_ACT` (URI actions, app.js:106069) and `OBS_OPEN_FILE`. This is a neat race-free hand-off that needs no IPC listener (**inferred** rationale).

### 5. `app://` protocol (main.js:4896-4950)

| Host | Maps to | Notes |
|---|---|---|
| `app://obsidian.md/<path>` | `<asar>/<path>` | `decodeURIComponent`, `path.resolve(join(asar, p))` must start with `resolve(asar)`. Always `X-Frame-Options: DENY`. |
| `app://<36 random hex>/<path>` (`file-url` IPC) | absolute filesystem path (POSIX gets a leading `/`) | Host regenerated each launch (`io(36)`, 4365). UNC paths arrive as `%5C%5Chost/share/…` (app.js:24691-24697) and trigger the per-host network-drive consent dialog `so` plus `X-Frame-Options: DENY`. |

* **Resource URL format** (renderer `getResourcePath`, app.js:24691-24698): `app://<rand>/` + `pathToFileURL(fullPath)` without `file:///` + `?` + file mtime (or `Date.now()` if unknown). The query string is a cache-buster, so an edited image reloads. Renderer code rewrites `file:///` to this prefix and back in several places (app.js:51087, 62374, 81000, 112919, 116378).
* Handler: uses `protocol.registerFileProtocol` when it exists, otherwise `protocol.handle` (4904-4915). **Electron 43.7.7 still ships `protocol.registerFileProtocol`** (the browser-side protocol module in `Obsidian.exe` exports it as a wrapper over `defaultSession.protocol.registerFileProtocol`, **observed** in the binary's strings), so the **`registerFileProtocol` branch is the one that runs** in this build. It answers `{path, headers}` (only `X-Frame-Options: DENY` when flagged), a refused or invalid path answers `{path: ""}` so the load fails, and Range, MIME type and status codes come from Chromium's file loader (**inferred**). The `handle` branch is a fallback for a future Electron without the old API: it implements **HTTP Range** itself (`bytes=a-b`, 206 with `Content-Range`/`Accept-Ranges`, 416 on bad ranges; a suffix range `bytes=-N` would be read as `0-N`, **inferred** bug), always sends `Access-Control-Allow-Origin: *`, `Last-Modified` and `Content-Length`, streams with `fs.createReadStream`, returns **400** "Not Found" for missing files, 403 for a denied network drive, and sets **no `Content-Type`** (**observed**, 4915-4950).
* **Who may load `app://`**: a default-session `webRequest.onBeforeRequest` filter on `app://*/*` cancels every request unless the requesting frame's origin is `app://obsidian.md`, or it is a top-level frame with origin `"null"` loading an `app://obsidian.md/` URL, which covers the initial navigation (5323-5329). Obsidian's own webviews use `persist:vault-<id>` partitions, where `app:` has no handler; the partition is the renderer's choice, since `will-attach-webview` does not force one (**observed**). So remote pages (note iframes, embeds, web viewer) cannot read local files even if they guess the random host. Defence in depth: random host + origin filter + partition isolation (**inferred**).
* Weakness (**inferred**): the asar containment check is a string prefix without a trailing separator, so a decoded `..%2F` path into a sibling whose name starts with `obsidian.asar…` would pass. Low impact, because the random host already exposes the whole filesystem to the trusted origin.

### 6. WebContents security and link handling

`fe(webContents)` runs once per webContents (`isSecured` flag) for every webContents via `web-contents-created` (5432) and per window (4252-4341). **Observed**:

* **Top-level `will-navigate`** (non-guest): any URL not starting with `app://obsidian.md/index.html` and not `about:blank` is cancelled. Cancelled URLs outside `app://obsidian.md/` are routed to `H` (the external opener).
* **`setWindowOpenHandler`**: allows only popout `about:blank` (above). Everything else goes to `H(url, disposition, frameName)` and is denied.
* **`will-attach-webview`**: strips `preload`/`preloadURL` and forces `sandbox:true, nodeIntegration:false, nodeIntegrationInWorker:false, nodeIntegrationInSubFrames:false, webSecurity:true, plugins:false, experimentalFeatures:false, webviewTag:false` (4298-4310).
* **`did-attach-webview`** (guest): `window.open` from the page goes to `H` only for `http(s)`, and is always denied natively. **At most one `foreground-tab` open per navigation**: a flag is reset on `did-navigate`, which works as an anti-popup-spam latch. `will-navigate` and `will-frame-navigate` allow only `http(s)`, which blocks `file:`, `javascript:` and custom schemes. Nested `<webview>` is prevented (4311-4339).
* Guest context menus use the native `uo` menu unless the renderer set `noContextMenu` (it shows its own through `remote.Menu`, app.js:111344, 111400).

**External link router `H(win, url, disposition, frameName)`** (4141-4192):
1. Parse the scheme. Ignore `app:` and `about:`.
2. `file:` URLs are converted to a path (`K`, 4133-4140). Files inside a registered vault skip the scheme prompt.
3. Any scheme other than `http`, `https`, `obsidian`, or one in `obsidian.json.openSchemes` shows a warning dialog (link truncated to 200 chars) with an "always open `<scheme>` links" checkbox. If checked, the scheme is persisted in `openSchemes`.
4. `http(s)` with frameName not equal to `_external`: it first asks the renderer by dispatching a cancelable `CustomEvent('open-url', {detail:{url, leaf, active}})`, where `leaf` is `window` for `new-window`, `split` for frameName `split`, otherwise `tab`, and `active` comes from foreground/background. If the renderer calls `preventDefault()`, which the Web Viewer core plugin does when it is enabled (listener at app.js:110602), the link opens in an Obsidian tab. Otherwise `shell.openExternal`.
5. `file:` that is UNC, or (on Windows) not drive-lettered, shows a "remote file" warning. If `zo` detects an executable, it shows an "executable file" warning with a **Run** button. Then Linux uses `openExternal(fileURL)` and Win/mac use `shell.openPath`.
6. `zo` executable detection (3869-3889): Windows extensions `.exe .bat .cmd .ps1 .com .msi .vbs .js .jse .wsf .wsh .py .pyw .scr`. POSIX extensions `.sh .command .csh .ksh .bash .zsh .fish .desktop .action .workflow`, or an extensionless file with any exec bit whose first bytes are `#!`, ELF (`7f454c46`) or Mach-O (`cffaedfe`/`feedface`). The Windows list does not cover `.lnk .hta .cpl .jar .reg .url .msc` and similar (**observed** absence).
* The renderer redirects `window.open("file:…")` to IPC `open-url` (app.js:96484, starter.js:6981), so even renderer-opened file links pass through `H`.

### 7. Sessions, headers, permissions (main.js:5235-5249, 5323-5371)

**Default session** (all vault, starter and popout windows):
* `onBeforeSendHeaders` on http(s): for `youtube.com/embed/` and `youtube-nocookie.com/embed/`, add `Referer: md.obsidian` if absent. YouTube embeds refuse to play without a referrer (**inferred** purpose).
* `onHeadersReceived` on http(s): **removes `X-Frame-Options` and `Cross-Origin-Opener-Policy`, strips `frame-ancestors` from CSP**, and for subframes rewrites `Set-Cookie … SameSite=Lax` to `SameSite=None` when `Secure`. Subframe detection also walks `framesInSubtree` because `resourceType` is not reliable. Effect: any site can be embedded in an `<iframe>` in notes and keep its login (**inferred**).
* **API freeze** (5353-5364): after installing the hooks, main overwrites `webRequest.onBeforeRequest/onBeforeSendHeaders/onHeadersReceived` on the default session, and `interceptBuffer/Stream/String/File/HttpProtocol` and `handle` on both `protocol` and `defaultSession.protocol`, with no-ops. **Inferred purpose**: the renderer, and so every community plugin, holds `@electron/remote`. Without the freeze a plugin could replace the `app://` origin filter or the protocol handler from the renderer. The freeze is **partial** (**observed** absence): `unhandle`, `unregisterProtocol`, `uninterceptProtocol`, the `register*Protocol` family, the other `webRequest` events and `setPermissionRequestHandler` are not overwritten, so a plugin can still unregister `app` and register its own handler. Because renderer code already has full Node access, it is a guard against accidental clobbering rather than a security boundary (**inferred**). The idea is cheap, but a rebuild should cover every mutator.
* `setPermissionRequestHandler` (5365-5371): grants any permission when the **webContents** URL (`webContents.getURL()`, not the requesting frame's URL) starts with `app://obsidian.md/`. So a request from a remote iframe embedded in a vault window is also granted, limited only by Chromium's Permissions Policy for cross-origin frames (**inferred**). Grants `clipboard-*` to `about:blank` main frames (popouts). **Always denies `openExternal`** and always allows `fullscreen`. Logs everything it blocks.
* No `setPermissionCheckHandler`, `setDevicePermissionHandler`, proxy or CSP header on the default session (**observed** absence). The only CSP is the `<meta>` in `index.html`: `style-src 'unsafe-inline' 'self' https://fonts.googleapis.com`. No `script-src`. Its effect is that themes cannot pull remote stylesheets except Google Fonts.

**Browser sessions** (`create-browser-session(partition, adblock)`; partition = `persist:vault-<vaultId>`, app.js:145857), one per vault, used by the Web Viewer (app.js:110649, 111007) and canvas link nodes (app.js:125670-125672):
* Created lazily and cached in `ne[partition]`. The UA has tokens beginning with `obsidian` or `electron` removed.
* `onBeforeRequest` http(s): `cancel = session.adblock && filterList.matches(url)`.
* `onBeforeSendHeaders`: forces `User-Agent: Chrome` for `https://accounts.google.com/` (**inferred**: avoids Google's embedded-browser sign-in block).
* Permission check and request allow only `clipboard-read`, `clipboard-sanitized-write`. `setDevicePermissionHandler` denies everything (HID/serial/USB).
* Partition directories `userData/Partitions/vault-<id>` are deleted on `vault-remove` and GC'd at startup for unknown ids (4397-4416). The renderer clears web viewer storage with `remote.session.fromPartition(...).clearStorageData` (app.js:110808).
* No `will-download` handler anywhere (**observed**), so Electron's default save dialog applies (**inferred**).

### 8. Ad-block filter list `Re` (main.js:108-207, loader `we` 4083-4113)

**Parser (`add`)**, **observed**:
* Lines of 3 chars or fewer, or starting with `!`, are skipped.
* **Cosmetic rules (`##`) are skipped. Exception rules (`@@`) are skipped**, so there is no allow-listing.
* `||` means domain-anchored: the rest is normalised by stripping `https://`, `http://` and a leading `www.`. A leading `|` is start-anchored and a trailing `|` is end-anchored.
* **Any rule with a `$` options suffix is dropped entirely**: it slices the options off and then returns without storing. So `$third-party`, `$script`, `$domain=` and similar rules never apply.
* `/regex/` rules and rules of 3 chars or fewer after normalisation are dropped.
* The pattern is split on `*` runs. Each piece is split on `^`, and each non-empty token becomes `{text, before, after}`, where `before`/`after` mean a separator must touch it.
* Separator set for `^`: `/ : ? = &`, and end of string for `after`. That is a subset of ABP's definition.

**Matcher**: for each rule in order (a linear scan), the tokens must appear in sequence (`indexOf` from the last position + 1). The start anchor needs the first token at 0 and the end anchor needs the last token flush with the end. Domain rules match against the normalised URL, which is cached per call. `||` rules are **not** start-anchored after normalisation, so they can over-match, e.g. when the domain appears in a path or query (**inferred**). Complexity is O(rules × URL) per request, with no token index.

**Loader**: lists come from `obsidian.json.adblock`, default `easylist.txt` + `easyprivacy.txt` from easylist.to. They are cached as `userData/adblock/<basename>`. A list is refetched with `net.fetch` when its cache is older than `adblockFrequency` days (default **4**; `0` = never refetch). The refresh timer is `min(freq, 24)` days. The cap of 24 keeps `setTimeout` under its 2^31 ms (~24.8 days) limit (**inferred**). The new matcher is swapped in atomically when done. A fetch failure is logged and the list skipped, without falling back to the old cache (**observed**). Loading is lazy: `we()` runs only when a browser session is first created with `adblock === true`, or when the list or frequency setting changes (4083, 5033, 5037, 5237). One matcher is shared by all sessions. If a canvas webview (which passes `adblock: null`) creates the vault's session first, a later web-viewer call only flips the flag, and the lists stay unloaded for that run unless another session triggers the load (**inferred** edge case).

### 9. The CLI (main.js:3971-4025, 4772-4895, 281-760; renderer app.js:58413-60483)

#### 9.1 Transport and endpoints
| Platform | Endpoint (`T`, main.js:3976) |
|---|---|
| Windows | named pipe `\\.\pipe\obsidian-cli-<os.userInfo().username>` |
| macOS | `~/.obsidian-cli.sock` |
| Linux | `$XDG_RUNTIME_DIR/.obsidian-cli.sock`, else `~/.obsidian-cli.sock` |

**Server (`Qe`, 4795-4833)**: `net.createServer` listens **before app ready** in the primary instance. Each connection must send one **JSON header line** `{"argv":[…],"tty":bool,"cwd":"…"}\n` within **5 s** or it is destroyed. Bytes after the newline are `unshift`ed back so keystrokes are not lost. The header is logged to stdout. The connection is then dispatched by `Pt`. The `JSON.parse` of the header runs inside the socket `data` listener, outside the promise. A malformed header line therefore surfaces as a main-process uncaught exception (the stage-2 handler shows an error dialog), and the socket is destroyed only when the 5 s timer fires (**inferred**).

**Client modes**:
* **Obsidian.exe/binary as client** (3977-4025): when the single-instance lock fails, the second process hides the dock icon (mac), emits `disable` and `silence` to its own boot loader (no update check, no log echo), connects to `T`, writes the header, puts stdin in raw mode if it is a TTY, pipes `stdin -> socket -> stdout`, and exits 0 on `end` after draining stdout (1 on error). If the installer is older than 1.11.7 it prints an "installer out of date, get better CLI support" hint. This also handles **file associations and `obsidian://` launches on Windows/Linux** while the app is running: the argv simply rides the CLI pipe (**observed** in `Pt`), not Electron's `second-instance`.
* **Obsidian.com** (Windows): a 22,800-byte PE32 console program, FileDescription "Obsidian CLI", imports only KERNEL32/ADVAPI32/SHELL32. It connects to the same pipe, writes the same JSON header and relays I/O (REA `ev_b83396ea…`). **Inferred why it exists**: `Obsidian.exe` is a GUI-subsystem binary with no attached console, so its stdout is invisible in a terminal. Because `.COM` precedes `.EXE` in the default `PATHEXT`, typing `obsidian` in a terminal resolves to the console shim, the same trick `devenv.com` uses. It cannot launch Obsidian ("…make sure Obsidian is running").
* **Windows `session=` back-channel** (4877-4895, 3978-3981): if a new `Obsidian.exe` is started with argv[0] = `session=<pipeName>` (optionally followed by `tty`), the secondary exits immediately. The primary's `second-instance` handler **connects out** to `\\.\pipe\<pipeName>`, retrying every 10 ms for 2 s, and runs `Pt` over it. So the launcher is the pipe server. Which binary uses this is **unknown**: Obsidian.com has no `CreateNamedPipeW` import, so maybe an older shim or a future "launch-if-not-running" path.

**Dispatch `Pt(sock, argv, tty, cwd)`** (4834-4876), **observed**:
1. Non-TTY with empty argv (e.g. relaunching the app from a shortcut while it runs) opens the **starter** window.
2. Last arg starts with `obsidian://`: route via `Ze`, reply "Processed URI …".
3. Last arg is an existing path: `He`, reply "Opened …".
4. Otherwise, if `obsidian.json.cli !== true`, reply "Command line interface is not enabled. Please turn it on in Settings > General > Advanced." **Steps 1-3 bypass this toggle**, because they are the normal launch-forwarding paths.
5. Vault choice: a leading `vault=<name|id>` arg, else the vault containing `cwd`, else the most recently focused vault window.
6. TTY with no further args starts the interactive **TUI** (`zt`). Otherwise it runs once via `At` and writes the result plus a trailing newline, then `end`.

**`At(vaultId, argv)`** (4772-4794): checks `C.cli` and the vault, opens the vault window **without focusing** if needed, then `executeJavaScript` a promise that calls `window.handleCli(argv)`. If the renderer is not ready it pushes `{argv, resolve, reject}` onto `window.cliQueue`, which `NF.init` drains once `workspace.onLayoutReady` fires (app.js:58486-58492). Thrown strings come back as `Error: …`.

**Auth / permissions**: there is **no token, handshake or peer-credential check** (**observed**). Access control is (a) OS ACLs on the pipe or socket and (b) the `cli` toggle (default off), toggled via IPC `cli` from Settings > General > Advanced (app.js:132128-132150). **Inferred**: libuv's default pipe DACL lets other non-admin users only read, and a socket in `$XDG_RUNTIME_DIR` (0700) or `~` under the default umask is same-user, so in practice this is "same user = full control". The command set includes `eval` (run JS in a Node-enabled renderer) and `dev:cdp` (raw Chrome DevTools Protocol through `webContents.debugger` via remote, app.js:58579-58700). Enabling the CLI therefore gives any same-user process scripted code execution in Obsidian, which is about equivalent to that process's own rights. A same-user process could also squat the pipe name before Obsidian starts and capture `argv`/`cwd` from CLI users. Low impact, but nothing prevents it (**inferred**).

#### 9.2 Renderer command registry `NF` (`app.cli`, app.js:58413-60483, created at app.js:144743)
* `registerHandler(name, description, flags, handler)`: duplicate names throw. `unregisterHandler(name, handler?)`.
* Flag schema per command: `{ <flag>: { value?: "<placeholder>" | "a|b|c", description, required? } }`. A flag with `value` is written `flag=value`. A bare word means `"true"`.
* `handleCli(argv)`: argv[0] is the command (missing or `--help` means `help`). Other args parse as `k=v` or `k` = `"true"`. Shorthand `cmd:flag` works when `flag` is a declared flag of `cmd`. Unknown commands get **"Did you mean"**: prefix, then substring, then Levenshtein ≤ 3 (app.js:58378-58402). Otherwise "It may require a plugin to be enabled". For commands with a `format` flag, `--json`/`--md`/`--tsv`/`--csv` (the only `--` flags the argv filter keeps) are mapped onto `format=`. Missing required flags produce a usage line. `--copy` writes the result to the clipboard. The return value is a string.
* Helpers: `formatTable(headers, rows, format)` (json / csv / tsv), `formatAsciiTree`, `tryResolveFile(flags)` (where `file=` resolves like a wikilink and `path=` is exact).
* Help text: "Usage: obsidian <command> [options]", global option `vault=<name>`, quoting with `name="My Note"`, `\n`/`\t` escapes in content values, and a separate "Developer" section for `dev:*`, `devtools`, `eval` (app.js:58505-58540).
* **Public plugin API**: `Plugin.registerCliHandler(name, description, flags, handler)` adds a `[<Plugin name>]: ` description prefix and auto-unregisters on unload (app.js:109078-109084). Internal (core) plugins register without the prefix (app.js:110121).
* **Command inventory** (114 user-facing plus 3 internal `__completions`, `__commands`, `__files limit=`; line = registration site):
  * core (app.js:58505-60400): `help`, `devtools`, `dev:mobile`, `dev:debug`, `dev:errors`, `dev:screenshot`, `dev:cdp`, `dev:css`, `dev:dom`, `dev:console`, `eval`, `commands`, `command`, `random`, `random:read`, `reload`, `restart`, `plugin`, `plugins`, `plugins:enabled`, `plugins:restrict`, `themes`, `theme`, `snippets`, `snippets:enabled`, `tags`, `tasks`, `task`, `tag`, `properties`, `property:set`, `property:remove`, `property:read`, `tabs`, `recents`, `tab:open`, `workspace`, `hotkeys`, `hotkey`, `vault`, `files`, `folders`, `vaults`, `version`, `backlinks`, `unresolved`, `orphans`, `deadends`, `aliases`, `folder`, `file`, `open`, `create`, `append`, `prepend`, `move`, `rename`, `delete`, `read`, `diff`, `plugin:enable`, `plugin:disable`, `plugin:reload`, `plugin:install`, `plugin:uninstall`, `snippet:enable`, `snippet:disable`, `theme:set`, `theme:install`, `theme:uninstall`
  * core plugins: search `search`, `search:context`, `search:open` (99834-99893); web viewer `web` (110615); bases `base:query`, `bases`, `base:views`, `base:create` (119771-119881); bookmarks `bookmarks`, `bookmark` (120921-120941); daily notes `daily`, `daily:path`, `daily:read`, `daily:append`, `daily:prepend` (127635-127729); file recovery `history`, `history:list`, `history:read`, `history:restore`, `history:open` (128304-128397); `links` (129794); `outline` (130470); publish `publish:open|status|list|site|add|remove` (134709-134866); sync `sync`, `sync:history|read|restore|open|deleted|status` (138864-139003); templates `templates`, `template:read`, `template:insert` (140727-140759); `unique` (141014); `wordcount` (141296); workspaces `workspaces`, `workspace:save|load|delete` (141437-141465).
  * Developer commands keep the last 50 `error`/`unhandledrejection` entries and the last 200 console messages in memory for `dev:errors`/`dev:console`, and attach the CDP debugger at protocol `"1.3"` with `Runtime.enable` / `DOM.enable` (app.js:58579-58600).

#### 9.3 Interactive TUI (`nt`/`zt`, main.js:281-760)
Lives in **main**, not the renderer. It writes ANSI escape sequences directly to the socket, which carries the client's raw TTY.
* Banner: Unicode-block logo, version, current vault name, and a hint line. A 10-line suggestion window (`De = 10`) plus a "N more" line, and a 54-column divider.
* Completion data comes from the vault on start: `__completions` (all commands with usage, description and flags), `vaults`, `__files limit=1000` (recent files first), `__commands` (command-palette ids/names).
* Completion rules: the first word matches by prefix, then by description substring. `vault:open <name>` completes vault names. `file=`/`path=` complete vault files (only `.base` files for `base:*`, and `.md` is stripped for `file=`). `folder=` completes derived folders. Flags whose placeholder is `<command-id>` complete palette commands. `a|b|c` values complete enumerations. Flags already used are hidden.
* Keys: Tab (open/accept), Shift-Tab (undo the accept), ↑/↓ and Ctrl-P/N (suggestions or history), → at end of line (accept the first suggestion), Ctrl-R (reverse incremental history search, Enter accepts, Esc cancels), Ctrl-L (clear), Ctrl-C/Ctrl-D (exit), Emacs editing (Ctrl-A/E/U/K/W/B/F, Alt-B/F/Backspace), Delete. The key decoder maps escape sequences to names (`Ro`).
* Built-ins: `exit`/`quit`; `vault:open <name>` switches the target vault and opens its window; `vault=<name> cmd …` overrides the vault per command; typing `obsidian …` inside the TUI warns "already in the TUI". The tokenizer `Lo` handles single/double quotes and backslash escapes. Errors are printed in red. The prompt is redrawn after each command.

#### 9.4 PATH registration, `register-cli` (`ipcMain.handle`, main.js:5250-5321)
Precondition: `basename(process.argv0)` contains "obsidian", else it returns `{success:false}` with a message.
* **Windows**: reads the user `Path` through `powershell -Command [Environment]::GetEnvironmentVariable('Path','User')`. If the exe directory is missing it appends it with `SetEnvironmentVariable(…,'User')`. The directory is string-interpolated into the PowerShell command, so a `'` in the install path would break it (**inferred**). The .NET get/set pair reads the user `Path` expanded and writes it back as a plain string, so `%VAR%` references in the user `Path` would be flattened (REG_EXPAND_SZ to REG_SZ) (**inferred** from .NET behaviour, not seen in the bundle).
* **macOS**: if `obsidian-cli` exists next to the executable, `osascript … with administrator privileges` runs `ln -sf <that> /usr/local/bin/obsidian` (and skips this if already linked), then removes any legacy "# Added by Obsidian" PATH export from `~/.zprofile`. Otherwise it appends `export PATH="$PATH:<exe dir>"` to `~/.zprofile`.
* **Linux**: if `obsidian-cli` sits beside the exe, copy it to `~/.local/bin/obsidian` with mode 0755. Otherwise symlink `~/.local/bin/obsidian` to the exe, `$APPIMAGE`, or the Flatpak exported bin (`~/.local/share/flatpak/exports/bin/$FLATPAK_ID` or `/var/lib/flatpak/exports/bin/$FLATPAK_ID`).
* The renderer offers this in a modal right after the CLI toggle is switched on (app.js:132128-132150).

### 10. IPC channel table (47; `ipcMain.on` unless noted; REA evidence `ev_00c748ba…`)

"sync" means the renderer uses `sendSync` and main sets `event.returnValue`. Some sync handlers set it after an `await` (`trash`, `request-url` does not). Electron waits for the assignment, so the renderer blocks (**observed** pattern).

| # | Channel | main.js | Args (renderer → main) | Behaviour / return | Renderer callers |
|---|---|---|---|---|---|
| 1 | `terms` | 4951 | – | returns the fixed "not allowed to distribute… registered trademark" sentence (`oo`, 3812). The renderer compares it to an identical literal and **closes the window on mismatch** (app.js:146277). **Inferred**: a repackaging/fork tripwire and terms acknowledgement, not a security control. | app.js:146277 |
| 2 | `is-quitting` | 4954 | – | `Se` (quitting flag) | app.js:106445 |
| 3 | `is-closing` | 4957 | – | quitting, or the sender's window has `closing` set | app.js:146164 |
| 4 | `desktop-dir` | 4961 | – | Desktop path (fallbacks) | app.js:135648, starter.js:7303 |
| 5 | `documents-dir` | 4964 | – | Documents path | same |
| 6 | `resources` | 4967 | – | asar path | no static caller found |
| 7 | `version` | 4970 | – | asar `package.json` version (stage-2 version; `remote.app.getVersion()` is the installer) | app.js:144599, 146275; starter/help |
| 8 | `policy` | 4973 | – | effective policy object: all-true for normal builds. For work mode (`app.name === "obsidian-work"` or `obsidian.json.isWork === true`) it is parsed from `policy.json` (missing or invalid means **all false**). Frozen in the renderer. | app.js:146276, starter.js:6987 |
| 9 | `set-language` | 4976 | `lang` or null | persists or deletes `C.language`, returns null | app.js:35299, starter.js:7253 |
| 10 | `file-url` | 4981 | – | `app://<rand36>/` resource prefix | app.js:36710, starter.js:5352, help.js:508 |
| 11 | `relaunch` | 4984 | – | sets quitting, `app.relaunch()`, `app.quit()` | app.js:146216 |
| 12 | `update` | 4991 | – | `""` / `"update-downloaded"` / `"update-manual-required"` | app.js:131967, 132189, 145313 |
| 13 | `latest-public-version` | 4994 | – | last `latestVersion` seen | app.js:131968 |
| 14 | `check-update` | 4997 | `true` = start a check | emits `check` (temporarily un-disables; redundant since manual checks ignore `disable`, **inferred**), returns `checking` | app.js:132190, 132214 |
| 15 | `disable-update` | 5001 | `true`/`false`/other = query | sets or deletes `C.updateDisabled`, emits `disable`, returns state | app.js:132015, 145311 |
| 16 | `copy-asar` | 5005 | `filepath` | main only requires the basename to start with `obsidian-X.Y.Z` (regex `^obsidian-(\d+\.\d+\.\d+)`, not end-anchored, no extension or version check). Copies it (with `original-fs`) to `userData/obsidian-X.Y.Z.asar` and returns bool. Used when a user **drags an `obsidian-X.Y.Z.asar` onto the window**: the renderer checks the `.asar` extension and that the version is ≥ the current one, confirms "Install Obsidian X? potentially experimental", then relaunches. These checks are renderer-side only. **No signature check** anywhere (app.js:145317-145334). | app.js:145329 |
| 17 | `disable-gpu` | 5016 | bool / query | persists `C.disableGpu` (applied at next start) | app.js:132157, 132175 |
| 18 | `insider-build` | 5020 | bool / null | enabling is allowed only if `policy.insider`. Persists and emits `insider` (switches to the manifest `beta` block). | app.js:51450, 131970, 132038-132049 |
| 19 | `cli` | 5024 | bool / null | persists `C.cli`, emits `cli` (unused), returns state | app.js:132129-132130 |
| 20 | `frame` | 5028 | `"hidden"`/`"custom"`/`"native"` / query | persists `C.frame` (an empty string deletes it). Main only distinguishes native from not native. The renderer draws its own title bar unless native, and `hidden` adds `is-hidden-frameless` (app.js:55985-55988, 143529-143545). Needs a relaunch. | app.js:55985, 143529 |
| 21 | `adblock-lists` | 5032 | `string[]` / query | persist list URLs and reload them | app.js:110673, 110737 |
| 22 | `adblock-frequency` | 5036 | number (days) / query | persist and reload. The reply is `C.adblockFrequency \|\| 4`, so a stored `0` ("never") reads back as 4 (**inferred** UI quirk) | app.js:110673, 110745 |
| 23 | `print-to-pdf` | 5040 | Electron `printToPDF` options + `filepath`, `open` | async. Writes the PDF, optionally opens it, then replies on the same channel name | app.js:36713-36719 |
| 24 | `vault` | 5053 | – | `{id, path}` for the sender's window (popouts resolve to the parent), else `{}` | app.js:55365, 146270 |
| 25 | `vault-list` | 5061 | – | the whole registry `{id:{path,ts,open}}` | app.js:55365, 59626; starter |
| 26 | `vault-remove` | 5064 | `path` | false if the vault is open. Otherwise deletes the entry, `<id>.json` and the partition, returns true | starter.js:7081 |
| 27 | `vault-move` | 5082 | `oldPath, newPath` | `"EVAULTOPEN"` if open, `renameSync`, error string or `""`, false if unknown | starter.js:7032 |
| 28 | `vault-open` | 5106 | `path, create` | create: error if it exists, else `mkdir -p`. Then `h(path)`: true or an error string | app.js:55374, 55440; starter |
| 29 | `vault-message` | 5122 | `path, payload` | delivers `OBS_ACT(payload)` to that vault's window (opening it unfocused) | starter.js:7210, 7320 |
| 30 | `starter` | 5131 | – | open/focus the vault picker | app.js:146071, 146271 |
| 31 | `help` | 5135 | – | open/focus the help window | app.js:146078, starter |
| 32 | `sandbox` | 5139 | – | reset and open the sandbox vault | app.js:104373, 145702, help.js:4718 |
| 33 | `context-menu` | 5143 | – | handshake: mark `sender.id`, so the **next** native `context-menu` event on that webContents is forwarded as an IPC `context-menu` `{editFlags, misspelledWord, dictionarySuggestions, webContentsId}` instead of a native menu. The renderer waits up to 1 s and builds an Obsidian-styled menu with spelling fixes (app.js:36728-36750, 95769-95834). | app.js:36744 |
| 34 | `request-url` | 5146 | `replyChannel (random 16 chars), {url, method, contentType, body (string or ArrayBuffer), headers}` | CORS-free HTTP through `net.request` (redirect follow, auth cancelled, each header set in try/catch). Replies `{status, headers, body: ArrayBuffer}` or `{error}` on `replyChannel`. Backs the public **`requestUrl()`/`request()`** API on desktop (app.js:36690-36705, 42940-43018). No timeout or size cap in main (**observed**). | app.js:36701 |
| 35 | `open-url` | 5176 | `url` | `H(win, url)`, the external link router | app.js:96484, starter.js:6981 |
| 36 | `open-file` | 5180 | `extensions[]` | native open dialog filtered to the extensions, then open the chosen file in the vault or as an external file | app.js:145705 |
| 37 | `trash` | 5187 | `path` | `shell.trashItem`, returns bool (sync from the renderer, awaited in main) | app.js:146362 (FileSystemAdapter `trash` callback) |
| 38 | `get-documents-path` | 5197 | – | Documents | starter.js:7440 |
| 39 | `get-sandbox-vault-path` | 5200 | – | `userData/Obsidian Sandbox` | app.js:107525 |
| 40 | `get-default-vault-path` | 5203 | – | `Documents/Obsidian Vault` | starter.js:7209 |
| 41 | `set-menu` | 5206 | `{template}` | merges into the app menu (`kt`). macOS: application menu of the focused window. Win/Linux: `win.setMenu` (hidden menubar). | app.js:42790 |
| 42 | `update-menu-items` | 5214 | `[{itemId, eState}]`, `refresh` | patches checked/enabled/visible/`sharingItem` on items by id; refresh re-applies on macOS | app.js:42825 |
| 43 | `render-menu` | 5222 | – | pops the window's app menu up as a context menu (hamburger in the custom title bar) | app.js:144617-144620 |
| 44 | `set-icon` | 5226 | `filename, bytes` / nulls | replaces the custom app icon file in userData, persists `C.icon` (applied at next start; dock or `setIcon`) | app.js:142224, 142326 |
| 45 | `get-icon` | 5232 | – | `C.icon` | app.js:142216 |
| 46 | `create-browser-session` | 5235 | `partition, adblock (true/false/null)` | lazy session setup (section 7). `null` leaves the ad-block flag unchanged. | app.js:110649, 125671 |
| 47 | `register-cli` (**`ipcMain.handle`**) | 5250 | – | PATH registration (section 9.4), returns `{success, message}` | app.js:132145 |

Main → renderer messages that are not request/reply: `context-menu` (forwarded data), `print-to-pdf` (done), `request-url` reply channels, and injected JS through `executeJavaScript` (`OBS_ACT`, `OBS_OPEN_FILE`, `handleCli`, `app.commands.executeCommandById(id)` from menus, synthetic `KeyboardEvent` Cmd/Ctrl+Shift+Z for Redo, `open-url` CustomEvent, `focuschange`/`fullscreenchange`, `webFrame.setZoomLevel`, `history.back/forward`).

### 11. Menus (main.js:4417-4551; renderer app.js:42726-42830)
* **Base template** (`kt([], true)`, built before ready):
  * macOS "Obsidian" menu: About (dialog with "Version <asar> (Installer <electron app version>)", Copyright Dynalist Inc., Copy button), a hidden `preferences-section` anchor, Services, Hide, Hide Others, Show All, Quit.
  * File: Open Vault…, Recent Documents (mac/win), Close (vault windows only), Quit (non-mac).
  * Edit: Undo, Redo (custom: synthesises Cmd/Ctrl+Shift+Z in `activeDocument` unless it was triggered by a modified accelerator), Cut/Copy/Paste, Paste and Match Style, Delete, Select All, mac Substitutions/Speech.
  * View: Actual Size / Zoom In / Zoom Out (custom zoom), Force Reload (no accelerator), Toggle DevTools (Ctrl+Shift+I / Alt+Cmd+I), Toggle Fullscreen.
  * Window: Minimize, Zoom (mac), `tab-management` anchor, Always on Top, Bring All to Front.
  * Help: Open Help, localized Homepage / Community / Help Center.
* **Merge protocol**: the renderer sends a template where items may carry `appCommand: "<command id>"`, `before: ["<anchor id>"]`, `registerAccelerator: false`, `accelerator` (derived from the user's hotkeys, app.js:42800-42815), `role`, and `type: radio/checkbox`. Main merges top-level menus by id or label and inserts sub-items before the anchor ids. `&Window`/`&Help` are always moved to the end. Each `appCommand` becomes a click that runs `app.commands.executeCommandById(...)` in the window's renderer, **but only if the click was not triggered by a modified accelerator** (`Ct`, 4437). Hotkeys are handled by the renderer keymap, so the menu shows accelerators but would otherwise double-fire. Commands that are not registered are hidden by the renderer.
* `useNativeMenu` (`nativeMenus` vault config) makes the renderer build context menus with `remote.Menu.buildFromTemplate` (app.js:42148-42160) instead of DOM menus.
* **No tray, no dock menu, no jump-list tasks** (**observed** absence). Dock icon = custom icon if set.

### 12. Spellcheck
* `spellcheck: true` on vault windows. Languages are set from the renderer via `remote.getCurrentWebContents().session.setSpellCheckerLanguages`, filtered by `availableSpellCheckerLanguages`, default `[app.getLocale()]`. On macOS the system checker is used (app.js:36751-36760; settings strings main.js:781-787). The user dictionary is listed with `listWordsInSpellCheckerDictionary` (app.js:142994).
* The native menu `uo` offers up to 5 `dictionarySuggestions` or "No suggestion", plus "Add to Dictionary" (`session.addWordToSpellCheckerDictionary`), above the edit items. It offers "Look up '<sel>'" on macOS (selection truncated to 40 chars, `showDefinitionForSelection`) (3890-3934).

### 13. `@electron/remote` usage (renderer)
Initialised in the boot loader and enabled per window and popout via `remote.enable(webContents)` (`te`, 4196-4204). `window.electron.remote` falls back to `require("@electron/remote")` (app.js:96474-96477). **Observed call sites** (`grep remote.` in app.js):
* `getCurrentWebContents()` (19 sites): zoom level, cut/copy/paste, `debugger` (CLI dev), session spellcheck.
* `webContents.fromId` (3): context-menu target, web viewer guest.
* `Menu.buildFromTemplate` (3): native menus.
* `getCurrentWindow()`: `window.electronWindow` for minimise/maximise/close in the custom title bar, `setVibrancy`, `setTrafficLightPosition`/`setWindowButtonPosition`, `setMinimumSize`, `isFocused`.
* `clipboard`: used only for Electron ≥ 40. Below that, `electron.clipboard` is used directly (app.js:36765). Also `readImage` for paste.
* `dialog.showOpenDialogSync/showSaveDialog`, `shell.showItemInFolder`, `session.fromPartition` (clear web data).
* `safeStorage`: desktop secret store, ciphertext base64 in the vault-scoped localStorage key `<vaultId>-secrets-encrypted` (written through `app.saveLocalStorage`, app.js:146196). It falls back to plaintext JSON when encryption is unavailable (app.js:103528-103594).
* `systemPreferences.getUserDefault("AppleActionOnDoubleClick")` (title-bar double click) and `getMediaAccessStatus("microphone")`.
* `nativeTheme.shouldUseDarkColors` / `updated` listener, `app.getLocale/getVersion/getPreferredSystemLanguages`.

Every synchronous remote call is a blocking IPC round-trip, and remote hands main-process objects to all plugin code. The API-freeze trick in section 7 is the mitigation for the latter (**inferred**).

### 14. Native addons (`resources/app.asar.unpacked/node_modules`)
* **`btime`** (N-API, node-addon-api 6.1.0): `btime(path, msSinceEpoch)` **sets a file's creation (birth) time** on Windows and macOS and is a no-op on Linux. Path is null-byte checked and the value is validated as ≤ 2^48-1. The renderer injects it into the FileSystemAdapter (app.js:146367-146369). The adapter calls it when a write carries `ctime`, then sets mtime with `utimes` (app.js:24680). **Inferred**: it preserves note created-dates across Sync, file recovery restores and imports.
* **`get-fonts`**: `getFonts()` returns installed font family names (CoreText on macOS per the shipped `fontsMac.mm`; on Windows the `binding.node` imports `DWriteCreateFactory` from `DWrite.dll`, so it enumerates through DirectWrite, **observed** import). Used by the Appearance font pickers (app.js:141862). The mobile equivalent is `App.getFonts()` (141876).

### 15. macOS Quick Look support (main.js:3750-3810, x/obsidian/quicklook/)
On macOS (not MAS) with installer > 1.14.2, main copies `quicklook/index.html`, `quicklook.js`, `quicklook.css`, `lib/prism.min.js`, `lib/mathjax`, `lib/mermaid.min.js` and `public/` out of the asar into `userData/quicklook/<sha256(asarPath:inode:size:mtimeMs)>/`. It extracts into a `.extract-*` temp dir and renames, then atomically swaps a `current` symlink via `current-<pid>` + rename, and GCs other 64-hex or `.extract-*` dirs. The page's CSP allows only the `obsidian-preview:` scheme (quicklook/index.html). **Inferred**: a native Quick Look extension inside the .app (not in this Windows install) renders `.md` previews in a WKWebView with an `obsidian-preview:` scheme handler pointing at `quicklook/current`. Hashing on inode, size and mtime makes re-extraction happen only after an update.

### 16. Enterprise policy ("Obsidian Work")
* Path: Windows `C:\Program Files\<Obsidian|ObsidianWork>\policy.json`, macOS `/Library/Application Support/<…>/policy.json`, Linux `/etc/<app.name>/policy.json`. The folder is `ObsidianWork` when `app.name === "obsidian-work"` (main.js:3944-3952). These are admin-writable locations, so a user cannot loosen policy (**inferred**).
* Read only in work mode (`app.name === "obsidian-work"` or `obsidian.json.isWork === true`). Work mode also **disables auto-update** (main.js:4367, 4380).
* Schema (main.js:29-73):

| key | type | meaning (renderer consumer) |
|---|---|---|
| `plugins` | `true` or non-empty `string[]` of allowed plugin ids, else false | community plugins allow-list; false forces restricted mode (app.js:106209, 109477, 142386-142415; CLI 58974-59039) |
| `themes` | `true` or `string[]` theme names | theme allow-list (app.js:45641, 45947, 105747-105765, 142019) |
| `snippets` | bool (`=== true`) | CSS snippets (app.js:45663, 142095) |
| `sync` | bool | load the Sync core plugin; starter sign-in (app.js:145086, starter) |
| `publish` | bool | load the Publish core plugin (app.js:145085) |
| `webViewer` | bool | load the Web Viewer core plugin (app.js:145088) |
| `devTools` | bool | `webPreferences.devTools` for every window |
| `insider` | bool | allow the insider/beta channel (app.js:132027; main 4377) |

* Fail-closed: a missing or malformed file gives all false. A normal build sends all true (`Bt`). The renderer default before the IPC answer is also all true (app.js:43363-43372), and the value is frozen once (app.js:146276).

### 17. Electron fuses (REA `ev_9986ca493fefaa899dfd8144b583fc23d681285c9ce098d23ae6e6f68d5b9b1a`) and their implications
| Fuse | State | Implication |
|---|---|---|
| RunAsNode | off | `ELECTRON_RUN_AS_NODE=1 Obsidian.exe script.js` cannot be used as a signed node interpreter (LOLBin abuse) |
| EnableCookieEncryption | on | Cookie DBs (incl. `Partitions/vault-*`, where web viewer logins live) are encrypted with the OS key (DPAPI / Keychain) |
| EnableNodeOptionsEnvironmentVariable | off | `NODE_OPTIONS=--require …` injection into main is blocked |
| EnableNodeCliInspectArguments | off | `--inspect` on main is blocked. Renderer DevTools are still available (policy) and the CLI offers `devtools`/`dev:cdp`/`eval` |
| EnableEmbeddedAsarIntegrityValidation | off | `app.asar` (the boot loader) is not hash-checked by Electron |
| OnlyLoadAppFromAsar | off | Electron would also load a `resources/app/` folder or `default_app` |
| GrantFileProtocolExtraPrivileges | on (default) | `file://` pages get legacy privileges. Obsidian never loads `file://` pages (everything is `app://`), so turning it off would cost nothing (**inferred**) |

**Inferred overall**: integrity of the code that runs is anchored only in file-system permissions. The install is per-user (`%LOCALAPPDATA%\Programs\Obsidian`) and stage 2 is loaded from `%APPDATA%\obsidian\obsidian-*.asar` without re-verifying the RSA signature at load time. The drag-and-drop `copy-asar` path deliberately installs unsigned builds. ASAR-integrity fuses would not stop a same-user attacker anyway in this layout, and the design accepts that. The hot-swap updater needs a writable package location.

### 18. Mobile parity (Capacitor)
**Observed**: the same `app.js` contains the Capacitor runtime (`window.Capacitor`, `registerPlugin`, app.js:9578-9645) and binds these plugins: `App`, `Browser`, `Clipboard`, `Filesystem`, `SplashScreen`, `StatusBar`, `Device`, `KeepAwake`, `Keyboard`, `Haptics`, `InAppReview`, `Preferences` (app.js:36776-36777), and `SecureStorage` with web/iOS/Android implementations (app.js:102539). `App` and `Filesystem` are **Obsidian-specific native plugins**, not the stock ones. `App` exposes `requestUrl`, `getFonts`, `takeScreenshot`, `setQuickActions`, `setBackgroundColor`, `minimizeApp`, `isInstalledFromStore` and lifecycle listeners. `Filesystem` exposes `watchAndStatAll`, `verifyIcloud`, `choose`, `trash`, `getUri`, `stopWatch`, …. `CapacitorAdapter` (`BA`, app.js:47140-48029) is the mobile vault adapter, the counterpart of the desktop `nc` FileSystemAdapter built in the renderer bootstrap (app.js:146365-146372).

**Inferred**: Obsidian is one renderer codebase with platform adapters, chosen at runtime by `Qy.isDesktopApp`/`isMobileApp` flags. Each thing the desktop main process provides has a mobile native-plugin twin:

| Desktop (main / Electron) | Mobile (Capacitor) |
|---|---|
| IPC `request-url` | `App.requestUrl` |
| `get-fonts` addon | `App.getFonts` |
| `remote.safeStorage` | `SecureStorage` plugin |
| IPC `trash` / `shell.trashItem` | `Filesystem.trash` |
| `shell.openExternal` | `Browser` |
| `fs.watch` in renderer | `Filesystem.watchAndStatAll` |

This is why the main process stays thin and why so much of it is "settings that live outside the vault".

---

## Data formats & on-disk files

All files live under `userData` = `%APPDATA%\obsidian` (Windows), `~/Library/Application Support/obsidian` (macOS) or `~/.config/obsidian` (Linux), except where noted.

| File | Writer | Format |
|---|---|---|
| `obsidian.json` | main `_()` (writeFileSync, compact JSON, no atomic rename) | see table below |
| `<vaultId>.json` | main on window close | `{x, y, width, height, isMaximized, devTools, zoom}` (bounds only from the normal state) |
| `id` | boot loader | 32 hex chars (16 random bytes) |
| `obsidian.log` | boot loader | append-only `YYYY-MM-DD HH:MM:SS <message>` in UTC, no rotation |
| `obsidian-X.Y.Z.asar` | updater / `copy-asar` | full stage-2 package, ungzipped |
| `obsidian.asar.tmp` | updater | in-flight download, removed on the next check |
| `adblock/<list basename>` | main `we` | raw filter list text, mtime = freshness |
| `Partitions/vault-<id>/` | Chromium | web viewer / canvas webview profile (`persist:vault-<id>`) |
| `icon.<ext>` | `set-icon` | custom app icon bytes |
| `Obsidian Sandbox/` | `sandbox` | fresh copy of `<asar>/sandbox` each time |
| `quicklook/<sha256>/`, `quicklook/current` symlink | macOS only | extracted preview resources |
| Local Storage / IndexedDB | renderer | vault-scoped keys/DBs prefixed `<vaultId>-` (deleted on vault removal; `<id>-browser` DBs GC'd by the starter) |
| `C:\Program Files\Obsidian[Work]\policy.json` | admin | enterprise policy (section 16) |
| CLI endpoint | main | `\\.\pipe\obsidian-cli-<user>` / `~/.obsidian-cli.sock` / `$XDG_RUNTIME_DIR/.obsidian-cli.sock` |

**`obsidian.json` fields** (main.js; only `vaults` existed on this machine):

| Key | Type | Default | Set by |
|---|---|---|---|
| `vaults` | `{ [id16hex]: { path: string, ts: epoch ms, open?: true } }` | `{}` | vault-open/move/remove, window close |
| `language` | locale code | OS locale | `set-language` |
| `frame` | `"hidden"`/`"custom"`/`"native"` | absent (= hidden) | `frame` |
| `updateDisabled` | `true` | absent | `disable-update` |
| `disableGpu` | `true` | absent | `disable-gpu` |
| `insider` | `true` | absent | `insider-build` (policy-gated; cleared at boot if the policy forbids it) |
| `cli` | `true` | absent (CLI off) | `cli` |
| `adblock` | `string[]` URLs | EasyList + EasyPrivacy | `adblock-lists` |
| `adblockFrequency` | number (days, 0 = never) | 4 | `adblock-frequency` |
| `openSchemes` | `{ [scheme]: true }` | absent | external-link dialog checkbox |
| `icon` | filename in userData | absent | `set-icon` |
| `isWork` | `true` | absent | manual / deployment (turns on policy + disables updates) |

**CLI wire protocol**: client to server is one UTF-8 JSON line `{"argv":string[],"tty":boolean,"cwd":string}` followed by `\n`, then (TTY mode) raw keystroke bytes. Server to client is UTF-8 text (one-shot: the result plus a newline; TUI: ANSI-rendered screen), then the server ends the stream. There is no status code: the client exits 0 on a clean end and errors are text.

**Update manifest** (`desktop-releases.json`): `{ latestVersion, minimumVersion, downloadUrl, hash (b64 SHA-256 of .gz), signature (b64 RSA-SHA256 of .gz), beta?: {same} }`.

---

## Rebuild notes (for a Tauri 2 app)

**Essential ideas worth copying**
1. **Two-stage boot with an OTA frontend bundle.** Ship the shell (binary) and the app bundle separately, and update the bundle often without a reinstall. Gate on `minimumVersion` for shell-breaking changes. In Tauri, serve the frontend from `appDataDir/bundles/<ver>/` through a custom URI-scheme protocol instead of the embedded assets, and fall back to the embedded bundle. **Improve on Obsidian**: verify the signature at load time (e.g. a minisign/ed25519 manifest of file hashes), not only at download. `tauri-plugin-updater` covers shell updates.
2. **One window per workspace/vault with a per-vault state file**, and validate saved bounds against current monitors before use. `tauri-plugin-window-state` exists, but Obsidian's "remember which vaults were open at quit" (the `open` flag is cleared on a user close, kept on an app quit) is a nice touch to replicate.
3. **Renderer mailbox pattern** (`window[NAME]` = function or queued payload) for launch-time actions, so URIs and files that arrive before the UI is ready are not lost. In Tauri: emit an event plus keep a "pending actions" queue in Rust that the frontend drains on ready.
4. **Single-instance + CLI over a local socket.** `tauri-plugin-single-instance` gives argv and cwd of the second launch (enough for file associations and deep links). For a real interactive CLI, run a local socket (`interprocess` crate: named pipe or UDS) with a JSON header line and then streaming. On Windows add a tiny **console-subsystem shim** (`yourapp.com` next to `yourapp.exe`) for terminal I/O. Add a per-session random token file (0600 / user-only ACL) if commands can execute code. Obsidian relies purely on OS ACLs.
5. **Command registry shared by CLI, palette and plugins**, with a `name:flag` shorthand, `k=v` flags, a declared flag schema (`value` placeholders, enumerations `a|b|c`, `required`), "did you mean" suggestions, and machine formats (`--json/--tsv/--csv`). Completions are served from the same registry (`__completions`). This is cheap and gives a great CLI.
6. **Custom file-serving protocol**: one host for app assets with path containment (use `Path::starts_with` on canonical components, not string prefix), and a separate unguessable per-launch host for user files. Support HTTP Range (media, PDF). Cache-bust with `?mtime`. **Restrict which origins may load it**. Tauri's `asset:` protocol has scope config. A custom `register_uri_scheme_protocol` lets you add Range and an origin check yourself.
7. **External-link router**: a scheme allow-list with a "always allow this scheme" memory, a warning for remote/UNC paths, and a warning plus explicit "Run" for executables. Prefer OS APIs for the executable check, or a fuller extension list (`.lnk .hta .cpl .jar .reg .msc …`).
8. **Fail-closed enterprise policy file** in an admin-only location, read once and frozen. A small schema with allow-lists (`true` | `[ids]` | false).
9. **Freeze security-relevant APIs** once configured, if plugins share the privileged context. In Tauri the equivalent is the capability/permission system: give plugin-reachable windows the minimum command set, and do not expose a generic "remote" bridge.

**Incidental / do differently**
* Avoid `sendSync` IPC and `@electron/remote`-style blocking calls. Make every Tauri command async.
* `nodeIntegration` + no isolation + remote is the root of Obsidian's plugin power **and** its attack surface. A Tauri rebuild should define a narrow typed command API (fs ops scoped to the vault, `requestUrl`, trash, secrets via the `keyring` crate, fonts via `font-kit`, file birth time via a small Rust fn with `SetFileTime` / `setattrlist`).
* The ad-block matcher is a toy (no `$options`, no `@@`, no cosmetic rules, linear scan). Use `adblock-rust` (Brave) if you need one. Tauri 2 multiwebview / child webviews plus platform request interception would be needed. Header rewriting (stripping XFO/CSP for iframes) is easy in Electron and **hard cross-platform in Tauri** (WebView2 `WebResourceRequested` yes, WKWebView/WebKitGTK limited), so design embeds around that limitation.
* `Math.random` vault ids: use UUIDv4/ULID.
* The `obsidian.json` write is non-atomic (`writeFileSync` straight over the file). Use write-temp-then-rename.
* Log rotation: Obsidian never rotates `obsidian.log`. Use `tauri-plugin-log` with rotation.
* The `terms` string tripwire is not a security mechanism. Skip it.

**Tauri mapping cheat-sheet**

| Obsidian main feature | Tauri 2 equivalent |
|---|---|
| `requestSingleInstanceLock` + argv over pipe | `tauri-plugin-single-instance` (+ `interprocess` for streaming CLI) |
| `setAsDefaultProtocolClient("obsidian")`, `open-url` | `tauri-plugin-deep-link` |
| `app://` protocol | `register_asynchronous_uri_scheme_protocol` / `asset:` + scope |
| `BrowserWindow` per vault + bounds JSON | `WebviewWindowBuilder` + own state file or `tauri-plugin-window-state` |
| `dialog.*`, `shell.openExternal/openPath/trashItem` | `tauri-plugin-dialog`, `tauri-plugin-opener`, `trash` crate |
| `safeStorage` | `keyring` crate / `tauri-plugin-stronghold` |
| `net.request` (`requestUrl`) | `tauri-plugin-http` (reqwest) with scope |
| app menu with command ids | `tauri::menu` with `MenuItem` ids then emit to frontend |
| Spellcheck context menu | WebView-native (WebView2 has it; WKWebView native; GTK varies) |
| `<webview>` web viewer | child `Webview` (multiwebview, `unstable` feature) |
| `printToPDF` | WebView2 `PrintToPdf` via `with_webview`; no portable API (**unknown** per platform) |

---

## Open questions

1. **Who uses the Windows `session=<pipe> [tty]` second-instance path?** Obsidian.com is client-only per its imports. Resolve by: strings on older installers' `Obsidian.com`, or a runtime probe with Process Monitor / pipe listing while running `obsidian` from a terminal with and without Obsidian running.
2. **`obsidian-cli` on macOS/Linux**: is it a shell script, a symlink target, or a native client like `Obsidian.com`? It is absent from the Windows install. Resolve by inspecting a mac/Linux package.
3. **MIME types on `app://`**: in this build the `registerFileProtocol` branch runs, so Chromium's file loader should pick the MIME type from the extension (**inferred**). Confirm that `.mjs`/`.wasm`/`.svg` load with the right type with a runtime probe (DevTools Network tab inside Obsidian). The `protocol.handle` fallback sets no `Content-Type` at all.
4. **Does `protocol.handle` accept a Node `fs.ReadStream` as the `Response` body?** This only matters for the fallback branch, which does not run in Electron 43.7.7. Resolve with Electron docs/runtime if a later Electron drops `registerFileProtocol`.
5. **Named-pipe DACL actually applied** by libuv for `\\.\pipe\obsidian-cli-<user>`. Resolve with `accesschk \pipe\obsidian-cli-*` or PowerShell `Get-Acl` on the pipe at runtime.
6. **Windows `get-fonts` implementation**: largely resolved. The binary imports `DWriteCreateFactory` (DirectWrite). Which font collection and family-name locale it uses still needs disassembly (REA `inspect_native_api`).
7. **Quick Look extension** (native side, macOS bundle) and its `obsidian-preview:` scheme handler. These are not in this Windows install.
8. **Updater ping semantics**: what `releases.obsidian.md/desktop?id=…` records server-side is unknown (counting installs is the likely purpose). It is sent on every check unless updates are disabled.
9. **`will-download`**: confirm at runtime that web viewer downloads show Electron's default save dialog (no handler is registered).
