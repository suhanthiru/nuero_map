# Plugin system & extensibility (Obsidian 1.14.4)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian's extensibility is three cooperating layers inside the single renderer bundle. (1) **Community plugins**: a manager (`U3`, exposed as `app.plugins`) finds `.obsidian/plugins/<folder>/manifest.json`, reads `main.js` as text, and evaluates it with an **indirect `window.eval`** inside a CommonJS-style wrapper `(require, module, exports)`. The `require` it passes is a small resolver. It maps `obsidian`, the `@codemirror/*` packages and the `@lezer/*` packages to the bundle's own module objects. Anything else falls through to Electron's real Node `window.require`, so every plugin has full Node, Electron and `@electron/remote` access, with **no sandbox and no permission model**. (2) **Core plugins**: about 30 built-in feature modules, each a plain object (`id/name/description/defaultOn/init/onEnable/onDisable`) wrapped by `Q3` and registered in `Z3` (`app.internalPlugins`). Their on/off state is persisted in `core-plugins.json`. (3) **Themes and CSS snippets** (`app.customCss`, class `oD`): `<style>` elements inserted around the plugin styles, in a fixed order.

Trust is handled per vault: "Restricted mode" is a localStorage flag, and the first open of a vault that contains plugins shows a trust modal. An optional enterprise `policy.json` can allow-list plugins and themes. A remote deprecation list disables known-bad plugin versions. The plugin directory, stats and deprecation list are fetched from the `obsidianmd/obsidian-releases` GitHub repo. Each plugin's files come from that plugin's own GitHub release assets, with **no integrity check**. Finally, `obsidian://` URIs are parsed in the main process. They are injected into the vault window as `window.OBS_ACT` and dispatched through a handler map (`C3`), which plugins can extend.

---

## Where it lives

| Minified id | Public / inferred name | Role | Lines (pretty/app.js unless noted) |
|---|---|---|---|
| `d` (module object) | `require("obsidian")` | 159-name export map (the plugin API surface) | 12755-12917 |
| `e,t,i,r,o,a,s,l,c,h,p` | `@codemirror/state, view, @lezer/common, highlight, language, commands, search, autocomplete, @lezer/lr, collab, lint` | Module namespace objects handed to plugins | 12346-12752 |
| `u` | (Publish API module, inferred) | 14-name subset with `Publish` (dJ); used for Publish-site JS, not for plugins | 12711-12727 |
| `N3` | require map | `{obsidian, @codemirror/*, @lezer/*}` → module objects | 108898-108912 |
| `V3` | deprecated require map | Old CM6 package names (`@codemirror/fold`, `/gutter`, `/history`...) → new module + console error | 108912-108924 |
| `O3,F3,R3,B3` | CM6 compat shims | `Tree.iterate` old-signature adapter; fake `PluginField`; `Prec.override/extend/fallback` aliases | 108873-108897 |
| `H3` | `Plugin` | Base class of every community plugin | 108925-109178 |
| `z3` | `PluginSettingTab` | Settings tab bound to `plugin.settings` | 109178-109204 |
| `q3` | (core plugin setting tab) | Same as `z3`, bound to `instance.options` | 109204-109229 |
| `W3`, `j3` | sourcemap regex / `"\n/* nosourcemap */"` marker | Strip inline sourcemaps from `main.js` | 109229 |
| `U3` | `PluginManager` (`app.plugins`) | Community plugin discovery, load, enable, install, update, deprecation | 109230-109880 |
| `_3` | Trust-author modal | "Do you trust the author of this vault?" | 109880-109915 |
| `G3, K3, Y3, X3` | i18n ns / deprecation URL / deprecation table / sort labels | | 109915-109920 |
| `Q3` | `InternalPlugin` wrapper | Lifecycle + registration buffer for one core plugin | 109920-110129 |
| `$3` | legacy core-plugin id list | Used only when migrating the old array-format `core-plugins.json` | 110129 |
| `Z3` | `InternalPlugins` (`app.internalPlugins`) | Core plugin registry, `core-plugins.json` | 110129-110234 |
| `bM` | `Component` | `load/unload/addChild/register*`, the cleanup backbone | 39039-39109 |
| `F4` | `SettingTab` | Declarative settings (`getSettingDefinitions`) and legacy `display()` | 103162-103242 |
| `n3` | `ViewRegistry` | View types and file-extension → view type | 104042-104120 |
| `u3` → `h3` | popout-capable modal → community browser base | Sidebar grid, search, sort, details pane | 104411-104853 |
| `g3` | Community **plugin** browser | `loadItems/updateItems/showItem` (install/enable/uninstall) | 105190-105512 |
| `m3` | Donate modal | `fundingUrl` rendering | 105512-105553 |
| `w3` | Community **theme** browser | Theme cards, screenshots, mode filter, updates | 105553-106048 |
| `k3` | alias of `w3` (`const k3 = w3`) | Theme browser opened by `show-theme` | 106049 (used 106219) |
| `C3` | `ObsidianProtocolHandler` (`workspace.protocolHandler`) | URI action registry and default handlers | 106050-106279 |
| `A3` | paneType sanitizer | Only `true/false/"tab"/"split"/"window"` pass | 106544-106546 |
| `oD` | `CustomCSS` (`app.customCss`) | Themes, snippets, theme install/update | 45482-46105 |
| `iD`, `rD`, `nD` | theme list / theme stats fetchers | `community-css-themes.json`, `releases.obsidian.md/stats/theme` | 45467-45482 |
| `gF`, `yF`, `vF`, `mF` | plugin list / stats fetchers | `community-plugins.json`, `community-plugin-stats.json` | 57558-57573 |
| `pF, dF, fF` | `"manifest.json"`, `"main.js"`, `"styles.css"` | File-name constants | 57558 |
| `VS, HS, zS, BS, NS` | GitHub URL builders | raw / repo / release-asset URLs | 42847-42858 |
| `QS`, `GS`, `lw` | fetch wrapper with proxy fallback; `requestUrl` core; IPC bridge | | 43029-43055, 42940-42981, 36689-36705 |
| `UT` | memoized async fetch (TTL cache) | 5 min cache, in-flight dedupe | 45312-45345 |
| `JS`, `ex` | version parse / "a < b" compare | Dot-separated integers | 43075-43098 |
| `Rx` | "latest compatible version" resolver | `minAppVersion` and `versions.json` | 43287-43313 |
| `Nx` | README post-processor | Rewrites relative links/images to GitHub | 43315-43358 |
| `Vx`, `Hx` | policy check / frozen policy object | `plugins/themes` may be `true` or an allow-list | 43360-43372, 146276 |
| `goe`, `yoe` | `apiVersion`, `requireApiVersion` | | 144594-144601 |
| `Kre` | Community plugins settings tab (`id: "community-plugins"`) | Restricted-mode banner, installed list, updates | 142355-142779 |
| (unnamed) | Core plugins settings tab | Toggle list, hides `hiddenFromList` | ~143695-143760 |
| `NF` (app.cli) | CLI command registry | Plugins can `registerCliHandler`; `plugin:*` CLI commands | 58413-60483 (handlers 58626-60420) |
| main.js `Ze`, `no`, `He`, `Lt`, `Xe` | URI parse/route in main process | | main.js:5481-5568, 3813-3826 |
| main.js `$o`, `qo`, `Fo`, `tt`, `Bt` | Enterprise `policy.json` | | main.js:29-73, 3944-3959, 4367 |

---

## How it works

### 1. Startup order (where plugins sit in boot)

Observed in the App's init state machine (app.js:145005-145300):

