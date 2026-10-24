# Workspace shell & UI framework (Obsidian 1.14.4 renderer)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian's renderer does not use a UI framework. It is plain TypeScript classes that build DOM imperatively through a small
set of DOM prototype helpers (`createEl`, `createDiv`, `empty`, `toggleClass`, ...) installed by `enhance.js`. Lifetime is
handled by one `Component` tree (load/unload plus a list of disposers) and one tiny `Events` emitter. The `App` object is a
service locator built in a fixed order (keymap → commands → hotkeys → DOM skeleton → CSS → vault → workspace → managers →
settings → appearance → core plugins → community plugins → vault index → metadata cache → layout → opening behaviour). The
workspace is a persistent tree of `WorkspaceItem`s (split / tabs / leaf / sidedock / floating / window). It serialises to
`.obsidian/workspace.json` and renders through CSS flexbox. Each leaf owns a `View`. Hidden leaves are restored as
lightweight "deferred" placeholders. A CSS-animation trick detects when a placeholder becomes visible, and only then is the
real view built. Popout windows are same-process `window.open("about:blank")` children. Their DOM is driven from the main
window's JS realm, and a MutationObserver mirrors all `<style>` and `<link>` tags plus body classes and CSS variables into
them. Keyboard input goes through a stack of `Scope`s per window, matched on a normalised `"Alt,Ctrl,Meta,Shift"` string.
Theming is about 1,180 CSS custom properties on `body` / `.theme-dark` / `.theme-light`, plus an HSL accent and per-slot
font overrides. Accessibility is the weakest area. There is careful keyboard support (settings modal, trees, menus,
suggesters, modal focus trap and restore), but almost no ARIA semantics: no dialog, menu, tree, listbox or live-region roles
in Obsidian's own code. `aria-label` is used mainly as the tooltip source.

Evidence markers: **[O]** = observed in code, **[I]** = inferred from code, **[U]** = unknown.
Line numbers refer to the pretty-printed `app.js` unless prefixed (`main.js:`, `enhance.js:`, `app.css:`).

---

## Where it lives

| Minified id | Public / inferred name | Role | Lines |
|---|---|---|---|
| (IIFE) | renderer boot | sets Platform flags, waits for i18n, IPC `vault`/`version`/`policy`/`terms`, builds the FS adapter, then `new App` | 146258-146383 |
| `xoe` | `App` | service locator, boot sequence, theme/font/accent appliers, app commands | 144715-146257 |
| `boe` | AppDom | `.app-container > .horizontal-main-container > .workspace` + `.status-bar` | 144601-144606 |
| `woe` | titlebar logo installer | Windows/Linux logo button that pops up the native app menu | 144607-144651 |
| `QO`, `$O` | frameless titlebar (`frameDom`) | custom titlebar, min/max/close buttons, macOS traffic lights | 55903-55988 |
| `h0`, `p0`, `m0`, `y0`, `b0`, `w0`, `g0` | popout window helpers | electron hookup, open, event relay, style mirroring, focus class, enhance injection | 96467-96664 |
| `bM` | `Component` | lifecycle tree | 39039-39109 |
| `mM` / `yM` | overlay back-stack | patches `history.back/forward/go` to close the top overlay | ~38985-39039 |
| `QP` | `Events` | emitter | 50230-50283 |
| `vS`, `gS`, `mS` | `Scope`, delegating scope, `Keymap` | key routing | 41610-41776 |
| `sS`, `uS`, `dS`, `fS` | keyCode→name table, glyphs, modifier display names | hotkey printing | 41496-41609 |
| `bS`, `wS`, `ES` | `MenuItem`, `MenuSeparator`, `Menu` | DOM and native menus | 41794-42313 |
| `OS`/`FS` | AppMenuBarManager | native menubar template via IPC | 42724-42830 |
| `PS`, `IS` | `View`, `ItemView` | view base classes | 42429-42724 |
| `BO`, `S0`, `Q4` | `FileView`, `EditableFileView`, `TextFileView` | file-backed views, rename, autosave | 55076-55332, 96917-97059, 103729-103855 |
| `rI`, `aI`, `sI` | DeferredView, EmptyView ("New tab"), UnknownView | placeholders | 51226-51432 |
| `oI` | text-icon button | `div[role=button][tabindex=0]` pill | 51279-51317 |
| `UO`,`_O`,`GO`,`KO`,`YO` | `WorkspaceItem`, `WorkspaceParent`, `WorkspaceSplit`, `WorkspaceSidedock`, `WorkspaceContainer` | layout tree | 55490-55903 |
| `eF` | `WorkspaceTabs` | tab group, stacked tabs, tab DnD target | 56010-56508 |
| `tF` | leaf history | back/forward stacks per leaf | 56508-56589 |
| `nF` | `WorkspaceLeaf` | leaf, tab header, view host | 56589-57077 |
| `oF`,`aF`,`sF` | mobile drawer (left/right) | phone/tablet sidebars | 57081-57545 |
| `E3`, `M3`, `S3`, `x3` | `WorkspaceRibbon`, `WorkspaceRoot`, `WorkspaceFloating`, `WorkspaceWindow` | | 106279-106543 |
| `P3` | recent-file tracker | `lastOpenFiles` | 106547-106620 |
| `L3` | `Workspace` | layout tree owner, active leaf, DnD, commands | 106631-108875 |
| `n3` | `ViewRegistry` | view type → factory, extension → view type | 104042-104120 |
| `AR` | DragManager | ghost, overlay, drop handler contract | 61922-62222 |
| `B8`, `R8` | Commands registry, execute helper | | 115116-115188 |
| `dD`, `sD`, `cD` | HotkeyManager, hotkey ctor, hotkey printer | `hotkeys.json` | 46155-46278 |
| `dte`/`fte`/`vte` | command-palette core plugin, modal, settings | | 127266-127489 |
| `ST`, `u3` | `Modal`, modal-or-popout base | | 44470-44666, 104411-104548 |
| `TT`, `xT` | `ConfirmationModal`, `ConfirmationButton` | | 44666-44765 |
| `IT`, `LT` | suggestion chooser, grouped chooser | | 44877-45063 |
| `OT`, `FT` | `SuggestModal`, `FuzzySuggestModal` | | 45063-45171 |
| `zT` | `Notice` | toasts | 45175-45247 |
| `kI` | startup progress bar | | 51539-51601 |
| `oS`, `aS`, `ZM`, `jM`, `iS` | `setTooltip`, dynamic tooltip, `displayTooltip`, tooltip installer, hide | | 41361-41495 |
| `wM`, `kM`, `EM`, `MM`, `SM`, `xM`, `TM`, `IM`, `LM`, `OM`, `FM`, `RM` | lucide data, svg attrs, builders, aliases, custom glyphs, plugin icons, `getIcon`, `setIcon`, `addIcon`, `removeIcon`, `getIconIds` | | 39110-41360 |
| `rT`, `oT`, `aT` | `Setting`, `SettingGroup`, `SettingPage` | | 43500-43776 |
| `sT`..`CT` | `BaseComponent` … `ColorComponent` | form controls | 43776-44317 |
| `F4`, `z3` | `SettingTab`, `PluginSettingTab` | declarative definitions | 103162-103242, 109178 |
| `x4`,`T4`,`f4`,`w4`,`k4`,`u4`,`h4`,`s4`,`l4` | declarative settings renderer | keyed reconcile, visibility, pages | ~102606-102800 |
| `doe`, `loe` | settings modal, settings search index | | 143778-144594 |
| `oD`, `aD` | CustomCss manager, theme quick-switcher | | 45482-46154 |
| `QL`,`$L`,`ZL`,`uO`,`hO`,`pO` | nav header, nav search, child list, **virtualizer**, virtual node, **tree keyboard/selection controller** | | 53128-53869 |
| `dO`,`yO`,`fO` | tree drop-position calculation, drop indicator | | 53870-53944 |
| `db`, `rb`, `sb`, `lb`, `gb`, `vb` | i18n proxy, `getLanguage`, setLanguage, detect, apply lang/RTL, isRTL | | 35264-35420, 36316-36324 |
| `Qy` | `Platform` | capability flags | 35218-35262 |
| `Hx`, `Vx` | enterprise policy (frozen), allow check | | 43360-43372 |
| `Gl`, `Yl`, `SC`, `KT` | `debounce`, microtask coalescer, idle-callback-with-timeout, promise timeout | | 24224, 24267, 37677, 45434 |
| `Gw`, `qw`, `Uw` | JS-driven CSS transition helper | | 36840-36930 |
| `qE`/`jE` | save/restore descendant scrollTops across DOM moves | | 38425-38440 |
| `FE`/`RE`/`BE`, `lE` | focusable selector, first focusable, focus first, Enter/Space click helper | | 38390-38410, 38118 |

---

## How it works

### 1. Renderer boot

**HTML**: `x/obsidian/index.html` loads, deferred and in this order: CodeMirror 5 + addons + vim, moment, pixi, i18next, scrypt,
turndown, `enhance.js`, `i18n.js`, `app.js`. `<body class="theme-dark">` is the pre-boot default. A CSP restricts
`style-src` to self, inline and Google Fonts. **[O]**

**Module-level side effects in app.js, before the boot IIFE** **[O]**:
- i18next init plus the English bundle (35264-35310). If a non-English language is stored, it is loaded asynchronously and
  the promise is kept in `cb` (35309).
- Inter weights preloaded with `document.fonts.load(...)` (144672-144681). Body gets an OS class `mod-macos|mod-windows|mod-linux`
  (144685-144694). `gb(document)` sets `<html lang>` and `mod-rtl` (36319). `jM()` installs global tooltips (41362).
- Touch/scroll bookkeeping listeners. `document.scroll` forces `documentElement.scrollTop = 0`, so the app shell never scrolls
  (144706-144714).
- `DOMPurify` hook forces a sandbox on every sanitised `<iframe>` (144669-144671).

**Boot IIFE (146258-146383)** **[O]**:
1. Sets `Platform.isDesktopApp/isDesktop/hasPhysicalKeyboard = true` and marks `initialization.boot`.
2. `await cb`, the language pack, then marks `initialization.language`.
3. `ipcRenderer.sendSync("vault")` returns `{id, path}`. If the path is missing it falls back to the vault picker (`"starter"`) and closes.
4. Window setup: `h0(window)` (electron, remote, `window.open` patch for `file:` URLs, frameless titlebar `$O`),
   `woe(window)` (titlebar logo menu button), `b0(window)` (`is-focused` body class driven by the main process `focuschange`,
   `main.js:4245`).
5. Sync IPC calls: `version`, `policy` (frozen into `Hx`), and a `terms` handshake that must return an exact
   anti-redistribution sentence or the window closes. This is a licensing gate; it is documented here only as boot behaviour.
6. Wraps `navigator.clipboard` to use Electron's clipboard and forward it to whichever window is active. On Linux, adds
   middle-click paste suppression (146310-146357).
7. Builds the Node FS adapter `nc(original-fs, path, url, trash-via-IPC, btime, resourcePathPrefix, basePath)`. Sets
   `document.title`, marks `initialization.electron`, then `ready(() => window.app = new App(adapter, id))`.

**App constructor (144716-144961)**, in order **[O]**:
`embedRegistry`, `viewRegistry` (built-in views registered immediately), `keymap = Keymap.init()` (global singleton),
`scope = keymap.rootScope`, `commands`, `hotkeyManager` (registers a catch-all handler on the root scope), `dragManager`,
`dom = new AppDom(body)`, `customCss` (creates the theme `<style>` immediately), `shareReceiver`, `renderContext`,
`secretStorage`, `cli`. Then: optional debug mode (localStorage `DebugMode`), optional mobile emulation (localStorage
`EmulateMobile`, which also flips Platform flags and adds touch-hover emulation), `is-mobile`/`is-phone`/`is-tablet`
classes, `styled-scrollbars` on non-mac, iOS long-press → synthetic `contextmenu`. Service workers are disabled by stubbing
`register` (144845). A 20-second watchdog adds "Reload / Reload in safe mode / Open another vault" buttons to the progress
bar (144855-144885). Then `initializeWithAdapter`. `navigator.storage.persist()` is requested in parallel.