1. Vault config is set up, then `new L3` (Workspace), FileManager, MetadataCache, and so on are constructed. `app.internalPlugins = new Z3(app)` and `app.plugins = new U3(app)` are constructed at app.js:145017-145018.
2. `customCss.load()` runs (theme + snippets) at app.js:145032.
3. metadataTypeManager, secretStorage and hotkeyManager are loaded, then `registerCommands()`.
4. **Core plugins**: each core plugin object is instantiated and passed to `internalPlugins.loadPlugin(new X)` (app.js:145059-145088). This wraps it in `Q3` and calls `instance.init(app, wrapper)`. Sync and Publish load only if policy allows, and the web viewer only on desktop with policy allowing. Then `internalPlugins.enable()` reads `core-plugins.json` and enables the ones that are on, all in parallel with `Promise.all`.
5. Mobile-only early leaf restore (skipped on desktop).
6. **Community plugins**: `await app.plugins.initialize()` at app.js:145236. Plugins load **sequentially** in `community-plugins.json` order.
7. `vault.load()` → `metadataCache.initialize()` → `workspace.loadLayout()` → opening behaviour. `layout-ready` fires, then queued `onLayoutReady` callbacks run one per macrotask (each preceded by a `sleep(0)`). Errors are attributed to the plugin that registered the callback (`pluginId: app.plugins.loadingPluginId`) and shown as a Notice (app.js:107537-107572, 107668-107670).
8. `workspace.registerUriHook()` (the URI dispatcher goes live) → `registerOpenFileHandler()` → `cli.init()` (app.js:145292-145294).

Consequence (inferred): a plugin's `onload` runs **before the vault file tree is loaded and before the layout exists**. That is why `workspace.onLayoutReady` exists and why plugin views are re-hydrated afterwards. URI actions arrive only after all plugins are loaded, so plugin-registered URI actions work even on a cold start.

### 2. Manifest discovery and validation (observed, app.js:109262-109340)

- Folder: `getPluginFolder()` returns `<configDir>/plugins` (configDir defaults to `.obsidian`).
- `loadManifests()` lists the **folders** in that directory. For each `<folder>/manifest.json` that exists, it parses JSON. A manifest that fails to parse is logged with `console.error` and skipped.
- Validation is minimal: a manifest without an `id` is ignored. No schema check, and no `minAppVersion` check at load or enable time (minAppVersion is only consulted when choosing a version to install; see §8).
- The manager adds `dir = <folder path>`. Manifests are keyed by `manifest.id`, **not** the folder name.
- Author scrub: if `author` is missing or equals `"obsidian"` (any case), it is set to `""`. Inferred purpose: stop plugins from presenting themselves as written by Obsidian.
- `loadManifest(dir)` re-reads one folder after install.

Manifest fields actually read by code:

| Field | Used for | Evidence |
|---|---|---|
| `id` | key, command/ribbon/view prefix, data path | 109292, 108953-108975 |
| `name` | command name prefix `"<name>: "`, UI, CLI help prefix | 108971, 109080 |
| `version` | update compare, deprecation match, hardcoded blocks | 109478-109486, 109706 |
| `minAppVersion` | choosing an installable version (`Rx`) | 43293 |
| `isDesktopOnly` | refuse enable on mobile; "unsupported" in browser | 109493, 105398 |
| `author`, `authorUrl` | UI | 105388 |
| `description` | UI, settings search | 142501 |
| `fundingUrl` | Donate button/menu (string or `{label: url}` map) | 105485, 142720 |
| `dir` (synthesized) | file paths | 109292 |

### 3. Loading and evaluating `main.js`: exact mechanism (observed, app.js:109341-109370)

`loadPlugin(id, userEnabled=false)`:

1. The call is a no-op unless community plugins are allowed (`isEnabled()`, see §7). It returns the existing instance if one is already loaded.
2. It reads `<dir>/main.js` as text through the vault adapter.
3. **Sourcemap stripping**: unless debug mode is on (`lI`, set by `app.debugMode(true)` and persisted as `<appId>-DebugMode`), any inline `//# sourceMappingURL=data:application/json;base64,...` comments (regex `W3`) are removed. Files that already end with the marker `\n/* nosourcemap */` (`j3`) skip the regex scan. The installer strips sourcemaps and appends the marker at download time, so the scan at startup is a cheap check. Inferred purpose: memory and parse time.
4. The require resolver closure (`s`) works as follows. For a name in `V3` (deprecated CM6 packages) it logs `[CM6][<id>] Using a deprecated package` and returns the mapped new module. For a name in `N3` it returns the bundle module object. If the body has class `emulate-mobile` (desktop "mobile emulation"), it shows the Notice `<id> attempted to load NodeJS package: "<name>"`, logs `[<id>] Attempting to load NodeJS package: "<name>"` with `console.error`, then returns `null`. Otherwise it returns `window.require(name)` through `iw`, which is the real Node require on desktop and `undefined` on mobile.
5. **Evaluation**: the code is wrapped as `(function anonymous(require,module,exports){<code>\n})\n//# sourceURL=plugin:<encodeURIComponent(id)>` and passed to **`window.eval`**. This is an indirect global eval, so the code runs in global scope rather than in a `new Function` or `<script>`. The returned function is called with `(resolver, module={exports:{}}, exports)`. The `sourceURL` makes DevTools show the plugin as `plugin:<id>`.
6. The export is `module.exports.default || module.exports`. If nothing is exported, loading throws `"Failed to load plugin <id>. No exports detected."`.
7. `new Export(app, manifest)`. The result **must be `instanceof Plugin` (H3)**, otherwise loading throws. This works because `require("obsidian").Plugin` *is* H3.
8. `plugins[id] = instance`, then `await instance.load()`, then `await instance.loadCSS()`, then `instance.onUserEnable()` if the user enabled it (not at startup).

There is no module cache, so every enable re-reads and re-evaluates `main.js`; that is how the CLI `plugin:reload` and the community "hot reload" approach work. Relative requires inside `main.js` are not supported; plugins are expected to be single-file bundles (inferred). A plugin's `require("electron")` returns the Electron module that the bundle already patched with `.remote = require("@electron/remote")` (app.js:96474-96480).

Modules a plugin can `require` and get the in-bundle instance (N3, app.js:108898-108911):

| Specifier | Module object | # exports |
|---|---|---|
| `obsidian` | `d` | 159 |
| `@codemirror/state` and `@codemirror/text` | `e` | 29 |
| `@codemirror/view` | `t` (+ injected `PluginField` shim) | 51 |
| `@codemirror/language` | `o` | 58 |
| `@codemirror/commands` | `a` | 115 |
| `@codemirror/search` | `s` | 19 |
| `@codemirror/autocomplete` | `l` | 30 |
| `@codemirror/lint` | `p` | 12 |
| `@codemirror/collab` | `h` | 6 |
| `@lezer/common` | `i` | 13 |
| `@lezer/lr` | `c` | 6 |
| `@lezer/highlight` | `r` | 8 |
| deprecated (V3, with console error) | `closebrackets`→autocomplete, `comment`/`history`→commands, `fold`/`highlight`/`matchbrackets`/`stream-parser`→language, `gutter`/`panel`/`rectangular-selection`/`tooltip`→view, `rangeset`→state | |
| anything else | Node `window.require` (desktop) or `undefined` (mobile) or `null` + Notice (emulated mobile) | |

Note: `@lezer/markdown` and `@codemirror/lang-*` are **not** shared, so plugins must bundle their own copies (observed by absence from N3).

**CM6 back-compat shims** (observed, 108873-108897):
- `Prec.override/extend/fallback` are aliased to `highest/high/lowest` (the `Te` object, inferred to be `Prec`).
- `Tree.prototype.iterate` is wrapped. If a plugin passes the old `enter(type, from, to)` style callbacks (detected by `fn.length > 1`), it logs `[CM6] tree.iterate has changed syntax` and adapts the call.
- The view module gets a fake `PluginField` whose `define/decorations/atomicRanges/scrollMargins` are all set to the same plain object `{from(){}}` (a no-op `from()`; they are not functions, so calling `PluginField.define()` would throw).

### 4. `apiVersion` / `requireApiVersion` (observed, 144594-144601)

- `apiVersion` (`goe`) defaults to the literal `"1.14.4"`. On desktop it is replaced at module init by `ipcRenderer.sendSync("version")`. The main process returns the `version` from `obsidian.asar/package.json` and falls back to `app.getVersion()` (main.js:4123-4132). So it is the **renderer bundle version**, not the installer version.
- `requireApiVersion(v)` returns true when `apiVersion >= v`; it is `!ex(apiVersion, v)`.
- `ex(a, b)` returns true when `a < b`. It parses both into integer arrays by splitting on `.` and `parseInt`-ing each part (a part `parseInt` cannot read, such as `beta`, makes the parse return null; trailing junk is ignored, so `3-beta` reads as 3) and compares lexicographically; a shorter array is the smaller one when the prefix is equal. If `b` is unparseable it returns false; if only `a` is unparseable it returns true. There is no semver pre-release handling (app.js:43075-43098).

### 5. The `Plugin` class (H3): every register/add method (observed, 108925-109178)

Construction: `(app, manifest)`, with fields `app`, `manifest`, `settingTab=null`, `_userDisabled=false`, `_lastDataModifiedTime=0`, `onConfigFileChange` (debounced 50 ms).

| Method | What it does | Cleanup registered via `this.register` |
|---|---|---|
| `load()` (override) | Sets `_loaded`, **awaits** `onload()`, then loads children. Component's version does not await `onload` before children. | – |
| `addRibbonIcon(icon, title, cb)` | `leftRibbon.addRibbonItemButton("<id>:<title>", ...)`; the title is part of the ribbon id | `removeRibbonAction` + detach |
| `addStatusBarItem()` | `statusBar.registerStatusBarItem()`, adds class `plugin-<id lowercased>`. The sanitising regex has no `g` flag, so only the first invalid char is replaced (quirk). | detach |
| `addCommand(cmd)` | **Mutates** the object: `id = "<pluginId>:<id>"`, `name = "<PluginName>: <name>"`, then `app.commands.addCommand`; returns it | `removeCommand(id)` |
| `removeCommand(localId)` | Removes `"<pluginId>:<localId>"` | – |
| `addSettingTab(tab)` | `app.setting.addSettingTab`, stores `this.settingTab` | remove tab, null it |
| `registerView(type, factory)` | `viewRegistry.registerView` (throws if the type exists) | unregister; **detach leaves only if `_userDisabled`**, so the layout survives app close and reload |
| `registerHoverLinkSource(id, info)` | `workspace.hoverLinkSources[id]` + event `hover-link-sources-changed` | delete |
| `registerExtensions(exts, viewType)` | `viewRegistry.registerExtensions`; throws if any extension is taken | unregister |
| `registerMarkdownPostProcessor(fn, sortOrder?)` | `MarkdownPreviewRenderer.registerPostProcessor` (list kept sorted by `sortOrder`), triggers `post-processor-change` | unregister + trigger |
| `registerMarkdownCodeBlockProcessor(lang, handler, sortOrder?)` | Builds a post-processor that finds `code.language-<lang>`, replaces the parent `<pre>` with `div.block-language-<lang>`, calls `handler(source, el, ctx)`, and adds an undocumented `ctx.replaceCode(newSource)`. Also registers `codeBlockPostProcessors[lang]` (throws if already registered), presumably for Live Preview. | both unregistered |
| `registerBasesView(id, registration)` | Only if the `bases` core plugin is enabled; returns `false` only when Bases is off. A duplicate id shows a Notice but still returns `true` and still registers the cleanup, so unloading the duplicate deregisters the original (observed, 109035-109039, 120015-120017) | `deregisterView` |
| `registerGlobalFunc(fn)` | Bases formula global function, keyed by lower-cased `fn.name` | `removeGlobal` |
| `registerInstanceFunc(ValueType, fn)` | Bases formula method on a Value type; lookup walks the prototype chain | `removeForType` |
| `registerCodeMirror(cb)` | **No-op** (CM5 legacy stub) | – |
| `registerEditorExtension(ext)` | Pushes onto `workspace.editorExtensions`, then `updateOptions()` | removed, re-config |
| `registerObsidianProtocolHandler(action, handler)` | `protocolHandler.register`; **throws if the action exists**, so built-ins cannot be overridden | unregister (only if same handler) |
| `registerEditorSuggest(suggest)` | `workspace.editorSuggest.addSuggest` | remove |
| `registerCliHandler(cmd, desc, flags, handler)` | `app.cli.registerHandler(cmd, "[<PluginName>]: " + desc, flags, handler)` | unregister |
| `loadData()` | `vault.readPluginData(dir)` reads `<dir>/data.json` (JSON or `null` on ENOENT). If the plugin defines `onExternalSettingsChange`, it also records the file mtime. | – |
| `saveData(obj)` | Records `_lastDataModifiedTime = Date.now()`, writes `data.json` (2-space JSON) with `{mtime: now}`. `writeJson` **swallows write errors** (app.js:50578-50597). | – |
| `loadCSS()` | If `<dir>/styles.css` exists, it is read raw into a new `<style>` inserted **before** `customCss.styleEl` (the theme element) | detach |
| `onUserEnable()` | Hook, called only when the user turns the plugin on (not at boot) | – |
| `onExternalSettingsChange()` (optional) | Called when `data.json` changes on disk with an mtime newer than our last write; then `settingTab.update()` | – |
| `getModifiedTime()` | `adapter.stat(<dir>/data.json).mtime`, or 0 | – |

Inherited from `Component` (`bM`, 39039-39109): `register(cb)`, `registerEvent(ref)` (calls `ref.e.offref(ref)`), `registerDomEvent(el, type, cb, opts)`, `registerScopeEvent(handler)`, `registerInterval(id)`, `addChild/removeChild`, `onload/onunload`.

**Cleanup order on unload** (observed): `unload()` clears `_loaded`, unloads children LIFO, runs every registered cleanup LIFO, and **only then** calls `onunload()`. `unload` is synchronous, so an async `onunload` is not awaited (inferred).

**External settings change detection** (observed, 109253-109261, 109157-109176): `U3` listens to vault `raw` events. When the path is `<configDir>/plugins/<X>/data.json` with `X` an enabled id, it calls `plugin.onConfigFileChange` (debounced 50 ms). That compares the on-disk mtime with `_lastDataModifiedTime`, which filters out our own writes. Because the check uses the folder name as the id, it only fires when the folder is named exactly like the id (inferred; the installer always uses `<id>` as the folder name).

**Commands**: `app.commands.addCommand` (115128-115147) skips `mobileOnly` commands on desktop. `editorCallback`/`editorCheckCallback` are wrapped into a `checkCallback` that requires an active editor. Preview mode is refused unless `allowPreview`. The wrapper refuses when focus is in the inline title or header title, and when focus is inside `.metadata-container` unless `allowProperties`. `showOnMobileToolbar` is also honoured. Default `hotkeys` are passed to `hotkeyManager.addDefaultHotkeys`.

**Editor extensions** (95538-95546, 108596-108600): each MarkdownView rebuilds a dynamic extension list on reconfigure. The list holds live preview, auto-pair brackets, vim and so on, with the **plugin extensions appended last** in one compartment (`n0.reconfigure`). `workspace.updateOptions()` reconfigures every open MarkdownView. A plugin can mutate its own registered array and call `updateOptions()` to swap extensions live (inferred from identity-based storage).