**`initializeWithAdapter` (144983-145389)**. Each `fI(key)` is a perf mark; marks are folded into a tree and shown in the
debug info:

| # | Step | Mark |
|---|---|---|
| 1 | `vault = new Vault(adapter)`. Probe the root; if ENOENT, open the vault chooser and stop | |
| 2 | vault `closed` / `config-changed` listeners; optional config-dir override (localStorage `<appId>-config`); `vault.setupConfig()` | `vault.setup` |
| 3 | `disableCssTransition()` (adds `.no-transition` to `.app-container`) | |
| 4 | `workspace = new Workspace(app, dom.workspaceEl)`; `fileManager`; `statusBar`; `metadataCache`; `metadataTypeManager`; `foldManager`; `internalPlugins`; `plugins` | `workspace.components.managers` |
| 5 | `setting = new SettingsModal(app)` | `workspace.components.settings` |
| 6 | colour-scheme listener (matchMedia plus Electron `nativeTheme.updated`); `updateAccentColor`, `updateTheme`, `updateFontFamily`, `updateFontSize`, `updateTabSize`; `customCss.load()` started, **not awaited**; inline-title / floating-nav / auto-fullscreen / ribbon / view-header / native-menu body classes | `workspace.appearance` |
| 7 | desktop menubar manager; mobile toolbar / navbar / tab switcher / quick actions; share receiver | |
| 8 | `await metadataTypeManager.load()` | `workspace.managers.metadataType` |
| 9 | `await secretStorage.load()` | `workspace.managers.secretStorage` |
| 10 | `await hotkeyManager.load()`; `registerCommands()` (app-level commands) | `workspace.managers.hotkeys` |
| 11 | 30 core plugins `loadPlugin`ed in a fixed order (27 always, plus Publish/Sync/WebViewer gated by policy and platform); `await internalPlugins.enable()` | `corePlugins` |
| 12 | read `openBehavior`. On phones there is a fast path: read workspace.json, render the last active note in a temporary absolutely positioned fake workspace, keep it until the real layout is up, then hand over cursor and scroll (145095-145235) | |
| 13 | `await plugins.initialize()`: community plugins (manifests, restricted-mode check, per-plugin hang watchdog) | `communityPlugins` |
| 14 | `metadataCache.preload()`; `await vault.load()` (file tree) | `vault.load` |
| 15 | `hotkeyManager.registerListeners()` (watches `hotkeys.json`); `metadataTypeManager.registerListeners()`; `await metadataCache.initialize()` | |
| 16 | `await workspace.loadLayout()`. Inside it: `setLayout` → `layoutReady = true` → `trigger("layout-ready")` → `onLayoutReady` callbacks, each after `sleep(0)` | `workspace.layout.load` |
| 17 | `await runOpeningBehavior(openBehavior)` (`""` / `"new"` / `"daily"` / `"file:<path>"`) | `workspace.layout.open` |
| 18 | remove the `mod-loading` fake workspace; `enableCssTransition()` after 500 ms; URI hook; open-file handler; CLI; quit hook; indexing notice | `workspace.layout.finalize` |
| 19 | update checks (hourly), release notes on version change, drop-to-install `.asar`, Sync DB cleanup after 30 s | `workspace.extra`, `finalize` |
| 20 | Perf tree computed (`dI`), counting views and deferred views. A "slow startup" notice appears if `slow-startup-check` is set and boot took more than 8 s | |

`onLayoutReady(cb)` (107668) **[O]**: before layout is ready the callback is queued together with
`plugins.loadingPluginId`. Afterwards it runs immediately. Queued callbacks run one at a time with `await sleep(0)` between
them. An error shows a "plugin error" Notice that names the plugin (107540-107573).

Quit (146161-146185) **[O]**: `onbeforeunload` asks the main process `is-closing`. It then flushes `requestSaveLayout.run()` and
triggers workspace `quit` with a promise collector (`YT`). The workspace adds the config save and every dirty
`TextFileView.save()` (106873-106890). If anything is pending, unload is cancelled, the progress bar says "Saving...", and the
window closes once everything resolves.

### 2. `enhance.js`: DOM and JS prototype extensions, window globals

It is installed as `window.globalEnhance`. The same function body is `eval`'d into every popout window
(`w0`, app.js:96662), because prototypes are per-realm. **[O]** Full list (`enhance.js`):

- **Polyfills**: `Object.hasOwn`, `TouchEvent` stub, `matchMedia().addEventListener`, `ResizeObserver` no-op stub.
- **Object**: `isEmpty(o)`, `each(o, fn, ctx)`.
- **Array**: `Array.combine(arrays)`; prototype `first`, `last`, `contains`, `remove(item)` (removes every occurrence, in place), `shuffle`, `unique`.
- **Math**: `clamp(v, min, max)`, `square`. **String**: `isString`; prototype `contains`, `startsWith`, `endsWith`, `format("{0}")`.
  **Number**: `isNumber`. **window**: `isBoolean`.
- **Element**: `getText`, `setText(string|Node)`, `addClass(...)`, `addClasses([])`, `removeClass(...)`, `removeClasses([])`,
  `toggleClass(cls|[], bool)`, `hasClass`, `setAttr(name, value|null)`, `setAttrs({})`, `getAttr`,
  `matchParent(selector, stopAt)`, `getCssPropertyValue`, `isActiveElement()` (works across iframes and the active window),
  `find`, `findAll`, `findAllSelf`.
- **Element / Document / DocumentFragment**: `prepend(...)`. **DocumentFragment**: `find`, `findAll`.
- **Node**: `detach`, `empty`, `insertAfter`, `indexOf`, `setChildrenInPlace(nodes)` (minimal-move reorder that keeps DOM
  nodes, so focus and scroll survive), `appendText`, `instanceOf(Class)` (cross-window `instanceof`), getters `doc`, `win`,
  property `constructorWin`. Also `createEl(tag, opts|cls, cb)`, `createDiv`, `createSpan`, `createSvg`.
- **HTMLElement**: `show`, `hide` (keeps the previous `display` in `data-display`), `toggle(bool)`, `toggleVisibility`,
  `isShown()` (`offsetParent != null`), getters `innerWidth`/`innerHeight` (without padding), `setCssStyles`, `setCssProps`
  (custom properties, also on SVGElement), `addEventListeners({})`, `on(type, selector, listener, opts)` / `off(...)`
  (delegated events, also on Document), `onClickEvent(fn)` (registers **click + auxclick**), `trigger(type)`,
  `onNodeInserted(cb, once)`, `onWindowMigrated(cb)`.
- **UIEvent**: getters `targetNode`, `win`, `doc`; method `instanceOf`.
- **window**: `createEl` (options `cls`, `text`, `attr`, `title`, `value`, `type`, `placeholder`, `href`, `parent`, `prepend`,
  plus any `on*` function becoming a listener), `createDiv`, `createSpan`, `createSvg`, `createFragment`, `fish`/`fishAll`
  (querySelector shorthands), `ajax`/`ajaxPromise` (XHR; JSON body by default), `ready`, `sleep`, `nextFrame`,
  `activeWindow`, `activeDocument`.

`onNodeInserted` trick (enhance.js:459-471 with app.css:3295-3306) **[O]**: it adds class `node-insert-event`, which runs a
0.01 s keyframe animation `node-inserted` (it animates `outline-color`). It then listens for `animationstart`. A CSS animation
starts whenever the element enters a rendered tree: attached, or un-hidden from `display:none`. That gives a cheap
"became visible" event without IntersectionObserver or MutationObserver. Deferred views, the virtualizer, and dropdown
auto-width all depend on it.

Other window globals set by app.js **[O]**: `app` (146377), `Notice` (45247), `requestUrl` (43118), `FS` (47139),
`DOMPurify`, `Prism`, `MathJax`, `CodeMirrorAdapter`, `selectLanguageFileLocation` (dev helper, 35365), `handleCli` /
`cliQueue` (58442), `OBS_ACT` / `OBS_OPEN_FILE` (open-file hand-off from main), `frameDom`, `titlebarStyle`, `electron`,
`electronWindow` (h0). `i18next`, `moment`, `CodeMirror`, `PIXI` come from the vendored `<script>`s. `window.require` in the
90k range belongs to the Publish site runtime, not the app.

### 3. `Component` and `Events`

`Component` (39039-39109) **[O]**:
- State: `_loaded`, `_children[]`, `_events[]` (an array of disposer functions).
- `load()`: if not loaded, sets the flag, calls `onload()`, then `load()`s a snapshot of the children. If any returned
  promises, it returns `Promise.all` (async-aware load).
- `unload()`: pops and unloads children **in reverse**, pops and runs disposers in reverse, then calls `onunload()`. Teardown
  is LIFO, children before self.
- `addChild(c)` loads `c` immediately if the parent is already loaded. `removeChild(c)` unloads it.
- `register(fn)`, `registerEvent(ref)` (disposer is `ref.e.offref(ref)`), `registerDomEvent(el, type, fn, opts)`,
  `registerScopeEvent(handlerRef)`, `registerInterval(id)` (returns the id).

`Events` (50230-50283) **[O]**: listeners are kept in `this._ = {name: [ {e, name, fn, ctx} ]}`. `on` returns the ref object,
`off(name, fn)` filters by fn, `offref(ref)` removes that exact ref. `trigger` iterates a **copy** of the list and calls
`tryTrigger`, which catches any exception and rethrows it in `setTimeout(…,0)`. One bad listener therefore never breaks
the emitter or the others, and the error still reaches the console as uncaught.

Overlay back-stack `yM` (38985-39039) **[O]**: `history.back/forward/go` are patched per window to call
`onHistoryBack()` / `onHistoryForward()` on the top-most registered overlay. Menus, modals and (on desktop) the workspace
register. The workspace handler navigates the active leaf's history, so mouse buttons 3/4 (106700) and the Android back
button (107366) are routed the same way.

### 4. Keyboard: Scope, Keymap, hotkeys, commands, command palette

**Key normalisation** **[O]**:
- `hS(evt)` = `evt.key`, or a legacy keyCode table lookup.
- `pS(evt)` = "vkey" from `which/keyCode` via `sS`: letters upper-case, digits, `F1..F24`, `Numpad0..9`, punctuation such as
  `;` `=` `,` `-` `.` `/` `` ` `` `[` `\` `]` `'`. This makes hotkeys follow physical key positions, not layout characters.
  A special case maps the `^` dead key on `KeyI` back to `KeyI` (41713).
- Modifiers are compiled to a sorted comma string from `Ctrl`/`Meta`/`Alt`/`Shift`. `"Mod"` becomes `Meta` on macOS and
  `Ctrl` elsewhere (41742-41746). `decompileModifiers` reverses this.
- Match rule `Keymap.isMatch(binding, ctx)` (41766): `binding.modifiers === null` (any) or equal string, **and**
  `binding.key` is falsy (any) or equals `ctx.vkey`, or equals `ctx.key` case-insensitively.
- `Keymap.isModEvent(evt)` returns `"tab"` for a middle click or Mod, `"split"` for Mod+Alt, `"window"` for Mod+Alt+Shift
  (41770). This is how all "open in new X" clicks are decided.

**Scope** (41610-41647) **[O]**: `register(mods|null, key|null, fn)` returns a handler ref. `handleKey` walks handlers **in
registration order**:
- A handler returning non-undefined stops the walk and returns that value.
- A handler that matched specifically (not a catch-all) and returned undefined also stops the walk, and the parent is not
  consulted.
- Catch-alls `(null, null)` that return undefined fall through.
- With no match it delegates to `parent`.
- The Keymap calls `preventDefault()` + `stopPropagation()` only when the result is exactly `false`.

`gS` is a scope whose `handleKey` first asks a callback for a delegate scope. The workspace uses it to hand keys to the
active view's scope (106636). `setTabFocusContainerEl(el)` turns a scope into a soft focus trap (see Accessibility).