**View hot-swap** (106778-106801): on `view-registered` and `view-unregistered`, the workspace re-opens every leaf of that type (empty view, then `setViewState` again). So when a plugin loads late, or is re-enabled, its saved leaves come back to life automatically.

### 6. `PluginSettingTab` and declarative settings (observed, 109178-109204, 103162-103242)

- The constructor `(app, plugin)` sets `name = manifest.name` and `id = manifest.id`.
- New in this generation: `SettingTab.getSettingDefinitions()` returns definition objects such as `{name, desc, control: {type, key, defaultValue?, disabled?}, render?, aliases?, searchable?}` and `{type: "group" | "list", heading, items, search, extraButtons, emptyState}`.
- `renderTab()` uses the definitions when there are any, and falls back to the legacy imperative `display()` otherwise. Definitions feed the global settings search through `h4(items, tabName)`.
- `PluginSettingTab.getControlValue(key)` reads `this.plugin.settings[key]` and warns if `settings` is undefined. `setControlValue` writes it and calls `plugin.saveData(settings)`. The core-plugin variant `q3` uses `instance.options`.
- Control types handled by the renderer: `toggle, dropdown, text, textarea, number, file, folder, slider, color, secret` (103025-103160).

### 7. Restricted mode, the trust prompt, and enable/disable flow (observed)

State (109629-109668): `isEnabled()` is `localStorage["enable-plugin-" + appId] === "true"`. Note that this key is per vault id (`appId`), lives in the app's origin localStorage, and is **not** synced in the vault. `setEnable(bool)` writes it. Turning it off disables every loaded plugin; turning it on enables everything in `enabledPlugins`.

`initialize()` (109380-109466):
1. Read `community-plugins.json`; a non-array value becomes `[]`. The ids go into `enabledPlugins` (a `Set` in file order).
2. `loadManifests()`. If there are no manifests at all, stop.
3. If not enabled and the localStorage key is **absent** (first open of this vault on this device), call `customCss.globallyDisable()`, which unloads the theme and snippets, then open the **trust modal** `_3`. If the key is `"false"`, stay restricted silently.
4. Otherwise mark the timing `communityPlugins`, then for each id in order (if a manifest exists): start a **3000 ms timer**. If it fires, the loading screen shows "Plugin "X" is taking long to load." with a **Disable** button; that button removes the id, saves, and reloads the window. Then `await enablePlugin(id)` and clear the timer.
5. `requestSaveConfig()` (debounced 1000 ms; it rewrites the set, including ids whose manifests are missing).
6. Restore `lastUpdateCheck` from `<appId>-last-plugin-update-check`. Install auto-update triggers: desktop on window `focus`, mobile on Capacitor `resume`. They fire only if `autoCheckForUpdates` is set and more than **259 200 000 ms (3 days)** have passed.
7. `checkForDeprecations()` now and every **43 200 000 ms (12 h)**.

Trust modal `_3` (109880-109915) shows the strings "Do you trust the author of this vault?", "plugins of unknown origin might pose security risks", and the buttons "Browse vault in Restricted Mode" (cancel, initial focus) and "Trust author and enable plugins". The trust button runs `setEnable(true)` and opens Settings → Community plugins. **Closing the modal always calls `customCss.globallyEnable()`**. Choosing restricted mode does not write the key, so the prompt reappears on the next launch (inferred from code path). Theme and snippet CSS stay disabled while the prompt is visible; inferred purpose: untrusted CSS could exfiltrate data via `url()` or spoof the UI.

`enablePlugin(id, userEnabled)` (109470-109519) runs these gates in order:
1. Policy: `Vx(Hx.plugins, id)`. A policy of `true`, or an array containing the id, passes.
2. A manifest must exist.
3. Version blocks: listed in the remote deprecation table for this id/version; `cmdr` < 0.5.4; `obsidian-image-toolkit` < 1.4.3 (all three show the Notice "This version has been reported to cause issues"); `settings-search` always refused as incompatible; `better-pdf-plugin` 1.4.0 refused as nonfunctional (6 s Notice).
4. `isDesktopOnly` on a non-desktop app is refused silently.
5. `loadingPluginId = id`, then `loadPlugin`. On exception: Notice "Failed to load plugin", `console.error("Plugin failure: <id>", err)`, return false. In all cases a timing mark `communityPlugins.<id>` is recorded. The startup-timing view lists per-plugin load times (51483-51537, 131903-131932).
6. `didChange()` emits `changed`.

`enablePluginAndSave` adds the id to the set and saves; `disablePluginAndSave` removes it, saves, then `unloadPlugin(id, userDisabled=true)`. `unloadPlugin` sets `_userDisabled`, calls `unload()`, and deletes the instance. `uninstallPlugin` = disableAndSave + `adapter.rmdir(dir, recursive)` + forget the manifest and any pending update.

Remote deprecation (109670-109713): it fetches `community-plugin-deprecation.json`; failures are ignored and the old table is kept. Inferred shape: `{ "<pluginId>": ["<badVersion>", ...] }`, because the match is `table[id].contains(version)`. Any loaded plugin that matches is **disabled and saved**, with a persistent Notice (timeout 0).

### 8. Directory, stats, update check, install (observed)

Hosts and URLs (42847-42858, 57558-57573, 109915, 45467-45481):

| Purpose | URL |
|---|---|
| Plugin directory | `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json` |
| Plugin stats | `.../obsidian-releases/HEAD/community-plugin-stats.json` |
| Deprecation list | `.../obsidian-releases/HEAD/community-plugin-deprecation.json` |
| Theme directory | `.../obsidian-releases/HEAD/community-css-themes.json` |
| Theme stats | `https://releases.obsidian.md/stats/theme` (GET) |
| Theme download ping | `POST https://releases.obsidian.md/stats/theme/<name>/download`. Sent once per theme per device, tracked in localStorage `local-themes` (45953-45956). There is no equivalent plugin ping; plugin counts come from the stats JSON. |
| Plugin/theme latest manifest | `https://raw.githubusercontent.com/<repo>/HEAD/manifest.json` |
| Compatibility table | `https://raw.githubusercontent.com/<repo>/HEAD/versions.json` |
| README | `https://raw.githubusercontent.com/<repo>/HEAD/README.md` |
| Release assets | `https://github.com/<repo>/releases/download/<version>/<file>` |
| Community page | `https://community.obsidian.md/plugins/<id>` (142745) |
| Proxy fallback | Any GitHub/raw request that fails for any reason **other than an HTTP 404** (including network errors) is retried once as `https://releases.obsidian.md/proxy?url=<original>`, with the original URL appended unencoded (43029-43055) |

Caching: `gF`, `yF`, `iD` and `rD` are wrapped by `UT(fn, 300000, 60000)`, an in-flight-deduped promise with a **5-minute** success cache. A failure yields `null` and sets a 60 s expiry: if an earlier success is still held it is served for that minute, otherwise the next call retries (45312-45345).

Directory entry fields (from usage): plugins `{id, name, author, description, repo}`; themes `{name, author, repo, screenshot, modes[], legacy?}`, validated to be strings or arrays (105699). Plugin stats: `{<id>: {downloads, updated, ...}}`. Theme stats: `{<name>: {download}}`.

**Version selection `Rx(repo, latestManifest)`** (43287-43313):
1. If the app version is at least `latestManifest.minAppVersion` (or either is missing), use `latestManifest.version`.
2. Otherwise fetch `versions.json`, which maps `pluginVersion` → `minAppVersion`. Pick the highest plugin version whose minAppVersion is at or below the app version. If none qualifies, or the fetch fails, return `null`.

**`checkForUpdates(silent)`** (109812-109878):
- If offline, show a Notice (unless silent) and stop.
- Persist the check time, then fetch the directory.
- For every directory entry whose id is installed **and** whose installed manifest has a version: fetch the repo's HEAD `manifest.json` (its id must match), run `Rx`, and record an update when installed < target. The record is `updates[id] = {repo, version, manifest}`.
- The result Notice is "No updates found" or "N updates found"; for an automatic (silent) check it has a **View** button.
- Consequence: sideloaded plugins that are not in the directory never get update checks (observed: the loop walks the directory).

**`installPlugin(repo, version, manifest)`** (109714-109811):
1. Notice "Installing..." (`is-loading`).
2. Download release asset `manifest.json` as text. Its `id` must equal the expected id ("Plugin ID mismatch.").
3. Create `plugins/` and `plugins/<id>/`, then write `manifest.json` (exact downloaded text).
4. Download `main.js`. Strip inline sourcemaps, append `\n/* nosourcemap */`, and write it. If missing, the failure is only logged ("main.js not found").
5. Download `styles.css` (optional; also only logged if missing).
6. Clear `updates[id]`, show the success Notice, `loadManifest(<dir>)`, `didChange()`.
7. If the plugin was loaded: `disablePlugin(id)` and then `enablePlugin(id, true)`. This is the **in-place hot update**; `onUserEnable` fires again. A plugin that was installed but not enabled stays disabled.
8. Hashes and signatures are **not verified** (observed absence). The tag must equal the `version` string.

The browser "Install" path (105400-105416) re-runs `Rx` and refuses `isDesktopOnly` plugins on mobile. "Update all" in settings (142420-142440) calls `installPlugin` sequentially for each pending update.

### 9. Community browser UI (h3/g3/w3) (observed)

- `h3` (104548-104853) is a popout-capable modal (`settingsPopoutWindow` config) with a sidebar list and a details pane.
  - Mod+F focuses search; search is debounced 300 ms.
  - "Show installed only" toggle; sort menu (`download`, `update`, `release`, `alphabetical`). `release` simply **reverses** the directory order, inferred to be submission order.
  - Arrow-key grid navigation (column count is computed from `offsetTop`); swipe-back on phones.
  - Items render lazily: the first 20 synchronously, the rest through a render queue that pauses while scrolled away. A `qI` scheduler takes batches of 10 with a 100 ms max delay.
- `g3` (105190-105512), plugins:
  - It is a singleton (`activeInstance`). The sort order persists in localStorage `communityPluginSortOrder`.
  - The fuzzy search matches against `name + author + description`. When `setAutoOpen(id)` targets an unknown id, the search box is seeded with the id's words.
  - `showItem` fetches the HEAD manifest (id must match) and computes `Rx`. It shows downloads, version, installed version, author/authorUrl, repo link, last-update link, desktop-only warning and buttons: Install/Update, Options, Hotkeys, Enable/Disable, Uninstall, "Copy share link" (`obsidian://show-plugin?id=<id>`) and Donate.
  - The README is parsed as markdown → HTML → **DOMPurify-sanitized** (`sanitizeHTMLToDom`) → `Nx` rewrites relative `<img>`/`<video>`/embeds to raw GitHub URLs and internal links to `/blob/HEAD/` (105497-105503, 43315-43358).
- `w3` (105553-106048), themes:
  - Sort options `download / release / alphabetical`, persisted in `communityThemeSortOrder`.
  - A "Dark/Light themes only" filter keyed off the current base theme; an `onlyShowUpdates` mode.
  - Screenshots larger than 640x320 are **downscaled client-side** through a canvas to fit within 512x288 (one image per tick).
  - The built-in default theme appears as the first card.

### 10. Core (internal) plugins: wrapper, registry, full list

**Wrapper `Q3`** (109920-110128) buffers registrations made in `instance.init(app, wrapper)` and applies them on `enable()`:
- buffered registrations: `registerGlobalCommand` (name prefixed with the plugin name; the id is not prefixed), `registerRibbonItem` (id `<pluginId>:<title>`), `registerStatusBarItem` (a flag), `registerViewType`, `registerMobileFileInfo`.
- `enable(userEnabled)`:
  1. Add the commands, ribbon buttons, mobile file info, status bar element and view types.
  2. `await instance.onEnable(app, wrapper)`, during which instances call `wrapper.registerEvent` and so on, because the wrapper is a `Component`.
  3. `onUserEnable(app)` if userEnabled.
  4. `wrapper.load()`, `manager.requestSaveConfig()`, trigger `change`.
- `disable(userDisabled)` reverses this: `onDisable`, then `onUserDisable`, remove commands and ribbon buttons, detach the status bar, unregister views (and detach their leaves only when the user disabled the plugin), then `unload()`.
- Data lives at `<configDir>/<pluginId>.json` (for example `.obsidian/daily-notes.json`), with `loadData/saveData/deleteData`. External-change detection uses `lastSave` versus mtime, the same as community plugins. Registry `onRaw` routes any `<configDir>/<x>.json` to plugin `x` (110140-110145).

**Registry `Z3`** (110129-110234):
- `loadPlugin(instance)` throws on a duplicate id. `getPluginById`, `getEnabledPluginById` (returns the *instance*), `getEnabledPlugins`.
- `enable()` reads `core-plugins.json`:
  - If it is an **array** (legacy format), read `core-plugins-migration.json` as the base object, then for each id in the legacy list `$3` that is loaded, set `config[id] = array.includes(id)`.
  - If it is an object, use it directly.
  - Then, for each loaded plugin: if the id is present in the config, enable it when true. If absent, enable it when `defaultOn` and schedule a save (new core plugins are auto-enabled once and recorded).
- `saveConfig()` (debounced 500 ms) writes `{id: enabled}` for every loaded plugin, keeping unknown ids already in the object.

**Complete core plugin list** (constructor ids at the class lines; load order from 145059-145088; descriptions from `i18n.js`):

| # | id | Class (line) | Default | One-line purpose |
|---|---|---|---|---|
| 1 | `file-explorer` | Mte (128122) | on | "Files": browse files and folders |
| 2 | `global-search` | E2 (99748) | on | Vault-wide search |
| 3 | `switcher` | rie (135243) | on | Quick switcher (jump to files by keyboard) |
| 4 | `graph` | A2 (100404) | on | Global and local graph view |
| 5 | `backlink` | x8 (113368) | on | Backlinks pane and in-document backlinks |
| 6 | `canvas` | ate (126657) | on | Infinite canvas (`.canvas` files) |
| 7 | `outgoing-link` | _te (129762) | on | Outgoing links and unlinked mentions |
| 8 | `tag-pane` | tre (140334) | on | Tags view with counts |
| 9 | `footnotes` | Rte (129071) | **off** | Footnotes view for the current note |
| 10 | `properties` | lne (130961) | on | Properties (metadata) sidebar view |
| 11 | `page-preview` | tne (130837) | on | Hover previews of internal links |
| 12 | `daily-notes` | bte (127496) | on | Today's daily note; URI action `daily` |
| 13 | `templates` | lre (140682) | on | Insert templates from a folder |
| 14 | `note-composer` | Hte (129282) | on | Merge or split notes |
| 15 | `command-palette` | dte (127266) | on | Ctrl/Cmd+P command palette |
| 16 | `slash-command` | lie (135409) | **off** | `/` commands in the editor |
| 17 | `editor-status` | Cte (128026) | on, **hiddenFromList** | Editing-mode toggle in status bar |
| 18 | `bookmarks` | h9 (120672) | on | Bookmarks of files, searches, headings, graphs |
| 19 | `zk-prefixer` | dre (140977) | off (no `defaultOn`) | "Unique note creator", timestamp-prefixed notes; URI action `unique` |
| 20 | `random-note` | sie (135373) | off | Open a random note |
| 21 | `outline` | Jte (130437) | on | Table of contents for the current note |
| 22 | `word-count` | yre (141264) | on | Status-bar word/char count (in a Web Worker); CLI `wordcount` |
| 23 | `slides` | pie (135485) | off | Presentation from `---`-separated slides |
| 24 | `audio-recorder` | Y8 (116047) | off | Record audio attachments |
| 25 | `workspaces` | wre (141390) | off | Save and load layouts |
| 26 | `file-recovery` | Tte (128223) | on | Local snapshots of Markdown, canvas and base files |
| 27 | `publish` | tie (134648) | off (only if policy `publish`) | Obsidian Publish |
| 28 | `sync` | Jie (138683) | **on** (only if policy `sync`; inert until sign-in, inferred) | Obsidian Sync |
| 29 | `bases` | e9 (119575) | on | Database-like views over properties (`.base`) |
| 30 | `webviewer` | c5 (110500) | off (desktop + policy `webViewer` only) | In-app web browser |