**Keymap** (41660-41776) **[O]**: a singleton. It listens for `keydown` (capture) and `focusin` on the main window.
`windowScopes: WeakMap<Window, {scope, prevScopes[]}>`. `pushScope` and `popScope` act on `activeWindow`'s stack (pop also
removes a scope buried in the middle). `setWindowBaseScope(win, scope)` is used for popouts. Popout keydowns reach this
listener because popouts **relay** keydown to the main window (see §8). `registerWindow` exists but is never called **[O]**.

The resulting scope tree **[O/I]**:
- Root scope = `app.scope`. The HotkeyManager registers a catch-all here.
- The Workspace scope (`gS`, parent root) is pushed at workspace construction. It delegates to `activeLeaf.view.scope` when
  the view defines one, which normally has the root as parent.
- Modals use `new Scope()` with **no parent**, so global hotkeys are dead while a modal is open; the modal registers what it
  needs. Menus use `new Scope(root)`, so hotkeys still work under an open menu.

**HotkeyManager** `dD` (46175-46278) **[O]**:
- `defaultKeys[id]` is fed by `addCommand({hotkeys})`. `customKeys` is a symbol-keyed private map persisted to
  `.obsidian/hotkeys.json` through `vault.writeConfigJson("hotkeys")`. A `raw` FS watcher reloads it with a 50 ms debounce.
- `bake()` flattens bindings into parallel arrays (`bakedHotkeys`, `bakedIds`). **Custom bindings first.** Defaults are
  included only for commands with no custom entry, so an empty custom array means "unbound". Binding `code` such as `"KeyA"`
  is normalised to `"A"`.
- `onTrigger` runs as the root-scope catch-all: the first baked match whose command exists (and is `repeatable`, if this is
  a key repeat) is executed. It returns `false` and stops if `executeCommand` returned true. `executeCommand` returns true
  even when a `checkCallback` decides not to act (R8 ignores the return value, 115116), so **the first matching binding wins
  even if its command is not applicable** **[I]**.
- `printHotkeyForCommand` and `cD` render with mac glyphs (⌘ ⌃ ⌥ ⇧ ← → ↑ ↓, joined by spaces) or `Ctrl + Shift + K` elsewhere.

Default hotkeys found (34 `hotkeys:` declarations, `Mod` = Cmd/Ctrl) **[O]**:

| Hotkey | Commands |
|---|---|
| Mod+P | `command-palette:open` |
| Mod+O | `switcher:open` |
| Mod+Shift+F | `global-search:open` |
| Mod+G | `graph:open` |
| Mod+, | `app:open-settings` |
| F1 | `app:open-help` |
| Mod+N | `file-explorer:new-file` |
| Mod+Shift+N | `…new-file-in-new-pane` |
| Mod+S | `editor:save-file` |
| Mod+E | `markdown:toggle-preview` |
| Mod+; | `markdown:add-metadata-property` |
| Mod+F | `editor:open-search` |
| Mod+H (mac: Mod+Alt+F) | `editor:open-search-replace` |
| Mod+K | `editor:insert-link` |
| Mod+B | `editor:toggle-bold` |
| Mod+I | `editor:toggle-italics` |
| Mod+/ | `editor:toggle-comments` |
| Mod+L | `editor:toggle-checklist-status` |
| Mod+D | `editor:delete-paragraph` |
| Alt+Enter | `editor:follow-link` |
| Mod+Enter | `editor:open-link-in-new-leaf` |
| Mod+Alt+Enter | `editor:open-link-in-new-split` |
| Mod+Alt+Shift+Enter | `editor:open-link-in-new-window` |
| F2 | `workspace:edit-file-title` |
| Mod+Shift+T | `workspace:undo-close-pane` |
| Mod+T | `workspace:new-tab` |
| Mod+W | `workspace:close` |
| Mod+Shift+W | `workspace:close-window` |
| Ctrl+Tab and Ctrl+PageDown (mac Cmd+Shift+]) | `workspace:next-tab` |
| Ctrl+Shift+Tab and Ctrl+PageUp (mac Cmd+Shift+[) | `workspace:previous-tab` |
| Mod+1..8 | `workspace:goto-tab-N` |
| Mod+9 | `workspace:goto-last-tab` |
| Mod+Alt+← / → | `app:go-back`, `app:go-forward` |

Locations: 145437-145746, 106925-107310, 70821-71420, 99763, 100417, 127283, 135259.

**Hotkey settings tab** `f3` (104862-105180) **[O]**:
- Capture mode pushes a parentless scope with a catch-all that turns the next chord into `{modifiers: decompiled, key:
  vkey}`. It **rejects** chords with no modifier unless the key is an F-key, and rejects Shift+letter alone. The new binding
  is appended to the existing (or default) list, deduplicated by printed form, and saved immediately.
- Conflict detection: a multimap from *printed* hotkey string (`cD`) to command names. Any binding shared by more than one
  command marks those commands. A "show conflicts" filter chip with a count badge appears.
- Filters: show-all / assigned / user-assigned / unassigned / conflicts. Filter-by-hotkey mode: press a chord and the list
  is filtered to commands bound to it.

**Commands** `B8` (115119-115188) **[O]**:
- `addCommand(cmd)`. `mobileOnly` commands are skipped on desktop.
- `editorCallback` / `editorCheckCallback` are wrapped into a `checkCallback`. The wrapper requires `workspace.activeEditor`,
  rejects reading mode unless `allowPreview`, rejects while the inline title or view title is focused, and rejects inside the
  properties block unless `allowProperties`.
- The command is stored in `commands[id]` (editor commands also go to `editorCommands`). Default hotkeys are registered and
  `"changed"` is triggered.
- `listCommands()` filters by `checkCallback(true)` inside try/catch.
- `executeCommand` sets `app.lastEvent` and calls `checkCallback(false)` or `callback()`.
- Command shape: `{id, name, icon?, callback?, checkCallback?, editorCallback?, editorCheckCallback?, hotkeys?, repeatable?,
  mobileOnly?, showOnMobileToolbar?, allowPreview?, allowProperties?}`.

**Command palette** (127266-127447) **[O]**:
- A `FuzzySuggestModal`. Item order is pinned commands (`options.pinned`, kept in pinned order), then the rest sorted by
  `Intl.Collator` (numeric, base sensitivity), then stably re-ranked by recency.
- `recent-commands` is kept in localStorage `<appId>-recent-commands`, capped at 100, most-recent-first.
- The fuzzy score gets a `+ name.length / 10000` tie-break. Display splits `"Plugin: Action"` into a prefix span and title,
  shows hotkeys as `<kbd>`, and shows a pin flair.
- Tab is swallowed. Instructions footer reads ↑↓ / ↵ / esc.

**Native menubar** `OS` (42724-42829) **[O]**: a template of `appCommand` ids (File / Edit / Insert / Format / View / Window /
Help, plus "Obsidian" on mac). Accelerators come from the user hotkey or the default via `LS` (`Mod` → `CommandOrControl`);
`registerAccelerator: false` lets the renderer keymap keep ownership. Commands that are not registered are hidden. The
template is sent over IPC `set-menu` (`main.js:5206`), and check/enable state is patched through `update-menu-items`.

### 5. Workspace layout model

**Tree classes** **[O]**:

```
Workspace
 ├─ leftRibbon / rightRibbon (WorkspaceRibbon, not tree items)
 ├─ leftSplit  : WorkspaceSidedock (direction "horizontal", side "left")  | mobile: WorkspaceMobileDrawer
 ├─ rootSplit  : WorkspaceRoot  (extends WorkspaceContainer extends WorkspaceSplit; direction forced "vertical")
 ├─ rightSplit : WorkspaceSidedock (side "right")
 └─ floatingSplit : WorkspaceFloating
        └─ WorkspaceWindow* (extends WorkspaceContainer; one per popout BrowserWindow)
WorkspaceSplit → children: WorkspaceSplit | WorkspaceTabs
WorkspaceTabs  → children: WorkspaceLeaf
```

- `WorkspaceItem` (55490):
  - Fields: `id` (16 random hex chars, `Ub(16)`), `type`, `parent`, `containerEl`, `dimension`, and its own `component`
    (always loaded).
  - Every item creates a `<hr class="workspace-leaf-resize-handle">`. Drag uses pointer capture; a double click/tap resets
    all sibling dimensions to `null` (equal).
  - `dimension` is a **percentage applied as `flex-grow`**; values outside (0,100) become `null`.
  - `getRoot()` walks to the top. `getContainer()` returns the nearest `WorkspaceContainer` (root or popout window).
- `WorkspaceParent` (55561): `insertChild`, `replaceChild`, `removeChild`.
  - With `autoManageDOM` on, these also move DOM. Tabs turn it off and render children themselves.
  - **Collapse rules**: a parent left with one child is replaced in its own parent by that child (which inherits the parent's
    dimension), unless `allowSingleChild`. A parent left with zero children removes itself. Splits collapse; Tabs, Containers
    and Floating allow a single child.
  - Every mutation calls `workspace.onLayoutChange(item)`, which queues `recomputeChildrenDimensions` and a
    microtask-coalesced `updateLayout` (`Yl`, 108601-108646).
- `WorkspaceSplit` (55620):
  - `direction` is `"vertical"` (children side by side) or `"horizontal"` (stacked); CSS class `mod-vertical|mod-horizontal`.
  - Resizing measures all children into px, distributes the delta across the siblings before or after the handle with a
    **200 px minimum each**, and on pointerup converts back to percentages, then `requestSaveLayout` and `requestResize`.
  - RTL flips the delta. Mobile adds "proximity resize": touches near a handle start the resize (55637).
- `WorkspaceSidedock` (55748):
  - Pixel `size` (default 300, minimum `qO` = 200). The edge handle drags the width up to 80% of the workspace; dragging
    below 50 px collapses, and dragging past 200 px while collapsed expands.
  - `collapse` / `expand` animate width over 140 ms using `--anim-motion-swing`, setting child `minWidth` during the
    animation to stop reflow.
  - Collapsing moves the active leaf to the most recent root leaf. An empty dock shows "empty sidebar" text and collapses;
    an empty right dock also hides the right ribbon.
- `WorkspaceContainer.onFocus` (55883): when the window gains focus, it activates that container's most recent leaf after
  100 ms, unless a modal is open.

**Logical sides and RTL** (42420-42428) **[O]**: `left`/`right` map to `primary`/`secondary`. The physical side is computed
with the RTL flag, and `AS(side, "mod-{side}")` emits both logical and physical classes.

**Workspace** `L3` state (106634): `leftSplit`, `rightSplit`, `rootSplit`, `floatingSplit`, `leftRibbon`, `rightRibbon`,
`activeLeaf`, `activeTabGroup`, `layoutReady`, `undoHistory` (closed tabs, max 10), `recentFileTracker`, `hoverLinkSources`,
`editorExtensions`, `_activeEditor`, `layoutItemQueue`. Throttles:
- `requestSaveLayout = debounce(saveLayout, 1000)`. `Gl` without the reset flag is a trailing throttle: it fires 1 s after
  the *first* call **[O]**.
- `requestResize` (0 ms), `requestActiveLeafEvents` (0 ms), `requestLayoutChangeEvents` (10 ms), `requestUpdateLayout`
  (microtask).

**Key operations** **[O]**:
- `getLeaf(paneType)` (108219):
  - `"split"` → `splitActiveLeaf`.
  - `"tab"` / `true` → `createLeafInTabGroup()`. Inserts after the most recently active tab of the group; reuses it if it is
    an empty "New tab"; focuses it only if config `focusNewTab`.
  - `"window"` → `openPopoutLeaf()`.
  - `false` / undefined → `getUnpinnedLeaf()`: the active leaf if navigable and not pinned, otherwise the most recently
    active *visible* navigable leaf in the same container, otherwise a new leaf appended to the most recent leaf's group.
- `splitLeaf(target, newItem, direction, before)` (108142): walks up to the nearest Split. If the direction differs, the
  target is wrapped in a new Split carrying its dimension; if it matches, the dimension is halved between the two. A bare
  leaf is always wrapped in a new Tabs.
- `duplicateLeaf(leaf, "vertical"|"horizontal"|paneType)` copies view state, ephemeral state and **history**.
- `revealLeaf(leaf)` (108563): expands a collapsed sidedock (on mobile it opens the drawer and closes the opposite one),
  selects the tab, **flashes the tab header** (`is-flashing` for 750 ms) if anything changed, focuses the container (only
  if the workspace already has focus), and awaits `loadIfDeferred()`.
- `ensureSideLeaf(type, side, {active, split, reveal=true, state})` (108371) is the idempotent "make sure this sidebar view
  exists" helper.
- `setActiveLeaf(leaf, {focus})` (108276): toggles the `mod-active` classes, stamps `activeTime = Date.now()`, selects the
  tab, updates the window title, optionally `focusLeaf` (focus container, then `setEphemeralState({focus:true})`; it also
  closes the settings modal when it lives in that window), and requests leaf events. These emit `active-leaf-change` and,
  when the active *file* changed, `file-open` plus the recent-file update.
- `getAdjacentLeafInDirection(leaf, dir)` (108506): first hit-tests `elementFromPoint` 5 px outside the tab group's rect,
  then falls back to tree walking. Used by `editor:focus-top/bottom/left/right`.
- `updateLayout` (108607): drains `recomputeChildrenDimensions`, recreates an empty root tab group if the root emptied
  (stacked if the last one was), repairs a detached active leaf, **dissolves link groups that have only one member**,
  updates frameless spacing, title, save, resize, and `layout-change`.
- `updateFrameless` (108666): marks top-row tab groups `mod-top`, adds left/right space for the window controls, and
  animates the sidebar toggle buttons into the first or last tab header strip depending on ribbon visibility, titlebar style,
  RTL and fullscreen.
- Escape on the window (106640): if the focused leaf is not navigable, focus jumps back to the most recent navigable leaf;
  in source mode the editor is refocused.
- Undo close tab (107120): `detach` pushes `{leafId, state, eState, parentId, rootId, leafHistory}`. Undo re-creates the leaf
  with the **same ids** inside the original tab group, if it still exists.

**Tab groups** `eF` (56010-56508) **[O]**:
- DOM: `.workspace-tab-header-container` (new-tab "+" button, spacer, tab-list chevron dropdown) and
  `.workspace-tab-container` (leaf contents).
- Only the current leaf is displayed, unless stacked. The wheel scrolls headers horizontally.
- **Tab width locking**: closing a tab with the mouse freezes all header widths, so the next close button lands under the
  cursor. Widths are released on mouseleave, or after 1 s for touch. The same trick browsers use.
- New and removed headers animate width and opacity over 200 ms. Removed headers are cloned so they animate out after the
  real node has gone.
- The tab-list menu offers stack/unstack, close all, and a checked list of tabs. It fires `tab-group-menu`.
- **Stacked tabs** (`setStacked`, `updateSlidingTabs`, `onContainerScroll`): headers become vertical spines (CSS
  `writing-mode: vertical-lr`). Each pane is absolutely offset by the cumulative header widths, with `minWidth = max(300,
  containerWidth - totalHeaderWidth) / n` and `maxWidth = max(300, …)`. Panes fully scrolled out of view get `is-hidden`.
  `scrollIntoView(index)` smooth-scrolls to reveal a pane. Phones cannot stack (`Platform.canStackTabs`).
- Drop target on the header strip: external OS files (opened as tabs if inside the vault), Obsidian files, links and
  bookmarks. Dropping on the middle 50% of an existing navigable tab opens it *in* that tab; anywhere else inserts new tabs.

**Leaf** `nF` (56589-57077) **[O]**:
- Fields: `view`, `history`, `group`, `pinned`, `activeTime`, `working` (re-entrancy lock), `tabHeaderEl`, `resizeObserver`.
- Tab header DOM: `.workspace-tab-header.tappable[draggable]` > inner icon / title / status container / close button. It
  supports middle-click close, context menu (`onOpenTabHeaderMenu` with sections title / close / pane / open / action / find /
  info / info.copy / view / view.linked / system / danger) and hover → `hover-link` (page preview).
- Header tooltip = display title truncated to 100 characters with a 300 ms delay.
- The ResizeObserver calls `view.onResize()`, debounced 20 ms, only when the size really changed.
- `focusin` or a capture-phase `pointerdown` anywhere inside makes the leaf active.

`setViewState(vs, eState)` (56798) **[O]**:
1. If `working`, it is ignored.
2. If the type changed, or the current view is deferred, it chooses the view to open:
   - A **DeferredView** placeholder when there is no previous history state, the request carries `icon` and a `title`, and
     the leaf is **not shown**.
   - Otherwise the registered factory. A throwing factory gives `UnknownView`; an unregistered type gives `UnknownView`, or
     `EmptyView` for `"empty"`.
3. `open(view)` closes the old view (awaited, except for empty and deferred), resets the container to just the resize
   handle, and opens the new one.
4. `view.setState(state, result)`. Views can set `result.history`, `result.layout`, `result.close`, `result.done`.
5. Closes the leaf if requested, activates it if `vs.active`, sets the group, applies the ephemeral state, records history
   (unless `popstate` or `state.sync`), fires layout-change and updates the header.

Serialised view state is `{type, state, pinned?, icon, title}`. Icon and title are stored *so a deferred placeholder can draw
its tab without loading the view*.

**Deferred views** `rI` (51226) **[O]**: they hold `viewType`, `icon`, `title`, `state`, `estate`. `rerender()` turns the
placeholder into the real view through `leaf.setViewState`. It runs when:
- the container is inserted or un-hidden (`onNodeInserted`),
- the placeholder is clicked,
- `loadIfDeferred()` is called by `revealLeaf`, `ensureSideLeaf`, stacked-tab display, tab selection while visible, or the
  start of a tab drag.

At layout load every *visible* leaf is un-deferred, with a 10 s timeout each (107652). Startup telemetry counts deferred
views (145357).

**Per-leaf history** `tF` (56508-56589) **[O]**:
- `backHistory` and `forwardHistory` of `{title, icon, state: viewState, eState}`. `pushState` clears forward and emits
  `history-change`.
- `go(n)` pops between the stacks and replays with `setViewState({...state, popstate:true}, eState)`. It refuses (Notice
  "tab busy") while the leaf is `working`.
- `recordHistory` skips a push whose state JSON equals the top entry.
- The cap is meant to be 20, but the code calls `unshift()` with no arguments, which is a no-op instead of `shift()`. **In
  practice the back stack is unbounded** **[O]**.
- History is **not** written to workspace.json; leaf serialisation omits it **[O]**, so it is lost on restart. It is kept
  across `duplicateLeaf` and undo-close.
- Vault renames rewrite file paths inside every leaf history and the undo stack (106752-106777).

**Pinning and linked groups** **[O]**:
- `pinned` hides the close button, shows a pin icon, and makes `canNavigate()` false, so links open elsewhere.
- `group` is a random 16-hex id shared by linked leaves. `setGroupMember(other)` creates the id on demand. Pinning
  propagates to all members.
- `FileView.syncState()` pushes the current file to the other group members (`receiveSyncState` → `openFile`, 55186-55196).
  This is how "linked" outline and backlinks views follow the editor.
- "Link tab" interaction (`onStartLink`, 108055): mousemove highlights a target leaf with the drop overlay; mouseup links it.
- A link icon in the header unlinks; hovering it highlights all members.

**Recent files** `P3` (106547-106620) **[O]**:
- `lastOpenFiles` is an MRU list of paths. On each file-open the new path goes to the front, then the old list is re-added
  with per-category caps **md 25, canvas 10, image 10, other 10**.
- Updated on create and rename. `getRecentFiles({showMarkdown, showNonAttachments, showNonImageAttachments, showImages,
  maxCount=10})`. Saved inside workspace.json.

**Ribbon** `E3` (106279-106400) **[O]**: items `{id, icon, title, callback, hidden}`. Buttons are
`div.clickable-icon.side-dock-ribbon-action` with a tooltip on the right (300 ms delay). Drag reordering uses `GC`.
Right-click on empty ribbon space opens a checklist to show or hide items, plus "hide ribbon". The order and hidden map are
serialised as `left-ribbon.hiddenItems` (object key order = item order). Desktop gets mouse-move auto-scroll (`ME`).

### 6. Views and ViewRegistry

- `View` (42429):
  - `containerEl = leaf.containerEl.createDiv("workspace-leaf-content")` with `data-type`.
  - `open(parent)` appends the element, calls `load()` (a failure is only logged) and awaits `onOpen()`.
    `close()` detaches, calls `unload()` and awaits `onClose()`.
  - `getState`/`setState`, `getEphemeralState`/`setEphemeralState`, `getIcon` (default `lucide-file`), `navigation` flag,
    `onResize`, `onPaneMenu`, `onHeaderMenu`, `onTabMenu` (close / close others / close to the right / close all, skipping
    pinned), `handleCut/Copy/Paste` (window-level clipboard events are routed to the active view, 106708-106721).
- `ItemView` (42564) **[O]**:
  - Header: `view-header` > left nav buttons (back / forward with `aria-disabled` kept in sync with history), title
    container with breadcrumbs and title (fade masks while scrolled), and `view-actions`. `addAction(icon, title, cb)`
    prepends a `<button class="clickable-icon view-action">` with a tooltip; `mousedown` is prevented so focus stays in the
    editor.
  - "More options" builds a sectioned Menu: close / pane / open / action / find / info / info.copy / view / view.linked /
    system / "" / danger, with submenus for copy-path and linked views, and fires `leaf-menu`.
  - Drops onto the view header (or anywhere with Alt, Shift on mac, or when `canDropAnywhere`) open the dropped file in
    this leaf.
- `FileView` (55076): `file`, `allowNoFile`. `setState({file})` → `loadFile` (`onUnloadFile` old, then `onLoadFile` new; on
  error a Notice and `file = null`). It renders breadcrumbs: a click reveals the folder in the file explorer; right-click is
  a folder menu; folders are draggable. Rename refreshes the title. Delete goes back in history, otherwise empties and
  detaches. `canAcceptExtension(ext)` lets a view keep its own type when opening other extensions.
- `EditableFileView` (96917): the title is `contenteditable` for inline rename. Enter saves, Esc reverts, Tab or ↓ go into
  the content. Validation errors show as a tooltip (`M0`). Breadcrumbs animate out while editing.
- `TextFileView` (103729) **[O]**:
  - `data`, `lastSavedData`, `dirty`, `saving`, `saveAgain`. `requestSave` is a 2 s debounced save.
  - `save()` waits for the adapter's pending promise, then calls `vault.modify`. On failure it shows a persistent Notice and
    stores a backup through `fileManager.storeTextFileBackup`.
  - External `modify` while dirty triggers a **three-way merge** (`e2(lastSaved, current, disk)`) with a Notice. When not
    dirty it simply reloads.
- `ViewRegistry` (104042) **[O]**: `viewByType{}` and `typeByExtension{}`. Re-registering throws. Events `view-registered`,
  `view-unregistered`, `extensions-updated`. Built-in bindings:

  | Extensions | View |
  |---|---|
  | `md` | `markdown` (L8) |
  | `bmp png jpg jpeg gif svg webp avif` | image (A0) |
  | `mp3 wav m4a 3gp flac ogg oga opus` | audio (T0) |
  | `mp4 webm ogv mov mkv` | video (J0) |
  | `pdf` | pdf (Q0) |
  | (no extension) | `release-notes` |

  Core plugins register the rest. When a type is (un)registered, every leaf of that type is rebuilt (open EmptyView, then
  setViewState) so plugin reloads hot-swap views (106778-106801).

### 7. Drag and drop

`DragManager` `AR` (61922-62222) **[O]**:
- Drag sources call `handleDrag(el, evt => draggable)` or `onDragStart(evt, draggable)`. A draggable is
  `{type: "file"|"folder"|"files"|"link"|"bookmarks"|…, icon, title, file?, files?, linktext?, sourcePath?, source}`.
- Text and URI data are always set on `dataTransfer` (`obsidian://open?...` URLs or a `-` placeholder), so drops into
  external apps work.
- A custom `.drag-ghost` (icon + title + "action" line) follows the pointer. The native drag image is blanked by `PR`.
- Drop targets call `handleDrop(el, (evt, draggable, isOver) => result)`. The callback runs on every dragover with
  `isOver = true` (preview) and once on drop. It returns `{action?: label shown in the ghost, dropEffect, hoverEl?,
  hoverClass?}` or undefined. The manager applies the hover class and the shared `.workspace-drop-overlay` rectangle.
- Dragover is "first handled wins": a capture listener resets the state and a microtask clears it if nobody handled it.
- Edge auto-scroll: near the top or bottom third (≤50 px) of any scrollable ancestor.

**Tab/leaf drag** (`onDragLeaf`, 107857-108053) **[O]**:
- A 5 px movement threshold; the source leaf is un-deferred.
- Drop zones from `getDropDirection`: the nearest edge within 33% of the target's width or height becomes
  left/right/top/bottom, otherwise center. The highlighted preview strip is `max(dim/3, 40)` px thick (108100-108133). For tab groups, "top" counts only within
  the top third of the header height, and the header strip is center (an insert position computed from header midpoints).
- Sidebars restrict some directions. Collapsed sidebars accept drops on their toggle buttons.
- **Preview**: the target container is *cloned* into a fake overlay wrapped in replicas of its ancestors' class chain, so CSS
  matches. The real target is set to opacity 0 and the fake shrunk to show where the split will land.
- On drop: center on tab headers moves the tab; center on another group *swaps* the leaf with that group; edges call
  `splitLeaf`. Dragging out of the window (a dragleave with no relatedTarget, then dragend) on desktop **creates a popout
  window** at the cursor with the leaf's size and zoom.

The file tree has its own drop logic (`dO`/`yO`): insertion before or after an item by its midpoint. Hovering over a
collapsed folder for 750 ms expands it **[O]**.

### 8. Popout windows

`WorkspaceWindow` `x3` (106422-106543) and `p0` (96490) **[O]**:
1. `window.open("about:blank", "_blank", "popup,width=…,height=…,x=…,y=…,background=#rrggbb[,parented=1]")`. The main process
   `setWindowOpenHandler` (`main.js:4259-4287`) allows only `about:blank` with `popup` features. It creates a BrowserWindow
   with the same frame and titlebar style, `nodeIntegration`, `contextIsolation: false`, **`affinity: "main-window"`** (same
   renderer process), `show: false`, and the parent's background colour to avoid a white flash.
   `parented=1` makes it a child window; only modal popouts (`u3`, 104488) pass it, and only while the main window is
   fullscreen. Workspace popouts (106432) never do.
2. Because it shares the process and is same-origin, the main window holds the popout's `Window` and **builds its DOM
   directly from the main realm**. A `<base href=main location>` keeps relative URLs (fonts, `app://`) resolving.
3. `w0` evals `enhance.js` into the popout realm. `h0` adds electron and a `window.open` patch, and installs the frameless
   titlebar. `jM` adds tooltips. `woe` adds the logo menu. `b0` adds the focus class. `gb` sets lang and RTL. `m0` relays
   events. `y0` mirrors styles.
4. **Event relay `m0`**: `fullscreenchange, click, contextmenu, auxclick, keydown, keyup, mousedown, mouseup, mousemove,
   copy, paste, cut, drag*, drop, open-url` are re-dispatched on the main window as clones (`g0`). The clones have
   `isRelayed = true`, `target`/`currentTarget` proxied to the originals, and `preventDefault`/`stopPropagation` forwarded.
   App-wide listeners (Keymap, DragManager, Menu click-outside) work unchanged.
5. **Style mirroring `y0`** (96556-96650):
   - Clones every `<style>` and `<link type=text/css>` from the main `<head>`. It skips CodeMirror 6's `ͼ`-prefixed style
     module, which CM6 mounts per document itself. MathJax's CSSOM-built sheet is serialised from `cssRules`.
   - Mirrors body classes, except window-local `is-frameless`, `is-focused`, `is-fullscreen`; adds `is-popout-window`.
   - Mirrors every inline body custom property, except `--zoom-factor` and `--keyboard-height`; copies the root font-size.
   - A MutationObserver on head (childList / subtree / characterData / `data-change` attribute) and on body (class / style)
     keeps it live. A WeakMap caches clones; a changed node is re-cloned.
6. Focusing the popout sets `activeWindow` and `activeDocument`. **All code that creates floating UI (menus, notices,
   tooltips, modals) appends it to `activeDocument.body`.**
7. Popout `history.*` is forwarded to the main window. Closing (`beforeunload` / `pagehide`) detaches the leaves, unloads
   the component, cleans up the style relay and fires `window-close`. The window title follows its most recent leaf.
   `requireApiVersion`-style gate `I3`: needs the desktop app and installer API ≥ 13.
8. Serialised as `{type:"window", x, y, width, height, maximize, zoom, …split fields}`. Size has a floor of 600×600 when
   restored from `size`.

Modals can also be popouts (`u3`, 104411): the settings modal opens in its own window when `settingsPopoutWindow` is on,
which it is by default (observed at runtime in a fresh profile: Settings opened as an `about:blank` popout window titled "Settings - <vault> - Obsidian"). Default 900×700, minimum 600×400. Position is remembered under a localStorage key only if it still
intersects a display's work area; otherwise it is centred on the main window. Mod+W closes it.

### 9. Menus

`Menu` `ES` (41903-42313) and `MenuItem` `bS` (41794) **[O]**:
- Item builder: `setTitle(string|fragment)`, `setIcon`, `setChecked` (adds a `lucide-check` icon and `mod-checked`),
  `setDisabled` (`is-disabled`), `setWarning`, `setIsLabel`, `setSection(id)` (`data-section`), `setSubmenu()` (lazily
  creates a child Menu and a chevron), `onClick`.
- **Sections**: `addSections([...])` declares the order; items in undeclared sections are appended in first-seen order.
  Separators are inserted between section *families* (prefix before the first `.`). `setSectionSubmenu("info.copy", {title,
  icon})` folds a whole section into one submenu item. Trailing separators are removed. Items render into `.menu-group`s.
- Plugins add items to well-known section names through events such as `file-menu`, `editor-menu` and `leaf-menu`, and
  ordering stays deterministic. This is the main extensibility trick of the menu system **[I]**.
- `showAtPosition({x, y, width?, overlap?, left?}, doc)`: sorts, hides tooltips, pushes the overlay back-stack, loads on the
  next tick (registering click-outside, contextmenu-hide and scope push), positions with flip-left and flip-up within the
  body (respecting `--safe-area-inset-top`), adds mouse-move auto-scroll (`ME`). On phones it becomes a bottom sheet with a
  150 ms slide animation and swipe-to-dismiss. `Menu.forEvent(evt)` makes one menu per event (WeakMap) and shows it on the
  next tick, so several listeners can add items to the same context menu.
- **Native menus**: when `Platform.isDesktop && useNativeMenu`, the item tree becomes an Electron `Menu.buildFromTemplate`
  (labels escape `&`, checkboxes when `checked` is boolean, submenus recursive). It pops up at coordinates scaled by
  `1.2^zoomLevel`, and `menu-will-close` hides the JS menu. Config `nativeMenus` defaults to `null` = on for macOS, off
  elsewhere (145935-145938). `setShowMacWritingTools` passes `frame` so macOS adds Writing Tools.
- Keyboard: ↑/↓ cycle over enabled items (wrapping), → opens a submenu and selects its first item, ← closes a submenu,
  Enter activates, Esc closes. Hover selects. Submenus open after 250 ms (immediately on click) and are positioned beside
  the parent item. `parentEl` gets `has-active-menu`, which callers use to toggle the menu instead of reopening it.
- DOM: `div.menu > div.menu-grabber + div.menu-scroll > div.menu-group > div.menu-item.tappable(.selected)`, plus
  `div.menu-separator`, plus a `.suggestion-bg` backdrop (opacity 0.85 on desktop). **No ARIA roles and no DOM focus**:
  selection is a CSS class only **[O]**.

### 10. Modal, SuggestModal, Notice, tooltips, icons

**Modal** `ST` (44470-44666) **[O]**:
- DOM: `.modal-container > .modal-bg + .modal > (.modal-header-button.clickable-icon "x") + .modal-header > .modal-title`
  and `.modal-content`.
- `open()` runs, in order:
  1. Remember selection and focus, including the `:focus-visible` state and focus inside iframes.
  2. Blur the active element and clear the selection.
  3. Push its parentless scope (Esc → `onEscapeKey` → close).
  4. Append to `activeWindow.document.body`.
  5. `onOpen()`.
  6. Dim the background (`bgOpacity` 0.85).
  7. Close menus and tooltips.
  8. Push the back-stack.
  9. Focus the first focusable element in the modal if the device has a physical keyboard and `hasInitialInputFocus`.
- `close()` pops the scope and restores selection and focus, keeping the `focusVisible` flag (`focus({focusVisible})`).
- On mac, backdrop clicks only close when the pointer moved less than 5 px. On phones the modal opens as a sheet with
  swipe-to-dismiss (`vM`). Settings: `canDismiss()`, `setCloseCallback`, `setDimBackground`, `setBackgroundOpacity`.

**ConfirmationModal** `TT`: title, content, buttons with cta / warning, `addCancelButton`. **[O]**

**Suggest chooser** `IT` (44877) **[O]**:
- Keys: ↑/↓ (wrap), Ctrl+P/Ctrl+N, PageUp/PageDown (computed from row height and visible rows), Home/End, Enter (ignored
  while IME-composing).
- Mouse: `mousemove` selects when `selectOnHover`, click / auxclick uses the item.
- Selection is the `is-selected` class plus `scrollIntoView({block:"nearest"})`, only for keyboard-driven changes.
- `onSelectedChange` hook. `LT` adds `suggestion-group` containers per group.

**SuggestModal** `OT` (45063): replaces `.modal` with `.prompt` > `.prompt-input-container` (an `input.prompt-input` with
autocapitalize off, spellcheck false, `enterkeyhint`; a clear button that clears, or closes when already empty), plus
`.prompt-results` and an optional `.prompt-instructions` footer. Results are capped at `limit = 100`. `getSuggestions` may
return a Promise. `FuzzySuggestModal` uses `prepareQuery`/`fuzzySearch`, `sortSuggestions` and `renderMatches` highlighting.
**[O]**

**Theme quick-switcher** `aD` (46105): **live preview** while moving through the list with the keyboard (debounced 100 ms),
revert on Esc, a "currently active" flair. A pattern worth copying. **[O]**

**Notice** `zT` (45175-45246) **[O]**:
- One `.notice-container` per window, created lazily and removed when empty. `new Notice(msg|fragment, ms = 4000)`;
  `0` means it stays until clicked.
- Slides in from 350 px right on desktop (from the bottom on mobile). Hover pauses auto-hide, and it resumes 1 s after
  mouseleave. Click dismisses. `addButton(text, cb)` creates `.notice-cta` **divs**. Hide animates opacity and collapses
  margin-top over 120 ms.

**Tooltips** (41361-41495) **[O]**:
- **Any element with `aria-label` gets a tooltip**, through delegated `pointerover`/`pointerout` on `body` per document
  (`jM`).
- `setTooltip(el, text, {placement, classes, delay, gap})` writes `aria-label` plus `data-tooltip-position|classes|delay|gap`.
  `aS(el, fn)` registers a lazily computed text and sets `aria-label=""` (see a11y issues).
- CSS opt-out: `--no-tooltip: true` on the element.
- Default delay `HM` = 1000 ms. Tabs and ribbon use `VM` = 300 ms. A tooltip shown within `zM` = 100 ms of the previous one
  hiding appears immediately (warm mode).
- `displayTooltip` positions `.tooltip` with `.tooltip-arrow` bottom/top/left/right at gap 8 px, clamps to the viewport and
  moves the arrow to compensate. Hidden on pointerup, menu open and modal open.
- Mouse only: no focus or keyboard trigger.

**Icons** (39110-41360) **[O]**:
- **Lucide** is embedded as a compact table `wM`: **1,935 icons**, each a list of tuples `[0 line | 1 circle | 2 polyline |
  3 polygon | 4 ellipse | 5 rect | 6 path, …args]`, expanded by `MM` into `<svg width=24 height=24 viewBox="0 0 24 24"
  fill=none stroke=currentColor stroke-width=2 round caps/joins>`.
- `SM` holds ~152 legacy aliases (`"search-glyph" → "search"`, `"graph-glyph" → "git-fork"`). `xM` holds 44 custom
  Obsidian glyphs (24-unit paths). `TM` holds plugin icons from `addIcon(id, svgContent)` with viewBox `0 0 100 100`.
- `getIcon(id)` resolves `lucide-<name>` → custom → `xM` → alias → lucide, builds once per id, caches in `AM`, and returns a
  `cloneNode(true)` with class `svg-icon <id>`.
- `setIcon(el, id)` is a no-op if the first child is already that icon; otherwise it replaces it.
- `getIconIds()` = `lucide-*` + plugin + custom ids (aliases excluded).
- The Lucide version is **[U]**; it includes recent icons such as `zodiac-*` and `a-arrow-down`.

### 11. Settings: Setting builder, components, declarative definitions, modal, search

**`Setting`** `rT` (43500) **[O]**: `div.setting-item[tabindex=-1]` > `.setting-item-info` (name, description) +
`.setting-item-control`.
- Builders: `setName`, `setDesc`, `setClass`, `setTooltip` (on the name), `setHeading`, `setDisabled` (cascades to
  components), `setNoInfo`, `setIcon`, `setErrorMessage` (`.setting-item-error` + `is-invalid`), `addDisplayValue`
  (value + warning status), `addButton`, `addExtraButton`, `addToggle`, `addText` (Enter blurs on touch devices), `addSearch`,
  `addTextArea`, `addMomentFormat`, `addDropdown`, `addColorPicker`, `addProgressBar`, `addSlider`, `addComponent`,
  `setNavigable(cb)` (chevron, row click), `setAction(cb)`, `setVisibility`, `clear`, `then`.
- **SettingGroup** `oT`: `.setting-group` with an optional heading row (heading text and/or extra buttons), a search slot,
  and `.setting-items`. `onDeleteItem(cb)`: Delete/Backspace on a focused row deletes it and focuses the nearest visible
  row. `onReorderItem(cb)`: **Alt+↑/↓ reorders the focused row**.
- **SettingPage** `aT`: a sub-page with titlebar and content, used for drill-down navigation.

**Components** **[O]**:

| Component | DOM and behaviour |
|---|---|
| Button | real `<button>`; async click adds `mod-loading`; `setCta`, `setWarning`, `setDestructive` |
| ExtraButton | `div.clickable-icon.extra-setting-button[tabindex=0]` + Enter/Space; removes tabindex when disabled |
| Toggle | `label.checkbox-container[tabindex=0]` around `input[type=checkbox][tabindex=-1]`; Space/Enter toggle; state shown by the `is-enabled` class |
| Text, Search, TextArea | `spellcheck=false`; Search is `input[type=search][enterkeyhint=search]` with a clear button |
| MomentFormat | live sample render |
| Dropdown | **native `<select>`**, auto-width through a hidden measuring select; `mouse-focus` class suppresses the focus ring after a mouse press |
| Slider | `input[type=range]` with optional value tooltip |
| ColorPicker | `input[type=color]` |
| ProgressBar | |

**Declarative settings (1.14)** (`F4.getSettingDefinitions`, renderer ~102606-102800) **[O]**:
- A tab returns a tree of definitions:
  - `{type:"page", id?, name, items?, page?()}` for drill-down pages, addressed by a path of page ids (duplicate sibling ids
    log an error).
  - `{type:"group", heading?, id?, items}` and `{type:"list", heading, emptyState, addItem:{name, action}, onDelete(i),
    onReorder(a, b), items}`.
  - Plain items: `{name, desc?, aliases?, visible?, searchable?, disabled?, control?:{type, key, …}, render?(setting),
    action?}`. Control types: `toggle, text, textarea, number, slider, dropdown, color, secret, file, folder`.
- `visible` and `disabled` may be values or functions, re-evaluated by `refreshDomState()` (`w4`/`k4`). A group hides when
  all of its items are hidden.
- `getControlBinding(key)` reads and writes `vault.getConfig`/`setConfig` by default; tabs override it (Appearance routes
  `baseFontSize` to `app.setBaseFontSize`).
- Rendering is a **keyed reconciliation** (`x4` with `tx`). Keys are `page:<id>`, `id:<id>`, `ctrl:<key>`, `name:<name>`,
  `item#i`, and duplicates log errors. Re-render keeps DOM and focus.
- The same definitions feed search. Imperative `display()` still works for plugins.

**Settings modal** `doe` (143911-144594) **[O]**:
- Two-pane `vertical-tabs-container`. Left: search box, search results, nav groups Options / Core plugins / Community
  plugins (plugin tabs sorted by collator). Right: `vertical-tab-content-container[tabindex=-1]`.
- A page stack with slide animations (`Jw`). Phones get swipe-back from the left 40 px edge and a back button in the title.
- Built-in tabs: `about`, `appearance`, `interface`, `editor`, `file`, `hotkeys`, `keychain`, `plugins`, `community-plugins`.
- **Keyboard model**:
  - Nav items and setting rows are `tabindex=-1` with roving focus. ↑/↓ or j/k move, `gg`/`G` jump to first/last (vim),
    Enter / → / l / Tab activate a nav item and move into content, ← / h / Shift+Tab go back to the sidebar, `/` and Mod+F
    focus search.
  - In the content, Tab follows a custom tab sequence over rows and their controls (`getTabSequence`).
  - Focus that falls onto `body` (because the focused node was removed) is pulled back to the content container.
- `openPagePath(tabId, path)` and `navigateToSearchResult` scroll to the setting and flash it (`is-flashing`).

**Settings search** `loe` (143778-143862) **[O]**: flattens every visible, searchable definition across tabs and pages. It
scores `prepareSimpleSearch(query)` against name, description text and aliases (max), and also matches tab and page names.
Results are grouped by (page || tab) and sorted by best score.

### 12. Trees and virtual lists

**Virtualizer** `uO` (53357-53621) **[O]**, used by the file explorer, search results, bookmarks, backlinks and similar
views:
- A tree of `hO`-like nodes `{el, childrenEl, pusherEl, vChildren: ZL, info:{height, width, childTop, childLeft, computed,
  queued, hidden, next}}`.
- **Incremental measurement**: `compute()` lays out at most `renderBlockSize = 50` unmeasured nodes per pass, measures them
  (height = distance to the next shown sibling, minus the children block for folders), and re-queues itself via
  `requestIdleCallback` with a 50 ms timeout until everything is measured. Unmeasured nodes use the **average measured
  height**.
- `updateVirtualDisplay`: the visible window is `[scrollTop - margin, scrollBottom + margin]` with `margin = max(0.25 ×
  viewport, 300 px)`. For each folder level it attaches only intersecting children (`setChildrenInPlace`), sets
  `pusherEl.style.marginBottom` to the summed height of skipped items above (a 1 px × 0.1 px spacer) and
  `childrenEl.minHeight` to the total height.
- Re-render on scroll happens only when it moved more than `max(viewport, 300)/2`. It handles CSS transforms (`yScale`) and
  RTL. "Cover" elements (sticky folder titles) get negative inline margins to span the indent.
- `scrollIntoView(node)` forces full computation (≤ 10 passes) and then scrolls.

**Tree controller** `pO` (53638-53869) **[O]**:
- Keys are registered on the view's Scope, so they work while the view is the active leaf:
  - ↑/↓ (plus Shift to extend the selection, plus Mod to open as you go), ←/→ (collapse/expand or move to parent or child).
  - Enter (rename on mac when renaming is supported, otherwise open), Space and Mod+Enter (open), F2 (rename).
  - Delete (mac: Mod+Backspace) deletes the selection. Esc clears the selection.
- Focus is **virtual**: a `has-focus` class on `focusedItem` (with `scrollIntoView`), not DOM focus.
- Multi-select: Alt-click toggles, Shift-click selects a range computed by tree order (`nO`).
- Folds persist in localStorage `<appId>-<id>-folds` (or `-unfold` when `prefersCollapsed`), with a 200 ms debounce.
  Search filter adds `is-filtered-out` and ancestors stay visible when a descendant matches.

### 13. Theming

**Token architecture** (`app.css`, 22,559 lines; ~1,177 custom properties defined, 1,139 referenced) **[O]**:
- **Palette** (`.theme-light` 2981 / `.theme-dark` 3031): `--mono-0/100`, eight hues `--color-red|orange|yellow|green|cyan|
  blue|purple|pink` (with deprecated `-rgb` triplets), and a neutral ramp `--color-base-00, 05, 10, 20, 25, 30, 35, 40, 50,
  60, 70, 100`. Dark `#1C1C1C → #dadada`, light `#fff → #222`.
- **Accent**: `--accent-h: 258; --accent-s: 88%; --accent-l: 66%` on body. Derived `--color-accent` and
  `--color-accent-1/2` shift hue down and multiply saturation and lightness, by different amounts per theme.
- **Semantic layers** (body): `--background-primary` (base-00), `--background-primary-alt` (10), `--background-secondary` (20),
  `--background-secondary-alt`, `--background-modifier-{hover (6.7% mono mix in oklch), active-hover, border (30),
  border-hover (35), border-focus (40), error, warning, success, form-field, cover, box-shadow, message}`; `--text-{normal
  (100), muted (70), faint (50), accent, accent-hover, on-accent (white), on-accent-inverted (black), error, warning,
  success, selection (accent mixed 20%/33%)}`; `--interactive-{normal, hover, accent, accent-hover, accent-hsl}`;
  `--caret-color`; `--divider-*`.
- **Scales**: spacing `--size-2-1/2/3` (2/4/6 px) and `--size-4-1…10` (4–40 px on a 4 px grid); radius `--radius-s/m/l/xl`
  4/8/12/24 px with `--corner-shape: round` (`superellipse(1.33)` on mac); icons `--icon-xs/s/m/l/xl` 14/16/16/18/32 px with
  matching stroke widths 2/2/2/1.75/1.25, `--icon-color*`, `--icon-opacity*`; UI fonts `--font-ui-smaller/small/medium/large`
  12/13/15/20 px; relative fonts `--font-smallest/smaller/small` 0.8/0.875/0.933 em; weights `--font-thin…black`;
  `--line-height-normal 1.5 / tight 1.3`; animation `--anim-duration-{none, superfast 70ms, fast 140ms, moderate 300ms,
  slow 560ms}` and `--anim-motion-{smooth, delay, jumpy, swing}`; shadows `--shadow-xs/s/l`, `--input-shadow(-hover)`;
  z-layers `--layer-cover 5, sidedock 10, status-bar 15, popover 30, slides 45, modal 50, notice 60, menu 65, tooltip 70,
  dragged-item 80`.
- **Component tokens**: about 60 families (`--tab-*` 46, `--nav-*` 36, `--bases-*` 77, `--metadata-*` 46, `--table-*`,
  `--callout-*`, `--button-*`, `--toggle-*`, `--slider-*`, `--modal-*`, `--menu-*`, `--tooltip-*`, `--notice-*`,
  `--titlebar-*`, `--ribbon-*`, `--status-bar-*`, `--scrollbar-*`, `--h1…h6-*`, …). Platform classes (`.mod-macos`,
  `.is-mobile`, `.is-phone`, `.is-ios`) override tokens, not rules.
- **Fonts** (app.css:3186) **[O]**: every slot is a chain `var(--font-X-override), var(--font-X-theme), var(--font-default)`.
  Unset slots hold the sentinel family `'??'`, declared with `@font-face { font-family: '??'; unicode-range: U+0 }`. It
  matches no character, so the browser falls through to the next family. User settings write `--font-*-override` inline on
  body; themes set `--font-*-theme`. Bundled: Inter variable (100–900, normal and italic), Source Code Pro, Flow Circular.
- **Dark/light**: config `theme` is `"obsidian"` (dark), `"moonstone"` (light) or `"system"` (default). `updateTheme`
  toggles body `theme-dark`/`theme-light` (on Linux it uses Electron `nativeTheme`) and emits `css-change`. `getTheme()`
  returns the id from the current class. The toggle command flips classes only when on "system", otherwise it changes the
  config. Transitions are disabled for 200 ms around a switch (`.no-transition`).
- **Accent colour** (145947-145979): config `accentColor` (hex) → HSL → body `--accent-h/s/l`. If its YIQ brightness
  (`(299R + 587G + 114B)/1000 ≥ 150`) says "light", `--text-on-accent` becomes the inverted (black) variant. This is not a
  WCAG contrast-ratio check **[O]**.
- **Font size and zoom**:
  - Base font size is stored **per device** in localStorage `<appId>-base-font-size`, seeded from config, clamped 10–30,
    default 16. It sets `--font-text-size` and `html { font-size: calc(Npx * var(--preferred-text-scale, 1)) }`.
  - Window zoom commands step the Electron zoom level by ±0.5; popouts inherit it.
  - Option `baseFontSizeAction` enables Ctrl/Cmd+wheel font sizing in the editor.
- Other body classes driven by config: `show-inline-title`, `is-floating-nav`, `auto-full-screen`, `show-view-header`,
  `show-ribbon`; `--indent-size` from `tabSize`.

**CustomCss manager** `oD` (45482-46105) **[O]**:
- Folders `<configDir>/themes/<Name>/{manifest.json, theme.css}`. A legacy layout `<configDir>/themes/<Name>.css` is still
  read ("(Legacy)") **[O]**. A manifest counts only if its `name` equals the folder name.
- Snippets: `<configDir>/snippets/*.css` (dotfiles ignored), sorted. Enabled set in config `enabledCssSnippets`. Active
  theme in config `cssTheme` ("" = default).
- One theme `<style>` is created in `<head>` at construction, after `app.css`. Snippet `<style>`s are inserted after it in
  order, so the cascade is app.css < theme < snippets.
- All reads and writes are serialised through a promise queue (`WT`). CSS text is cached per path and invalidated by the
  vault `raw` watcher. Theme file changes reload within 100 ms (theme list 2 s, snippets 100 ms): **live reload while
  editing a theme**. `css-change` and `resize` fire only when the text actually changed.
- Policy `Hx.themes` / `Hx.snippets` (`true` | allowlist array | `false`) gate loading and installing **[O]**.
- Community themes: the list is `obsidianmd/obsidian-releases/community-css-themes.json` (raw GitHub, 5 min cache). Install
  fetches `manifest.json` + `theme.css` from the repo's release assets for a version, or from `HEAD` on 404, and POSTs an
  anonymous download count once per theme. Update check compares manifest `version` (or legacy file content).
  Translucency: config `translucency` → Electron vibrancy (`vw`) + `is-translucent`.

### 14. Accessibility: what exists and what is missing

**Exists** **[O]**:
- **Keyboard command model**: almost every action is a command, so it is reachable from the palette and can be bound.
  Defaults cover tabs, splits, focus movement between panes (`editor:focus-*`), back/forward, and undo-close-tab.
- **Modal focus management**: initial focus on the first focusable element (only with a physical keyboard), a soft trap
  (`Scope.tabFocusContainerEl`: if focus lands outside the modal it is moved to the first focusable element inside, or blurred;
  41719-41729), Esc closes, previous focus, selection range and `:focus-visible` state are restored on close (44614-44625).
  Menus close on modal open.
- **Settings modal**: a full roving-focus keyboard scheme (arrows, j/k, gg/G, h/l, `/`, Mod+F), keyboard delete and reorder
  for list rows (Delete/Backspace, Alt+↑/↓), `:focus-visible` ring styles for rows, nav items and buttons, and
  `forced-colors` rules for setting-row and nav-item focus (app.css:5320, 10459).
- **Trees**: arrow-key navigation, expand/collapse, range selection, open/rename/delete keys. **Menus**: arrows, Enter, Esc,
  submenus. **Suggesters**: arrows, PageUp/PageDown, Home/End, Ctrl+N/P.
- Real `<button>` for view actions and Setting buttons, native `<select>` for dropdowns, `role="button" tabindex=0` on
  `text-icon-button` pills with Enter/Space (`oI`, `lE`). ExtraButton is `tabindex=0` with Enter/Space.
- `aria-label` on most icon-only controls (153 `setTooltip` (`oS`) call sites, used as name and tooltip). `aria-disabled` on nav buttons
  and some extra buttons. The `<html lang>` attribute follows the UI language.
- `prefers-color-scheme` drives the "system" theme. RTL UI layout (`mod-rtl`, logical sidebar sides). Font size is
  adjustable (10–30) and zoom is supported. A `focus-visible` design token style is used in 49 places.

**Missing or weak** **[O]** unless marked otherwise:
- **No dialog semantics**: modals have no `role="dialog"`, no `aria-modal`, no `aria-labelledby`. The modal close "x" is a
  `div` with **no label and no tabindex** (44488).
- **No menu semantics**: no `role="menu"`/`menuitem(checkbox)`, no `aria-haspopup`/`aria-expanded` on triggers. Menus never
  move DOM focus, so the screen-reader focus stays on the trigger while the visual selection moves. Opening a context menu
  from the keyboard depends on the browser's native contextmenu event (Shift+F10 / Menu key) reaching the listeners; there
  is no explicit handling **[I]**.
- **No listbox/combobox semantics** in suggesters and the command palette: no `aria-activedescendant`, `aria-selected` or
  `role=option`. Only CodeMirror's own autocomplete (82893-82911) and lint panel (102198-102206) have these.
- **No tree semantics** (`role=tree/treeitem`, `aria-expanded`, `aria-level`, `aria-selected`) in the file explorer and other
  trees. Their keyboard "focus" is a CSS class, so assistive technology sees nothing. Virtualisation also removes off-screen
  rows from the DOM without `aria-setsize`/`aria-posinset`.
- **No tablist semantics** for tab headers (`div.workspace-tab-header`, not focusable) or for the settings nav. No landmarks
  (`main`, `nav`, `complementary`). No skip links. No F6-style region cycling (no `"F6"` in the code).
- **No live regions**: `Notice` has no `role=status`/`aria-live`, so toasts are silent for screen readers. Notice buttons
  are `div.notice-cta` (not focusable). A 4 s auto-hide pauses on hover but not on focus. The only `aria-live` regions are
  CodeMirror's announcer and the PDF find bar.
- **Icon-only controls built as `div`/`span`**: 87 `createDiv`/`createSpan` calls with class `clickable-icon` (only
  ExtraButton's adds `tabindex=0`) versus 18 `clickable-icon` `<button>`s. Many (tab close,
  new tab "+", tab-list chevron, ribbon actions, nav header buttons, sidebar toggles, titlebar min/max/close) have no
  tabindex or role, so they cannot be reached with Tab. Commands are the only keyboard path to them.
- **Tooltips are pointer-only** (pointerover); keyboard focus never shows them. Because tooltips are driven by `aria-label`,
  the label text is constrained to tooltip copy. Dynamic tooltips (`aS`) set `aria-label=""`, which gives those controls
  (for example the sidebar toggles) an **empty accessible name** (41490-41494, 106653).
- **Toggle**: the visual state is the `is-enabled` class. `setValue` never updates the inner `input.checked` (43948),
  `setDisabled` only adds `is-disabled` (the input is never `disabled`), and the focusable element is the `label`; the
  input stays in the accessibility tree (CSS `opacity: 0`, app.css:10483). Screen readers may announce the wrong state
  **[I]**. The toggle is not associated with
  the setting name (no `aria-labelledby`), and setting rows do not link names or descriptions to controls
  (`aria-describedby` is unused outside CodeMirror).
- **Reduced motion is mostly ignored**: one CSS rule and one JS check, both only for the mobile startup sidebar-icon animation
  (app.css:3381; app.js:145267). Sidedock collapse (140 ms), tab add/remove (200 ms), menu sheets, notices, settings page
  slides and modal sheets all animate through `Gw` with no `prefers-reduced-motion` check.
- No `prefers-contrast` support and no high-contrast theme. `forced-colors` gets only 7 small blocks in Obsidian's own
  CSS (setting-row, settings-nav and modal-sidebar focus; active tab header outline; `button`, `select`/`.dropdown` and
  toggle borders, toggle on-state as `SelectedItem`; app.css:5320, 7509, 7592, 8023, 9411, 10459, 10603) plus 9 in the
  vendored pdf.js CSS. `clickable-icon` controls, menus, tree rows and notices get no forced-colors treatment. The
  accent on-text colour uses a YIQ threshold rather than a contrast ratio. Focus rings use `--background-modifier-border-focus`
  (a neutral grey), and their contrast is not guaranteed **[I]**.
- RTL sets a `mod-rtl` class and `lang` but **does not set `dir="rtl"`** on `<html>` (36319-36323) **[O]**, so bidi
  semantics rely on CSS **[I]**.
- Tree drag-and-drop and tab drag-and-drop have no keyboard alternative apart from commands (move file modal,
  split / move-to-window commands).

### 15. i18n

**[O]** Engine: vendored i18next.
- `i18next.init({fallbackLng: "en", ns: ["default"], defaultNS: "default", initImmediate: false, interpolation: {alwaysFormat:
  true, escapeValue: false, format}})`. The formatter localises numbers with `toLocaleString(lng)` and supports `lowercase`
  and `capitalize` (35265-35272). `escapeValue:false` is safe because strings go through `setText`.
- **Default strings**: `window.OBSIDIAN_DEFAULT_I18N` from `i18n.js` (about 2,666 leaf strings, nested camelCase objects).
  Before registration every key is converted camelCase → kebab-case (`Hy`: `startUp` → `start-up`, `_2` → `-2`).
- **Typed accessor `db`** (35376-35386): a recursive Proxy. Property access builds the dotted kebab path, a call does the
  lookup. `db.interface.startUp.loadingObsidian()` → `t("interface.start-up.loading-obsidian")`;
  `db.setting.msgValueAtLeast({min})` interpolates; `db.menuItems("fold-more")` looks up a raw sub-key. Developers write
  camelCase and get autocomplete; translators see stable kebab keys **[I]**.
- **Translation files**: `x/obsidian/i18n/mapping.txt` (2,601 keys, one per line) plus 50 `<lang>.txt` files, **line-aligned**
  with the mapping. Empty lines are untranslated and fall back to English. Escapes are `\n` and `\\`. Plurals use i18next
  v3 `_plural` keys (40 of them). Interpolation is `{{var}}`, most often `{{count}}` (87 uses). The `tb` options swap the
  interpolation delimiters to `{{{{…}}}}` to print literal `{{date}}` in help text.
- **Language detection**: localStorage `language`, else `navigator.language` if it is an exact match in the supported set
  (about 51 languages), else its base subtag, else `en`. `setLanguage` stores it (it clears the key only when English is
  chosen and the detected language is also English) and tells the main process via IPC `set-language`. The pack loads before App construction (the boot awaits `cb`).
  moment locale is set with fixes `zh → zh-cn`, `cz → cs`, `no → nb`. RTL languages: `ar dv fa ff he ks ku ur wo yi`. The OS
  RTL preference also sets `mod-system-rtl` for titlebar layout (55980).
- **Dev mode**: if `language` holds a file path, the file is loaded as a `.json` bundle or a `.txt` (`[key]` section plus
  `translation=` lines) as language `dev`. `window.selectLanguageFileLocation()` opens a picker. Help and website URLs are
  localised for a subset of languages (`Ry`, `By` lists).

### 16. Performance tricks worth noting

- **Deferred views** plus the **CSS-animation visibility event**: restoring 50 tabs costs one placeholder each **[O]**.
- `setChildrenInPlace` minimal DOM moves keep focus, scroll and iframes alive. `qE`/`jE` save and restore scrollTop of
  every scrolled descendant around DOM detaches, because detaching resets scroll (38425-38440) **[O]**.
- Window-aware debounce `Gl` (uses the active window's timers; `.run()` flushes, `.cancel()`). Microtask coalescing (`Yl`)
  for layout. Idle-callback scheduling (`SC`) for the virtualizer **[O]**.
- `Gw` batches style writes for all animations queued in the same tick into one forced reflow (a per-window queue flushed in
  one `setTimeout`, reading `offsetHeight` once) **[O]**.
- `.no-transition` during boot and theme switches. The phone boot paints the last note before plugins load **[O]**.
- Icons: build once per id, then `cloneNode`. Lucide is stored as tuples rather than SVG strings **[O]**.
- Perf marks `fI` form a hierarchical boot profile (`initialization.boot/language/electron/construct`, `vault.setup`, …)
  that can be inspected in debug info **[O]**.

---

## Data formats & on-disk files

### `.obsidian/workspace.json` (desktop) / `workspace-mobile.json` (mobile)
Written by `saveLayout` with `JSON.stringify(layout, null, 2)`, at most once per second, only after `layoutReady`.
Read errors fall back to `{}`, which builds a default layout opening the last file **[O]** (107488-107842).

```jsonc
{
  "main": {                                  // WorkspaceRoot (split, direction forced "vertical")
    "id": "a1b2c3d4e5f60718", "type": "split", "direction": "vertical",
    "children": [
      { "id": "…", "type": "tabs", "dimension": 50.5, "currentTab": 1, "stacked": true,
        "children": [
          { "id": "…", "type": "leaf", "pinned": true, "group": "9f…(16 hex)", "dimension": 33,
            "state": { "type": "markdown", "state": { "file": "Notes/A.md", "mode": "source", "source": false },
                       "icon": "lucide-file", "title": "A", "pinned": true } }
        ] }
    ] },
  "left":  { "id": "…", "type": "split", "direction": "horizontal", "width": 300, "collapsed": true,
             "children": [ { "type": "tabs", … } ] },
  "right": { … same shape … },
  "left-ribbon": { "hiddenItems": { "switcher:Open quick switcher": false, "graph:Open graph view": true } },
  "floating": { "id": "…", "type": "floating",
                "children": [ { "id": "…", "type": "window", "direction": "vertical",
                                "x": 100, "y": 80, "width": 900, "height": 700, "maximize": false, "zoom": 0,
                                "children": [ …tabs… ] } ] },
  "active": "<leaf id>",
  "lastOpenFiles": ["Notes/A.md", "Images/x.png", "…"]
}
```

| Field | Where | Meaning |
|---|---|---|
| `id` | all items | 16 random hex chars; reused by undo-close |
| `type` | all | `split`, `tabs`, `leaf`, `floating`, `window`, `mobile-drawer` |
| `dimension` | any child | flex-grow percentage; absent = equal share |
| `direction` | split / window | `vertical` = side by side, `horizontal` = stacked |
| `width`, `collapsed` | sidedocks | px width; collapsed flag |
| `currentTab`, `stacked` | tabs | omitted when 0 / false |
| `pinned`, `group`, `state` | leaf | view state also stores `icon` and `title` for deferred placeholders |
| `currentTab`, `pinned`, `pinnedSize` | mobile-drawer | mobile only |
| `x y width height maximize zoom` | window | popout geometry |

Load-time normalisation **[O]**: a bare leaf under a split is wrapped in tabs; empty containers are dropped; phones merge all
tab groups into one; popouts are only restored on desktop with API ≥ 13; failed view restores are logged and the leaf is
dropped if no view resulted.

### `.obsidian/hotkeys.json`
`{ "<command-id>": [ { "modifiers": ["Mod","Shift"], "key": "N" } ], "<command-id>": [] }`. An empty array unbinds. `key` is
the vkey (`"A"`, `"ArrowLeft"`, `"F2"`, `","`). A `code` field (`"KeyA"`) is also accepted when baking **[O]**.

### `.obsidian/appearance.json` vs `app.json`
Keys in `YP` go to appearance.json: `accentColor, theme, cssTheme, enabledCssSnippets, showViewHeader, showRibbon, nativeMenus,
translucency, textFontFamily, interfaceFontFamily, monospaceFontFamily, baseFontSize, baseFontSizeAction, slidingSidebar,
floatingNavigation, autoFullScreen`. All other config keys go to app.json (50169, 50516). UI-relevant defaults (`XP`, 50169):
`theme: "system"`, `showViewHeader/showRibbon/showInlineTitle/floatingNavigation/autoFullScreen: true`, `nativeMenus: null`,
`focusNewTab: true`, `defaultViewMode: "source"`, `settingsPopoutWindow: true`, `tabSize: 4`, `mobilePullAction:
"command-palette:open"` **[O]**.

### Themes and snippets
`.obsidian/themes/<Name>/manifest.json` (`name` must equal the folder; `version`, `minAppVersion`, `author`, …) plus
`theme.css`; `.obsidian/snippets/<name>.css` **[O]**.

### localStorage keys used by this subsystem (`<appId>-` prefix via `app.loadLocalStorage`)
`base-font-size`, `recent-commands`, `<treeId>-folds` / `-unfold`, popout modal geometry, `note-fold-*`, `DebugMode`.
Unprefixed: `language`, `EmulateMobile`, `spellcheck-languages`, `vim` (mobile), `most-recently-installed-version`,
`local-themes`, `enable-plugin-<appId>`, `<appId>-config` (config-dir override) **[O]**.

---

## Rebuild notes

Essential ideas worth reproducing (design, not code):

1. **One lifecycle primitive.** A `Component` with LIFO disposer lists and child components, async-aware `load`, and
   `register*` helpers for DOM events, emitter refs, intervals and key-scope handlers. Every view, menu, plugin and window
   owns one, so teardown can never leak. Pair it with a minimal emitter that isolates listener exceptions. In a React or
   Svelte app this maps to a "scope/owner" object passed to imperative subsystems (graph renderer, editor), with effects
   cleaning up through it.
2. **Layout as a serialisable tree with strict invariants.** Node types split / tabs / leaf, plus docks and windows as
   roots. Rules: collapse single-child splits, dissolve empty parents, wrap bare leaves in tabs. Sizes are stored as
   percentages and applied as flex-grow. Persist through a 1 s trailing throttle. Keep leaf `icon` and `title` in the
   serialised state so placeholders can render without loading the view. Give items stable random ids so "undo close" can
   restore a tab into its old group.
3. **Deferred views.** Restore hidden tabs as placeholders and build the real view on first visibility (an
   IntersectionObserver or an "is now displayed" signal; the CSS `animationstart` trick works without observers).
   Startup cost then grows with *visible* panes only.
4. **Per-leaf history of `(viewState, ephemeralState)` snapshots**, replayed with a `popstate` flag that suppresses
   re-recording. Use a correct cap (Obsidian's 20-entry cap is a no-op) and consider persisting it.
5. **Keyboard architecture**: a per-window scope stack with parent delegation. Modals use parentless scopes. Normalise
   modifiers to a sorted string with a platform `Mod`. Match on physical key position (`code`) with a fallback to `key`.
   Custom bindings fully replace the defaults for a command. Conflict detection on printed chords. **Fix the
   first-match-wins bug** by continuing to search when a command's check fails.
6. **Sectioned menus.** Items declare a section id, the menu owner declares the order, and dotted section families get
   separators or fold into submenus. This keeps plugin-extended context menus tidy. Offer native menus where the OS
   expects them.
7. **Declarative settings definitions** (1.14's direction): one definition tree drives rendering (keyed reconcile, so focus
   survives), visibility and disabled predicates, deep-link paths, and settings search with aliases. Strongly recommended
   over imperative settings code.
8. **Design tokens in three tiers.** Palette (base ramp, hues, HSL accent) → semantic (background, text, interactive,
   modifier) → component (`--tab-*`, `--menu-*`). Platform overrides adjust tokens only. Fonts use per-slot
   override → theme → default chains with a sentinel font family. Have the accent compute its on-text colour with a WCAG
   contrast ratio, not YIQ.
9. **Popout windows**: same-process child windows driven from one JS realm. Mirror the stylesheets and token variables with
   a MutationObserver and relay input events to the main window. This avoids message passing entirely. In Tauri (separate
   webviews and processes) that is impossible: plan a serialisable state channel instead, or skip popouts in v1.
10. **Virtualised trees** with incremental idle-time measurement, average-height estimates for unmeasured rows, and spacer
    elements per nesting level. Keep tree semantics on the rendered rows.

**Do better than Obsidian on accessibility (essential for this project):**
- Use real `<button>`s for every icon control and give each a tooltip **and** an accessible name. Show tooltips on
  `:focus-visible` too, and never set an empty `aria-label`.
- `role="dialog" aria-modal aria-labelledby` on modals, with a real button for close. `role="menu"` with
  `menuitem`/`menuitemcheckbox` and real focus movement (or `aria-activedescendant`), plus `aria-haspopup`/`aria-expanded`
  on triggers.
- Command palette and suggesters as combobox + listbox with `aria-activedescendant`. Trees as `role=tree` with `treeitem`
  rows carrying `aria-level/expanded/selected/setsize/posinset`, and real roving tabindex instead of a CSS-class focus.
- Tabs as `role=tablist/tab/tabpanel`. Landmarks for sidebars and the main area. F6 to cycle regions. A skip link.
- `role=status` / `aria-live="polite"` for notices; pause auto-hide on focus as well as hover; make notice actions
  buttons.
- Respect `prefers-reduced-motion` globally by multiplying the `--anim-duration-*` tokens by 0 and having the JS
  animation helper read the same flag. Add `prefers-contrast` and `forced-colors` token overrides. Set `dir="rtl"`.
- Toggles as `role="switch" aria-checked`, labelled by the setting name and described by the description.

Incidental parts that are fine to drop: mobile drawers and quick actions, macOS traffic-light positioning, legacy theme
layout, CodeMirror 5 adapters, the `ajax` helper, `fish`/`fishAll`.

---

## Open questions

- **[U] Lucide version** embedded in `wM` (1,935 icons). It could be resolved by diffing icon names against Lucide release
  manifests.
- **[U]** Does Chromium deliver `keyCode`/`which` on the *relayed* synthetic KeyboardEvent clones from popouts (`g0` builds
  them with `new e.constructor(type, e)`)? If not, vkey matching in popouts would rely on `key` only. Needs a runtime
  probe: bind a punctuation hotkey and press it in a popout.
- **[U]** How `contextmenu` events from the keyboard (Shift+F10 / Menu key) are positioned by `Menu.forEvent`
  (`showAtMouseEvent` uses `clientX/Y`). Needs a runtime test.
- ~~Toggle checked desync / what assistive tech receives~~ **Confirmed in the accessibility tree**
  ([14](14-runtime-verification.md)). In Editor settings, 12 of 17 toggles were visually on, yet all 17 checkboxes report
  `checked: false` and none has an accessible name. Other results:
  - tab headers are `group` and not focusable;
  - tab close buttons are hidden from assistive tech;
  - sidebar toggles have an empty name and aren't focusable;
  - notices have no live region;
  - the settings `.modal` has role `none`;
  - 4 of 27 `.clickable-icon` controls are focusable.

  Actual NVDA speech was not recorded.
- ~~First matching hotkey wins~~ **Confirmed at runtime.** `Ctrl+Shift+F9` was bound to `editor:toggle-bold` and then to
  `app:open-settings`, with no editor open: nothing happened. In the reverse order, or with only the settings binding,
  Settings opened.
- **[U]** The exact delay or animation of the tab-header flash (`uE`, 750 ms class) versus the CSS transition. Minor.
- **[U]** Where `--preferred-text-scale` is set. It seems to be mobile or OS text scaling. Grep the mobile plugin and the
  Capacitor bridge.
- **[U]** The full list of view types registered by core plugins (outside this scope; see the plugin and views worker).