The legacy migration list `$3` (110129) also includes `starred` and `markdown-importer`, ids from older versions that no longer have classes (observed absence from the load list). It lacks the newer ids `canvas`, `footnotes`, `properties`, `bookmarks`, `bases` and `webviewer` (`audio-recorder` is in it and is still a live plugin).

Core plugin instance protocol (from usage): `id, name, description, defaultOn?, hiddenFromList?, options?`, plus `init(app, wrapper)`, `onEnable(app, wrapper)`, `onDisable(app, wrapper)`, `onUserEnable(app)`, `onUserDisable(app)`, `onExternalSettingsChange()`. Example: word-count (141264-141330) registers a status bar item at init, then registers events, a worker built from an inline Blob, and a CLI handler at enable.

### 11. Themes and CSS snippets: loading and packaging mechanics (observed, 45460-46105)

- Folders: `<configDir>/themes/<Name>/{manifest.json, theme.css}` and `<configDir>/snippets/*.css`.
- `readThemes()` lists `themes/`. For each folder that has **both** `theme.css` and a `manifest.json` whose `name` exactly equals the folder name, the folder counts as a theme. Loose `themes/*.css` files (not starting with `.`) are **legacy themes** (`oldThemes`).
- `readSnippets()` lists the top-level `*.css` files in `snippets/` (dot-files skipped), sorted with the app's collator.
- Config keys in appearance config: `cssTheme` (the active theme name; `""` means default), `enabledCssSnippets` (array), `translucency`.
- DOM order: `customCss.styleEl` is created at construction and appended to `<head>` after `app.css`. Plugin `styles.css` elements are inserted **before** it. Snippet `<style>` elements are inserted **after** it, in sorted order. The cascade is therefore **app.css < plugin styles < theme < snippets**.
- `loadTheme` and `loadSnippets` run through a serial queue (`WT`) and are debounced (100 ms; `readThemes` 2000 ms). They reuse existing `<style>` elements, set `textContent` only when it differs, and trigger `css-change` and `resize` only on a real change. A `csscache` (path → text) is invalidated by vault `raw` events.
- Policy: a theme loads only if `Vx(Hx.themes, name)`; snippets load only if `Hx.snippets === true`; `globallyDisable/Enable` (the trust prompt) forces both off.
- Theme install (45941-46050):
  1. Ping download stats.
  2. If there is no version (legacy), take `obsidian.css` from the repo HEAD and synthesise a manifest `{name, version: "0.0.0", minAppVersion: "0.16.0", author}`.
  3. Otherwise download the release assets `manifest.json` and `theme.css`. On a **404** with no manifest, fall back to the HEAD copies.
  4. The manifest `name` must equal the directory name ("Theme name mismatch").
  5. Write both files, delete any legacy `themes/<name>.css`, then `readThemes()`.
- Theme update check (45807-45850): versioned themes compare `installed < Rx(target)`. Legacy themes are compared **byte-for-byte** with the repo's `obsidian.css`.

### 12. URI handler (`obsidian://`): full path and every action

**Main process (main.js)**
- The app registers itself as the default handler for `obsidian` if it is not already (5480).
- Arrival paths:
  - macOS cold start: `open-url` is captured in `will-finish-launching` (4751-4755). At run time, the `open-url` app event (5469-5472).
  - Windows/Linux cold start: the last argv element starting with `obsidian://` (5461-5463).
  - Windows/Linux warm start: the second process fails `requestSingleInstanceLock`. It connects to the CLI socket (`\\.\pipe\obsidian-cli-<username>` on Windows; otherwise `$XDG_RUNTIME_DIR` or home `/.obsidian-cli.sock`) and sends one JSON line `{argv, tty, cwd}` (3976-4022). The primary's CLI server sees that the last arg starts with `obsidian://`, calls `Ze(uri)`, and replies "Processed URI" (4840-4853).
  - Clicking an `obsidian://` link inside the app goes through `shell.openExternal`, back to the OS, and in again (inferred from the scheme allow-list at 4141-4185).
- `Ze(uri)` (5482-5530):
  - `obsidian:///abs/path` (the remainder starts with `/`): `{action: "open", path}`. On Windows the leading slash is dropped.
  - The prefixes `sync-setup` and `choose-vault` just open the **vault picker** window (`starter.html`). On desktop the renderer `sync-setup` handler is reached through the picker's `vault-message` IPC instead (starter.js:7320, main.js:5122-5128).
  - `obsidian://vault/<vault>/<file...>`: `{action: "open", vault, file}`, URI-decoded per segment.
  - Otherwise `no()` (3813-3826) parses it as `action?query#hash`. The action is the path with trailing slashes removed. Query pairs are split on the first `=` and `decodeURIComponent`-ed; a key without a value becomes `"true"`; `#...` becomes `hash`.
  - Vault resolution:
    - `path`: the registered vault whose path is the longest prefix wins; `file` becomes the relative remainder.
    - `vault`: matched against the vault **id** (exact) or the vault folder **basename** (case-insensitive) (4560-4567), and then removed from the payload.
    - Neither: use the most recently focused vault window, opening one if needed.
    - No match: an error box "vault not found".
  - `Lt(vaultId, payload)` opens or focuses the vault window. `Xe("OBS_ACT", win, payload)` runs a tiny script in it: if `window.OBS_ACT` is a function, call it with the payload, else **store the payload** in `window.OBS_ACT` for later. The script runs after `did-finish-load` if the page is still loading (5556-5568).
  - Opening a plain file path works the same way with `OBS_OPEN_FILE` (or `OBS_ACT` open when the file is inside a vault).

**Renderer**
- `C3.init()` (106068-106075) is called from `workspace.registerUriHook()`, which runs after layout load and after plugins (145292). It swaps `window.OBS_ACT` to `dispatch` and **replays** any queued payload. On mobile, Capacitor `appUrlOpen` events go through the same parser (`vP`, 48684-48712). If the URI names another vault, the URI is stashed in `sessionStorage["obsidian-uri"]` and the page reloads.
- `dispatch(params)` (106083-106095) logs "Received URL action", focuses the focused container, ignores a bare `{action: "open"}` with nothing else (it just focuses the vault), calls the registered handler, or shows the Notice "Unrecognized URI action: X".
- `register` throws on duplicates. `unregister(action, handler?)` only removes the entry if the handler matches (or none is given). The constructor also deletes a legacy `trusted-uri-actions` localStorage item (106056).

Action catalogue:

| Action | Params | Behaviour | Line |
|---|---|---|---|
| `open` | `vault`, `file` (linkpath, may include `#heading`), `path` (absolute, main-process only), `paneType` | Resolves via `getFirstLinkpathDest(file, "")`, opens with subpath eState, Notice | 106116-106130 |
| `search` | `vault`, `query` | Opens global search with the query (needs `global-search` enabled) | 106131-106134 |
| `new` | `vault`, `file` (path) or `name`, `content`, `clipboard`, `append`, `prepend`, `overwrite`, `silent`, `paneType`, `x-success` | Rejects `../` or `..\` in `file`. `append/prepend/overwrite` first try to reuse an existing note (linkpath or case-insensitive path). Otherwise it creates missing folders and a new note; `name` is placed per "new file location" relative to the active file. Content goes in by insert (append/prepend) or `modify` (otherwise). It opens in source mode with title rename unless `silent`, then the x-callback | 106135-106207 |
| `daily` | `content`, `clipboard`, `prepend`, `silent`, `paneType`, `x-success` | daily-notes core plugin: get or create today's note, insert (append by default) | 127598-127631 |
| `unique` | `content`, `clipboard`, `silent`, `paneType`, `x-success` | zk-prefixer: create a timestamped note and append content | 141055-141083 |
| `show-plugin` | `id` | Policy-gated. In restricted mode it opens Settings → Community plugins; else the plugin browser auto-opened on the id | 106208-106217 |
| `show-theme` | `name` | Policy-gated theme browser | 106218-106220 |
| `show-release-notes` | `version` | `app.showReleaseNotes(version)` | 106221-106223 |
| `debug-info` | – | Debug-info modal (`c3`) | 106224-106226 |
| `publish-sites` | – | Enables Publish if needed and shows sites (policy) | 106227-106233 |
| `sync-setup` | `vault` (JSON) | After layout ready: enable Sync and connect to the remote vault; else the vault chooser | 106234-106244 |
| `vault-setup` | – | Creates the welcome note and a split pane with a starter view | 106245-106263 |
| `hook-get-address` | `x-success`, `x-error` | Needs `uriCallbacks`. If there is no x-success it copies `[basename](obsidian://open?...)` to the clipboard. With no active file it opens x-error with `errorCode=NotFound` | 106264-106276 |
| *plugin-defined* | any | `plugin.registerObsidianProtocolHandler(action, cb)`, where `cb` receives the whole params object | 109064-109070 |

**x-callback-url** (`handleXCallback`, 106096-106113): only active when the vault config `uriCallbacks` is true (default false, 50215; toggle at 143358). It appends `name`, `url` (from `getObsidianUrl`: `obsidian://open?vault=<name>&file=<path without .md>`, 146152-146156) and, on desktop, the absolute `file` path to `x-success`, then calls `window.open`. **`file:` targets are refused.**

### 13. Security model (what a plugin can reach)

Observed facts:
- Every vault window and popout uses `nodeIntegration: true`, `contextIsolation: false`, `nodeIntegrationInWorker: true` and `webviewTag: true`, with `devTools` from policy (main.js:4600-4612, 4275-4283). `@electron/remote/main` is initialised in the boot loader (`x/app/main.js:9-11`) and enabled per window (`remote.enable`, main.js:4196-4203). The renderer patches `electron.remote` (app.js:96474-96480).
- So a plugin's `require` reaches **all of Node** (`fs`, `child_process`, `net`...), `electron` (ipcRenderer, shell, and remote with BrowserWindow/dialog/app). It also reaches the global `window.app` (146377) and therefore every internal manager (`app.plugins.plugins`, `app.vault.adapter`, `app.internalPlugins`, `app.secretStorage`...).
- `requestUrl` routes through the main process via IPC `request-url` on desktop (`lw`; main.js:5146), or Capacitor's native HTTP on mobile, so plugins get **CORS-free HTTP** (42940-42981).
- The CSP in `index.html` only restricts `style-src`, so script eval is unrestricted.
- There is no per-plugin isolation (shared global and DOM), **no capability or permission declaration in the manifest, and no runtime permission prompts**.

Mitigations that do exist:
1. Restricted mode, per vault and per device.
2. The first-open trust prompt, which also suspends theme and snippet CSS.
3. Enterprise policy: on "work" builds (`app.name === "obsidian-work"` or `isWork: true` in `obsidian.json`) the main process reads `policy.json` from `C:\Program Files\Obsidian[Work]\policy.json`, `/Library/Application Support/...` or `/etc/<app>/policy.json`. The policy is **fail-closed**: any read or parse error means everything is false. `plugins` and `themes` may be `true` or an array of allowed ids or names; `snippets`, `sync`, `publish`, `webViewer`, `devTools` and `insider` are booleans. Non-work builds allow everything. The renderer gets the policy via sync IPC `policy` and freezes it once (main.js:29-66, 3944-3959, 4367, 4973-4975; app.js:43363-43372, 146276).
4. The remote deprecation kill-switch (12 h) and the hardcoded version blocks.
5. ID-mismatch checks on install, update and detail view.
6. Author scrub of "obsidian".
7. DOMPurify on READMEs.
8. Emulated-mobile mode blocks Node requires, for testing mobile compatibility.
9. Outside the plugin system, main-process hardening protects the user: unknown URL schemes need confirmation, with an "always" option persisted in `obsidian.json` `openSchemes` (main.js:4141-4160); file links get remote-file and executable warnings; and `<webview>`s are forced sandboxed with no Node and no preload (main.js:4298-4309).

Inferred: the security story relies on **review before listing** plus a revocation list, not on runtime enforcement. A malicious plugin, or a vault shared with a plugin in it once trusted, has the same power as the app.

### 14. Plugin-related CLI commands (observed, 58973-59110, 60165-60420)

`plugin`, `plugins [filter=core|community] [versions] [format]`, `plugins:enabled`, `plugins:restrict [on|off]` (toggles restricted mode and reloads), `plugin:enable|disable id= [filter=]`, `plugin:reload id=` (core: disable, then enable; community: disable, `loadManifests`, enable), `plugin:install id= [enable]` (directory lookup, HEAD manifest, `Rx`, `installPlugin`), `plugin:uninstall`, `themes`, `theme`, `theme:set`, `theme:install`, `theme:uninstall`, `snippets`, `snippets:enabled`, `snippet:enable|disable`. Only the read commands (`plugin`, `plugins`, `plugins:enabled`, `plugins:restrict`, `themes`, `theme`) check the policy themselves, throwing `"Restricted: plugins are disabled."` / `"Restricted: themes are disabled."` when it is `false` (an allow-list passes). The mutating commands rely on the manager's own gates: `enablePlugin` re-checks the policy, `loadPlugin` is a no-op in restricted mode, and `installTheme` checks the theme policy. **`plugin:install` has no policy or restricted-mode check of its own**, so it downloads and writes plugin files even when plugins are disabled; only the optional `enable` step is refused (observed, 58973-59041, 60270-60315).

---

## Data formats & on-disk files

| File | Format | Notes |
|---|---|---|
| `.obsidian/community-plugins.json` | JSON array of plugin ids | Load order = array order; rewritten debounced 1 s; ids of missing manifests are kept |
| `.obsidian/core-plugins.json` | JSON object `{ "<coreId>": true/false }` | Legacy: array of enabled ids, migrated using `core-plugins-migration.json` (object) |
| `.obsidian/<coreId>.json` | JSON (2-space) | Core plugin options (`Q3.saveData`) |
| `.obsidian/plugins/<id>/manifest.json` | JSON `{id, name, version, minAppVersion, description, author, authorUrl?, fundingUrl?, isDesktopOnly?}` | `dir` added at runtime; `id` required |
| `.obsidian/plugins/<id>/main.js` | CommonJS bundle | Evaluated as above; installer appends `/* nosourcemap */` |
| `.obsidian/plugins/<id>/styles.css` | CSS | Optional |
| `.obsidian/plugins/<id>/data.json` | JSON (2-space) | `loadData/saveData`; written with explicit mtime |
| `.obsidian/themes/<Name>/manifest.json` | `{name (== folder), version, minAppVersion, author, authorUrl?, fundingUrl?}` | |
| `.obsidian/themes/<Name>/theme.css` | CSS | |
| `.obsidian/themes/<Name>.css` | CSS | Legacy theme |
| `.obsidian/snippets/*.css` | CSS | Top level only |
| appearance config | `cssTheme`, `enabledCssSnippets`, `translucency` | via `vault.getConfig/setConfig` |
| app config | `uriCallbacks` (false), `settingsPopoutWindow` | |
| localStorage (app origin) | `enable-plugin-<appId>` = `"true"/"false"`; `<appId>-plugin-automatically-check-for-updates`; `<appId>-last-plugin-update-check`; `<appId>-DebugMode`; `EmulateMobile`; `communityPluginSortOrder`; `communityThemeSortOrder`; `local-themes` | Per device, not synced |
| `obsidian.json` (userData) | `openSchemes`, `isWork`, `cli`, `vaults` | main process |
| `policy.json` (system path) | `{plugins, themes, snippets, sync, publish, webViewer, devTools, insider}` | Work builds only |
| Release repo files | `community-plugins.json` (array), `community-plugin-stats.json` (map), `community-plugin-deprecation.json` (map id → versions), `community-css-themes.json` (array) | |
| Plugin repo | `manifest.json` (HEAD), `versions.json` (`{pluginVersion: minAppVersion}`), `README.md`, release tag `<version>` with assets `manifest.json`, `main.js`, `styles.css` | |

---

## Rebuild notes (for a Tauri 2 app)

**Essential ideas worth keeping**
1. **One lifecycle primitive.** Everything a plugin adds goes through a `register(cleanup)` stack on a Component, unwound LIFO on unload, children first. This single idea makes enable, disable and reload safe without per-feature teardown code. Keep it, and make `onunload` awaitable.
2. **Namespaced contributions.** Command ids are `pluginId:localId` and names get the plugin prefix. Ribbon ids and CSS classes are namespaced too. Do it without mutating the caller's object.
3. **Shared singletons for the editor stack.** Give plugins the *same* editor/state module instances as the host, so `instanceof`, facets and state fields interoperate. With CodeMirror 6 this is mandatory: two copies of `@codemirror/state` break everything. Ship a fixed module map and version it.
4. **Lazy view re-hydration.** Persist leaves of unknown view types and re-instantiate them when the type registers. Users never lose layout because a plugin loaded late.
5. **Deferred "layout ready" hook,** with callbacks spread across macrotasks and errors attributed to the plugin.
6. **Startup watchdog.** A per-plugin timer that offers "disable this plugin" on the loading screen is cheap and saves users from boot loops.
7. **Directory + releases distribution model.** A central JSON index points to repos, and versions are chosen with `minAppVersion` plus a `versions.json` fallback. It is simple and works. Add **hashes or signatures** in the index; Obsidian has none.
8. **Remote kill-switch** for bad versions, polled periodically.
9. **Cascade order:** core CSS < plugin CSS < theme < user snippets, with diffed `<style>` updates.
10. **Declarative settings definitions** (`getSettingDefinitions`) so plugin settings are searchable and rendered consistently.

**What to do differently (incidental or unsafe in Obsidian)**
- Do **not** eval plugin code in the privileged main context. In Tauri, run each plugin in an isolated JS context: a sandboxed `<iframe>` with its own origin and no Tauri IPC, a Web Worker, or a QuickJS/Deno/Boa isolate in Rust. Expose an async RPC API, and have the manifest declare **capabilities** (vault read/write, network hosts, UI slots, editor extensions). Tauri 2's capability and permission system can gate the Rust commands each plugin context can call.
- UI extensions (views, editor extensions) are the hard part of isolation. Options: (a) declarative UI contributions plus message passing; (b) a "trusted tier" of plugins that run in-process after explicit consent, like Obsidian, while everything else stays sandboxed. Editor (CM6) extensions basically need in-process execution; consider a curated extension point (decorations, keymaps, commands via RPC) instead.
- Store the trust decision with an explicit "remember" choice, and show the plugin list and requested capabilities in the prompt (Obsidian's prompt is generic).
- Verify downloads (sha256 in the index, or minisign signatures). Pin the release tag to an immutable commit.
- Avoid silent write failures in `saveData`, and give plugins real error feedback.
- Version the plugin API separately from the app version. Obsidian's `apiVersion` *is* the app version, which couples them.
- For URIs, Tauri 2's `deep-link` plugin plus `single-instance` covers the main-process plumbing. Keep Obsidian's queue-until-ready trick (`OBS_ACT` stored, then replayed once the dispatcher exists). Keep built-in actions non-overridable and x-callback opt-in. Reject `file:` callbacks and path traversal.

**Minimal re-implementation sketch (design)**
- `PluginHost`: discover the manifests, then load the enabled list in order, each step behind a watchdog. Record per-plugin timing. Emit `changed`.
- `PluginContext` (per plugin): `register*` methods that push cleanup closures, plus `loadData/saveData` against `plugins/<id>/data.json` with mtime-based echo suppression and `onExternalSettingsChange`.
- `Registry` services: commands, views and extensions, URI actions, post-processors, settings tabs, editor extensions. Each one throws on duplicates and emits change events.
- `CoreFeature` objects that use the same registry API, plus `defaultOn` and a JSON enabled map with an "auto-enable new defaults once" rule.
- `Distribution`: index fetch (TTL cache), compatible-version resolver, installer (manifest → bundle → css), update checker, deprecation poller.

---

## Open questions

1. **`sessionStorage["obsidian-uri"]` consumer** (mobile vault switch, 106080). The reader was not located; the key may be built dynamically. To resolve: grep for `"obsidian-uri"` in other bundles or concatenations, or probe at runtime on mobile.
2. **Module map `u`** (12711-12727, includes `Publish`). It is inferred to be the module object for Obsidian Publish site scripts (`publish.js`); no consumer was found in the plugin path. To resolve: search the publish site bundle (not in this install).
3. **Exact schema of `community-plugin-deprecation.json`** and **`community-plugin-stats.json`**. Only `table[id].contains(version)`, `downloads` and `updated` are used. To resolve: fetch the public JSON files (allowed; public data).
4. **Whether choosing "Browse vault in Restricted Mode" persists anything.** By the code path it does not, so the prompt reappears each launch. Confirm with a runtime probe.
5. **Live Preview use of `codeBlockPostProcessors`.** Resolved by the verification pass: the Live Preview code-block widget reads the map in `initDOM` (app.js:112246-112248) and calls the handler with its own context object, and a predicate at 112304 renders a widget only for `mermaid`, `query` or a registered language. Details belong to the editor doc.
6. **`Te` = `Prec`.** This is inferred from the `highest/high/lowest` members. Confirm via the CM6 state export map (`Prec: () => Te`?).
7. **Mobile specifics.** `window.require` is undefined, so Node requires return `undefined` rather than throwing. Whether the Capacitor build adds more restrictions (for example, blocking `isDesktopOnly` at install) was not checked beyond the enable gate.
8. **Async `onunload`.** `Component.unload` is synchronous, so returned promises are dropped. Confirm that nothing else awaits plugin teardown (for example on window close via `registerQuitHook`).
