# Core plugins (the "remaining" set) — Obsidian 1.14.4

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian ships 30 internal ("core") plugins, all compiled into `app.js` and instantiated in a fixed order during
`App` start-up (app.js:145059-145089). Each is a plain object with `id`, `name`, `description`, optional
`defaultOn`/`hiddenFromList`, and lifecycle hooks (`init`, `onEnable`, `onDisable`, `onUserEnable`,
`onUserDisable`, `onExternalSettingsChange`), wrapped by a host component (`Q3`, app.js:109920) that owns
commands, ribbon buttons, status-bar slot, views, a settings tab, and CLI handlers. Plugin settings live in
`.obsidian/<plugin-id>.json`; the on/off map lives in `.obsidian/core-plugins.json`. This report covers every
core plugin not assigned to another worker (daily notes, templates, unique-note creator, note composer, file
recovery, word count, workspaces, random note, slides, audio recorder, footnotes, page preview, properties,
outgoing links, web viewer, command palette, slash commands, editor status) plus the frontmatter-migration
modal that replaced the old "Format converter" plugin, the built-in settings tabs, the release-notes view, the
mobile rating banner, and the bundled sandbox vault. Headline facts: file recovery is a full-content IndexedDB
snapshot store (`<appId>-backup`, 5-minute interval, 7-day retention, md+canvas+base); word count runs in an
inline Blob Web Worker with a single Unicode regex (CJK counted per character, Hangul per word); note composer
does link-preserving refactors via a vault-wide "snapshot references, mutate, re-resolve" transaction; the web
viewer is an Electron `<webview>` with a per-vault persistent partition, an IndexedDB history (cap 1000), main-
process EasyList ad-blocking, and Readability + Turndown "save to vault"; nearly every plugin now also
registers handlers for a new **Obsidian CLI** (44 plugin handlers, ~73 built-ins).

> Corrections to the task's id map (observed from `this.id = ...`): `Mte` = **file-explorer** (not "reveal
> in folder"), `rie` = **switcher** (quick switcher), `pie` = **slides**, `lie` = **slash-command** plugin
> (`uie` is its `EditorSuggest`), `dte` = **command-palette**, `Rte` = **footnotes** plugin (`Fte` is its
> view), `x2` = global-search "copy search results" modal, `Nte` is **no longer a plugin** — it is the
> "Frontmatter migration" modal opened by command `app:migrate-frontmatter`.

---

## Core plugin registry (all 30, in load order)

Loaded in this order at app.js:145059-145089 (`a.loadPlugin(new X)`); enabled afterwards by
`internalPlugins.enable()` (app.js:110185). "Default" is the `defaultOn` flag (absent = off). "Owner" says who
documents it.

| # | id | Class | Line | Default | Gate | Owner / notes |
|---|---|---|---|---|---|---|
| 1 | `file-explorer` | `Mte` | 128122 | on | — | other worker |
| 2 | `global-search` | `E2` | 99748 | on | — | other worker |
| 3 | `switcher` | `rie` | 135243 | on | — | other worker |
| 4 | `graph` | `A2` | 100404 | on | — | other worker |
| 5 | `backlink` | `x8` | 113368 | on | — | other worker (also registers a status-bar item, 113379) |
| 6 | `canvas` | `ate` | 126657 | on | — | other worker |
| 7 | `outgoing-link` | `_te` | 129762 | on | — | brief here |
| 8 | `tag-pane` | `tre` | 140334 | on | — | other worker |
| 9 | `footnotes` | `Rte` | 129071 | **off** | — | here |
| 10 | `properties` | `lne` | 130961 | on | — | here (plugin + views, brief) |
| 11 | `page-preview` | `tne` | 130837 | on | — | here (brief) |
| 12 | `daily-notes` | `bte` | 127496 | on | — | here |
| 13 | `templates` | `lre` | 140682 | on | — | here |
| 14 | `note-composer` | `Hte` | 129282 | on | — | here |
| 15 | `command-palette` | `dte` | 127266 | on | — | here |
| 16 | `slash-command` | `lie` | 135409 | **off** | — | here |
| 17 | `editor-status` | `Cte` | 128026 | on | hidden from list | here |
| 18 | `bookmarks` | `h9` | 120672 | on | — | other worker |
| 19 | `zk-prefixer` | `dre` | 140977 | off | — | here ("Unique note creator") |
| 20 | `random-note` | `sie` | 135373 | off | — | here |
| 21 | `outline` | `Jte` | 130437 | on | — | other worker |
| 22 | `word-count` | `yre` | 141264 | on | — | here |
| 23 | `slides` | `pie` | 135485 | off | — | here |
| 24 | `audio-recorder` | `Y8` | 116047 | off | — | here |
| 25 | `workspaces` | `wre` | 141390 | off | — | here |
| 26 | `file-recovery` | `Tte` | 128223 | on | — | here |
| 27 | `publish` | `tie` | 134648 | off | `Hx.publish` | other worker |
| 28 | `sync` | `Jie` | 138683 | on | `Hx.sync` | other worker |
| 29 | `bases` | `e9` | 119575 | on | — | other worker |
| 30 | `webviewer` | `c5` | 110500 | **off** | desktop app && `Hx.webViewer` | here |

**Legacy id list** `$3` (app.js:110129): `file-explorer, global-search, switcher, graph, backlink, outgoing-link,
tag-pane, page-preview, daily-notes, templates, note-composer, command-palette, slash-command, editor-status,
starred, markdown-importer, zk-prefixer, random-note, outline, word-count, slides, audio-recorder, workspaces,
file-recovery, publish, sync`. It is used only to migrate an old array-style `core-plugins.json` (observed,
110185-110205). `starred` (superseded by `bookmarks`) and `markdown-importer` (superseded by the frontmatter
migration command) no longer exist as plugins (observed: no `this.id = "starred"`/`"markdown-importer"`).
Plugins newer than that list (canvas, properties, footnotes, bookmarks, bases, webviewer) are absent from it.

`Hx` is the frozen feature-policy object (all `true` by default; on the work edition it comes from `policy.json`
via the main-process `policy` IPC; observed app.js:43363, 146276, see 10); `Qy` is the platform descriptor
(`isDesktopApp`, `isMobile`, `isPhone`, `supportsIndexedDb`, `canSplit`, ...).

---

## Where it lives

| Minified id | Public / inferred name | Role | Lines |
|---|---|---|---|
| `Q3` | InternalPluginWrapper (inferred) | host component per core plugin: commands, ribbon, status bar, views, data I/O, CLI | 109920-110129 |
| `Z3` | InternalPlugins (`app.internalPlugins`) | registry, enable/migrate, `core-plugins.json` | 110129-110234 |
| `q3` | PluginSettingTab-for-core (inferred) | declarative settings tab bound to `instance.options` | 109204-109229 |
| `F4` | `SettingTab` | declarative definition renderer (toggle/dropdown/text/textarea/number/file/folder/slider/color/secret/list/page/group) | 103162-103242 |
| `uF` | template variable expander (inferred) | `{{var}}`, `{{date[:fmt]}}`, `{{time[:fmt]}}` | 57546-57557 |
| `bte` / `kte` | Daily notes plugin / settings tab | | 127491-127958 / 127965-128026 |
| `lre` / `cre` / `ure` | Templates plugin / picker / settings | | 140682-140878 / 140878-140904 / 140904-140958 |
| `dre` / `fre` | Unique note creator (`zk-prefixer`) / settings | | 140977-141214 / 141214-141257 |
| `Hte` / `zte` / `qte` / `Wte` | Note composer / merge picker / split picker / settings | | 129282-129584 / 129584-129663 / 129663-129731 / 129731-129762 |
| `Tte` / `Dte` / `Pte` / `Ate` | File recovery / settings / history modal / path suggest | | 128223-128555 / 128555-128596 / 128624-128849 / 128596-128624 |
| `n2` | line diff renderer (diff-match-patch line mode) | used by file-recovery modal | 98768 |
| `yre` + `vre`/`mre` | Word count plugin + worker source + regex | | 141264-141390, 141258-141263 |
| `wre` / `kre` / `Cre` | Workspaces plugin / manage modal / load picker | | 141390-141566 / 141566-141647 / 141647-141680 |
| `sie` | Random note | | 135373-135409 |
| `pie` / `die` | Slides plugin / reveal.js presenter component | | 135485-135519 / 135519-135619 |
| `Y8` | Audio recorder | | 116047-116230 |
| `Nte` | Frontmatter migration modal (ex-Format converter) | opened by `app:migrate-frontmatter` (145683-145690) | 129102-129282 |
| `Rte` / `Fte` / `Ote` | Footnotes plugin / view / per-footnote item | | 129071-129101 / 128928-129071 / 128850-128928 |
| `tne` / `nne` | Page preview / settings | | 130837-130928 / 130928-130956 |
| `lne` / `une` / `cne` / `hne` | Properties plugin / "All properties" view / tree item / "File properties" view | | 130961-131099 / 131244-131492 / 131099-131244 / 131492-131651 |
| `_te` | Outgoing links plugin | | 129762-129853 |
| `c5` / `u5` / `h5` / `p5` | Web viewer plugin / settings / clear-data modal / search-the-web prompt | | 110500-110664 / 110664-110759 / 110759-110827 / 110827-110850 |
| `v5` | Web viewer view (`webviewer`) | | 110850-111426 |
| `J3` / `t5` / `n5` | Web viewer history+favicon DB / history view / history item | | 110234-110377 / 110377-110445 / 110445-110494 |
| `X2` / `Q2` | Web viewer address bar / address suggestions | | 101574-101601 / 101601-101704 |
| `dte` / `fte` / `hte` / `vte` | Command palette / modal / add-pinned picker / settings | | 127266-127365 / 127365-127447 / 127236-127256 / 127447-127491 |
| `lie` / `uie` | Slash command plugin / editor suggest | | 135409-135431 / 135431-135485 |
| `Cte` | Editor status (status-bar mode switcher) | | 128026-128122 |
| `Ere` | StatusBar (`app.statusBar`) | | 141680-141689 |
| `e3` | Release notes view (`release-notes`) | | 103877-104040 |
| `Zre` | Mobile feedback / rating banner | | 143017-143114 |
| `Mne` | Settings "General" tab (id `about`) | | 131984-132327 |
| `_re` | Settings "Appearance" tab | | 141926-142355 |
| `Yre` | Settings "Editor" tab | | 142780-142973 |
| `eoe` | Settings "Files and links" tab (id `file`) | | 143114-143385 |
| `aoe` | Settings "Interface" tab (ribbon, mobile toolbar) | | 143437-143694 |
| `soe` | Settings "Core plugins" tab (id `plugins`) | | 143694-143778 |
| `B4`, `f3`, `Kre` | Keychain, Hotkeys, Community plugins tabs (brief) | | 103242, 104862, 142355 |
| `NF` | CLI handler registry (`app.cli`) | **not covered by any worker** (see Open questions) | 58413-60483 |
| `XP` / `YP` | vault config defaults / appearance-file key list | | 50170-50228 / 50169 |

---

## How it works

### 1. Shared framework for core plugins

**Wrapper `Q3`** (observed, 109920-110129):
- `registerGlobalCommand(cmd)` prefixes only the **name** with `"<Plugin name>: "`; ids are used verbatim.
  So legacy ids stay unprefixed: `daily-notes`, `zk-prefixer`, `random-note`, `insert-template`,
  `insert-current-date`, `insert-current-time`, `insert-unique-link` (observed). Contrast community
  plugins, whose ids get `manifestId:` prefixed (108969-108972).
- `registerRibbonItem(title, icon, cb)` creates id `"<pluginId>:<title>"` (observed 110097).
- `registerStatusBarItem()` just sets a flag; on enable the wrapper asks `app.statusBar` (`Ere`, which
  appends a `div.status-bar-item`) and adds class `plugin-<id>` (observed 109968). Core plugins that use
  it: backlink, properties, editor-status, word-count, sync (observed: 113379, 130972, 128037, 141281, 138764).
- `registerViewType`, `registerMobileFileInfo`, `addSettingTab`, and `registerCliHandler(name, desc, flags,
  fn)` (registers into `app.cli`, auto-unregistered on unload) (observed 110063-110126).
- Enable order: commands → ribbon → mobile file info → status bar → views → `await onEnable` →
  `onUserEnable` (only when the user toggled it) → `load()` → save config → trigger `change` (observed
  109950-109980). Disable reverses it; `onUserDisable` + `detachLeavesOfType` only for user-initiated disable.
- Data I/O: `loadData`/`saveData` = `vault.readConfigJson(id)` / `writeConfigJson(id, data, {mtime: now})`;
  `lastSave` timestamp lets the wrapper ignore its own writes. Vault `raw` events for
  `<configDir>/<id>.json` call a 50 ms-debounced `handleConfigFileChange`, which calls the plugin's
  `onExternalSettingsChange` only if file mtime > `lastSave`, then refreshes its settings tab (observed
  110004-110024, 110135-110139). This is how Sync/external edits hot-reload plugin settings.
- **Registry `Z3`** (observed 110129-110230): `enable()` reads `core-plugins.json`; if it is a legacy array,
  merges with `core-plugins-migration.json` and converts to `{id: bool}`; plugins missing from the map get
  `defaultOn` and trigger a save. `saveConfig` (500 ms debounce) writes `{id: enabled}` for all plugins.

**Declarative settings (`F4`/`q3`)** (observed 102900-103242, 109204-109229): a tab returns
`getSettingDefinitions()` — an array of `{name, desc, aliases?, visible?(), control?: {type, key,
defaultValue?, ...}, render?(setting)}` or groups `{type:"group", heading, items}`, lists
`{type:"list", heading, items, addItem, onDelete, onReorder, search}` and sub-pages `{type:"page"}`.
Control types: `toggle, dropdown, text, textarea, number, file, folder, slider, color, secret`. For core
plugins `q3.getControlValue/setControlValue` read/write `plugin.instance.options[key]` and call `saveData`.
This makes settings searchable (the settings modal has a search box, 143945).

### 2. Template variable engine `uF` (shared by daily notes, templates, unique notes, note composer)

Observed at app.js:57545-57557. Defaults `lF = "YYYY-MM-DD"`, `cF = "HH:mm"`.
1. For each key in the supplied variables object (e.g. `{title}`), build a **case-insensitive, global** regex
   `{{key}}` and `String.replace` it with the value.
2. Then replace `{{date}}`, `{{time}}`, `{{date:FMT}}`, `{{time:FMT}}` (regex `/{{(date|time)(?::(.*?))?}}/gi`).
   A single `moment()` is captured lazily per call, so all date/time tokens in one expansion agree.
   Without `:FMT`, `date` uses `options.dateFormat || "YYYY-MM-DD"`, `time` uses `options.timeFormat ||
   "HH:mm"`. FMT is any moment.js format string.
- Variables per caller (observed): Templates `{title}` (active file basename, or "" if none) + its own
  date/time formats; Daily notes `{title}` = the formatted date string, **default** formats only (passes `{}`);
  Unique note `{title}` = generated id, default formats; Note composer `{fromTitle, newTitle, content}`.
- Quirks (inferred from code): values go through `String.replace` with a string replacement, so `$&`, `` $` ``,
  `$'`, `$$` inside a value (e.g. note body merged by note composer) are interpreted as replacement patterns;
  and because custom vars are substituted *before* date/time, a literal `{{date}}` inside merged content is
  expanded too. No escaping, no conditionals, no loops, no cursor placeholder.

### 3. `fileManager.insertIntoFile(file, text, "append"|"prepend")` (used by daily notes, note composer)

Observed 64893-64928. Splits both texts into frontmatter + body (YAML parse; invalid YAML → notice and treat
as body), joins bodies with exactly one blank line unless one already exists at the seam, then **deep-merges
frontmatter** via `mB` (observed 65041): arrays → union (deduped), objects → recursive
merge, scalars → incoming value wins if non-null, missing keys added. The merged YAML is re-serialised at top.

### 4. Daily notes (`daily-notes`, `bte`)

Options (`.obsidian/daily-notes.json`), observed 127965-128026:

| Key | Default | Notes |
|---|---|---|
| `format` | `"YYYY-MM-DD"` (`gte`) | dropdown presets `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`, `YYYY/MM/YYYY-MM-DD`, or "custom" moment format |
| `folder` | unset → "new file location" setting | folder picker, root allowed |
| `template` | unset | `.md` file picker, validated by `a4` |
| `autorun` | legacy | if set and vault `openBehavior` is `""`, migrates to `openBehavior = "daily"` then deleted (127730) |

Format validation `wte` (127959-127964, observed): rejects formats starting with `/`, outputs containing
characters illegal in filenames (`MA` regex), and formats whose output does not parse back strictly.

Commands (observed 127510-127533): `daily-notes` "Open today's daily note" (ribbon `lucide-calendar`);
`daily-notes:goto-prev` / `daily-notes:goto-next` (check-callbacks: only available when the active file is a
daily note).

Algorithm (observed 127806-127957):
- **Path**: `folder` must exist if set (else notice "folder not found"); otherwise
  `fileManager.getNewFileParent("")`. Path = folder prefix + `moment().format(format).trim()` + `.md`.
  Because the formatted string can contain `/`, nested layouts like `2026/10/2026-10-21.md` work;
  `createNewMarkdownFile` → `createNewFile` → `getOrCreateFolder` creates missing intermediate folders
  (observed 64356-64386).
- Lookup uses `getAbstractFileByPathInsensitive`; if a non-file sits there → returns null. If absent, read the
  template (if configured) with `cachedRead`, expand `uF(template, {title: formatted})`, create file.
- **Identify a daily note**: take the file path relative to the daily folder, strip extension, strict-parse with
  the format (`moment(x, fmt, true)`). Prev/next scan *all* files under the folder recursively each time and
  pick the nearest timestamp before/after (O(n) per call; existing notes only, never creates).
- Event hooks: `receive-text-menu` (OS share sheet) → append text and open; `receive-files-menu` → append
  links (embeds for media via `Fx(ext)`).
- URI: `obsidian://daily?...` handler registered under action `daily` with params `content`, `clipboard`
  (read clipboard), `prepend`, `silent`, `paneType`, then `handleXCallback` (x-callback-url). Observed 127607.
- Mobile quick action `daily` (calendar icon).
- CLI: `daily` (open; `paneType=tab|split|window`), `daily:path`, `daily:read`, `daily:append`,
  `daily:prepend` (`content=<text>` with `\n`/`\t` unescaping, `inline` = no newline, `open`; prepend inserts
  *after* frontmatter using `pm(text).contentStart`). Observed 127620-127729.
- **Fast start on phones**: `getDailyNotePathBeforeAppLoads()` and `getDailyNoteTemplateBeforeAppLoads()`
  (127756-127804) compute the path with the raw adapter before the vault index exists, so when vault
  `openBehavior === "daily"` the phone opens the note instantly (App start, 145161). Inferred bug:
  `getDailyNoteTemplateBeforeAppLoads` calls `.endsWith` on `options.template` without a null check; with no
  template it throws, which the surrounding try (145122/145185) swallows, so the fast path silently skips
  pre-creating the note.
- Also consumed by Files & Links "Default file to open" option (`openBehavior: "daily"` only offered when the
  plugin is enabled, 143138).

### 5. Templates (`templates`, `lre`)

Options (`.obsidian/templates.json`): `folder` (required; root is rejected with "invalid folder"),
`dateFormat` (default `YYYY-MM-DD`), `timeFormat` (default `HH:mm`) (observed 140904-140958).

Commands: `insert-template` (ribbon `lucide-files`), `insert-current-date`, `insert-current-time`
(editor callbacks) (observed 140697-140716).

Algorithm (observed 140806-140878):
- Picker lists every `.md` under the folder recursively, sorted by path; item text = path relative to folder
  without extension. Fuzzy modal (`FT`).
- Insert: expand `uF(text, {title: activeFile.basename}, {dateFormat, timeFormat})`. If the cursor is at
  document start (line 0, ch 0), the whole result (including any frontmatter) replaces the selection
  verbatim. Otherwise the template's frontmatter is split off; the body is inserted at the cursor and the
  frontmatter is merged into the note's properties via the active view's `metadataEditor.insertProperties`
  (only when the active view has a metadata editor). Invalid template YAML → notice, abort.
- Insert date/time: formatted `moment()` inserted at the cursor head via a CM6 transaction, cursor moved after.
- CLI: `templates` (list, `total`), `template:read name=<t> [resolve] [title=]`, `template:insert name=<t>`
  (resolution: exact path, then case-insensitive relative-path match) (observed 140735-140793).
- A dead file-suggest subclass sits in an expression whose comma operator discards it; the expression's value is
  the unique-note default format (observed 140960-140977, `hre = (...class..., "YYYYMMDDHHmm")`).

### 6. Unique note creator (`zk-prefixer`, `dre`)

Options (`.obsidian/zk-prefixer.json`): `folder`, `template`, `format` (default `"YYYYMMDDHHmm"`) (observed
141214-141257).

Commands: `zk-prefixer` "Create new unique note" (ribbon `sheets-in-box`), `insert-unique-link` "Add unique
internal link" (observed 140987-141001).

Algorithm `getUniquePath(suffix)` (observed 141100-141131):
1. `id = moment().format(format)`, optionally `id + " " + suffix`.
2. Collision test: *any* loaded file anywhere in the vault whose **name starts with** the candidate.
3. On collision, find the smallest unit among minute, hour, day, week, month, year whose `+1` changes the
   formatted output; then keep adding that unit until no collision. IDs can therefore lie in the future.
4. If no unit changes the output (format has no date tokens), notice "failed to generate" and return null.
   Quirk (observed 141121-141141): after a collision the retried candidates are tested and returned **without**
   the `" " + suffix`, so a suffixed request that collides comes back as a bare, later ID.

Create: resolve folder (explicit must exist, else new-file-location rules), template expanded with
`{title: id}` (missing template → 10 s notice with a "Settings" button), create, open in source mode with
`eState: {rename: "end"}` so the user types a title right after the ID (observed 141132-141183).
`insert-unique-link` turns each selection into `[[<id> <selected text>]]` (file not created), selecting the
inserted name or placing the cursor after it; userEvent `input.autocomplete` (observed 141184-141195).
URI action `unique` (content/clipboard/silent/paneType + x-callback), mobile quick action, CLI `unique`
(`name`, `content`, `paneType`, `open`) (observed 141010-141081).

### 7. Note composer (`note-composer`, `Hte`)

Options (`.obsidian/note-composer.json`): `replacementText` (`link` default | `embed` | `none`), `template`
(file), `askBeforeMerging` (default true; the `{askBeforeMerging: true}` default applies only when no data
file exists) (observed 129348, 129731-129762).

Commands (observed 129295-129335): `note-composer:merge-file` (active md file), `note-composer:split-file`
(editor, requires selection; i18n name "Extract current selection"), `note-composer:extract-heading`
(cursor on a heading line). Also file-menu "Merge entire file with..." and editor-menu items.

Pickers: merge `zte` and split `qte` extend a file-suggest modal `D5`: Enter = append, Shift+Enter = prepend
("merge at top"), Mod+Enter = create a new note named by the query; unresolved link suggestions also create
(observed 129584-129731). Split pre-fills the query with the heading text of the selection's first line.

**Heading range** (observed 129416-129436): from the metadata cache headings, start at the heading on the
cursor line; end at the next heading whose level ≤ that level (or EOF), dropping one trailing newline.

**Merge** (observed 129544-129582): read source → `applyTemplate(content, fromTitle=source, newTitle=dest)`
(template gets `\n\n{{content}}` appended if it lacks `{{content}}`) → inside
`fileManager.runAsyncLinkUpdate`: `insertIntoFile(dest, text, append|prepend)`, `trashFile(source)`, then
retarget every recorded reference whose `resolvedFile` was the source to the destination.

**Extract/split** (observed 129437-129527):
1. `rewriteLinksForDestination` — for links/embeds *inside* the extracted range: links to other files are
   re-relativised for the new file's path (`fileToLinktext`), keeping wikilink vs markdown style; links to the
   source with a subpath become a bare `#subpath` if that heading/block is also inside the range, else
   `Source#subpath`. Links to the source without a subpath are left alone.
2. `getPathlessLinkUpdatesForSource` — for links *outside* the range in the source that point (by bare
   `#subpath` or by name) at a heading/block now inside the range: rewrite to `NewNote#subpath`.
3. Inside `runAsyncLinkUpdate`: insert the (templated) text into the target, then edit the source with
   `vault.process`, replacing the range with the configured link/embed/nothing **only if the file content is
   unchanged since it was read** (optimistic-concurrency guard: otherwise the source is left untouched).
4. Inbound links from *other* files to headings/blocks inside the range are retargeted to the new file.

**`runAsyncLinkUpdate` transaction** (observed 64419-64480): queued; waits for a clean metadata cache;
snapshots every resolvable reference vault-wide as `{sourceFile, reference, resolvedFile, resolvedPaths}`; runs
the callback (which may mutate `resolvedFile`); nested calls are batched; finally `updateAllLinks` rewrites
every reference whose resolution changed. This is the key reusable idea for safe refactors.

### 8. File recovery (`file-recovery`, `Tte`)

Options (`.obsidian/file-recovery.json`), defaults `Ste = {intervalMinutes: 5, keepDays: 7}` (observed 128223);
settings show "Snapshot interval" (number, min 0), "History length" (days, min 1), "View", "Clear history"
(destructive confirm) (observed 128563-128592). Command `file-recovery:open` "Open local history".

Storage (observed 128271-128280): IndexedDB database **`<appId>-backup`**, version 1, object store
**`backups`** (autoIncrement key) with indexes `path` and `ts`. Record = `{path, ts, data}` — the **entire file
text**, no diffs, no compression. Not available where `Qy.supportsIndexedDb` is false (settings show an iOS
warning). `appId` is the per-vault id.

Snapshot policy (observed 128258-128265, 128435-128466, 128484-128507):
- Triggers: vault `modify`, workspace `file-open`, and (after layout ready) vault `create`. Only `md`,
  `canvas`, `base` files. (i18n says "only saved for Markdown files" — code disagrees; observed.)
- Per-path last-snapshot time is cached in memory (`tsCache`), seeded lazily from the DB (`openCursor(path,
  "prev")`).
- If `now - last < intervalMinutes` → add path to `pendingFiles`; a **60 s** interval (`resave`) re-runs the
  check for pending paths, so the latest state is captured within ~1 min after the interval expires.
  Otherwise read current content; skip if identical to the last snapshot; else `add` a record.
  `intervalMinutes` NaN/negative → 5; `0` → snapshot every distinct change.
- Opening a file snapshots it (if outside the interval) — giving a "before I edited it" baseline.
- External callers: `fileManager.storeTextFileBackup(path, text)` → `forceAdd` when file recovery is enabled
  (observed 64946-64965). Callers (observed by grep): Sync before overwriting or merging a Markdown file
  (139885, 139889, 139895) and the Markdown/text views when a save fails (99258, 103809). Restores also
  `forceAdd` the restored text.
- Retention (observed 128265-128282, 128508-128531): `cleanup` runs 60 s after enable (`setTimeout`) and then
  hourly (`setInterval` 3,600,000 ms); walks the `ts` index with `IDBKeyRange.upperBound(now - keepDays*86400000)`
  deleting old records in a `relaxed`-durability transaction. `keepDays` NaN or < 1 → 7. No per-file or total
  size cap (observed absence).

History modal `Pte` (observed 128624-128849): left sidebar = path search (suggests up to 100 distinct paths
from a `nextunique` cursor on the `path` index) + version list (sorted newest first, `llll` timestamp and size);
right = raw textarea or a **diff vs the next-older version** (`n2`: diff-match-patch `diff_lineMode` +
`diff_cleanupSemantic`, unchanged runs collapsed beyond 5 lines at edges / 10 in the middle, 3 lines context;
98768ff). Actions: Copy, Restore (recreates parent folder if needed, `adapter.write`, then `forceAdd`).
Keyboard-navigable; phone layout slides between list and content.

CLI (observed 128309-128382): `history`, `history:list`, `history:read version=<n>`, `history:restore
version=<n>`, `history:open` — versions are 1-based, newest = 1.

### 9. Word count (`word-count`, `yre`)

Observed 141258-141389.
- Status-bar item with two segments (words, characters); mobile file-info renderer too.
- Events: `file-open`, `quick-preview` (live text while typing), `editor-selection-change` (count the
  selection if non-empty, else the file).
- Text source: active file view if `.md` (frontmatter stripped via `pm().contentStart`) or a plaintext view.
- Characters = JS string length (UTF-16 units, whitespace included). Words = number of regex matches.
- **Worker**: the counting code is a string `vre` turned into a `Blob` URL and run as a dedicated `Worker`;
  requests debounced 200 ms (`Gl(countWords, 200)`); worker replies with an integer.
- Regex (described): a match is either (a) a number `digits` with optional `,`/`.` groups, or (b) a run of
  "word" characters: ASCII/Latin/Greek/Cyrillic/Arabic/Indic... letters (`WI`, 51870), hyphen, apostrophes,
  Tamil block U+0B80-0BFF and **Hangul** syllables/jamo (so Korean counts per space-separated word), or (c) a
  **single** character from `jI`: Tibetan, Hiragana, Katakana, CJK Unified Ideographs U+4E00-9FD5 (and Hangul,
  which is already consumed by (b)) — so each Chinese/Japanese character counts as one word.
- CLI `wordcount` (`file`/`path`, `words`, `characters`) uses the same regex on the main thread.

### 10. Workspaces (`workspaces`, `wre`)

Observed 141390-141680. Data `.obsidian/workspaces.json` = `{workspaces: {<name>: <layout JSON from
workspace.getLayout()> + mtime (moment ISO string)}, active: <name>}`. Commands: `workspaces:load`,
`workspaces:save` (saves active, or opens manager if none), `workspaces:save-and-load` (saves current active
before switching), `workspaces:open-modal` (ribbon). Load = `workspace.changeLayout(saved)`. Manager modal lists
names with "modified X ago", Load and Delete buttons. Data is flushed on disable. CLI `workspaces`,
`workspace:save`, `workspace:load`, `workspace:delete`.

### 11. Random note (`random-note`, `sie`)

Observed 135373-135408. Command `random-note` (ribbon `dice`): uniform pick over `vault.getMarkdownFiles()`
via `Math.random()`; opens in a new tab if the triggering event had Mod. No exclusion of the current note, no
weighting, no history, no settings. (Relevant to retention: this is Obsidian's only built-in "resurfacing"
feature; there is no spaced repetition anywhere in the bundle — grep for flashcard/spaced repetition = 0.)

### 12. Slides (`slides`, `pie` + `die`)

Observed 135485-135619. Command `slides:start` and file-menu "Start presentation" for `.md`.
Presenter: reads the file, parses it to mdast (`cm`), extracts frontmatter (`dm`) and link definitions
(`km`), **splits top-level nodes at every `thematicBreak` (`---`)** into sections, renders each section to
HTML (`fm`) inside `<section>` elements, runs Obsidian's markdown post-processors (`eU.postProcess`) so
embeds/math work, injects `/lib/reveal/reveal.css` and `white.css` (if theme is `moonstone`) else `black.css`,
waits for `/lib/reveal/reveal.js`, and creates `new Reveal(el, {embedded, keyboardCondition: "focused",
controlsTutorial: false, overview: false})`. Esc (pushed keymap scope) or the close button destroys it.
Quirk (inferred): base theme "system" always gets the dark reveal theme.

### 13. Audio recorder (`audio-recorder`, `Y8`)

Observed 116047-116230. Commands `audio-recorder:start` / `:stop` (check-callbacks on `recording`), ribbon
toggle `lucide-mic` (gets `is-active`). macOS desktop: checks/asks `systemPreferences` microphone access;
iOS needs 14.5+ (`navigator.mediaDevices`). Records with `MediaRecorder`, preferring `audio/mp4` → `.m4a`,
else `audio/webm;codecs="opus"` → `.webm`; WebM blobs are post-processed by a bundled module that rewrites
EBML metadata to add duration/seek cues (module 9547, `makeMetadataSeekable`; inferred: ts-ebml "fix webm
duration"). Saved as `Recording YYYYMMDDHHmmss.<ext>` via `getAvailablePathForAttachments` relative to the
active file; if a Markdown editor is active, inserts `\n!<link>\n` at the cursor, else opens the audio file.
Mobile keeps the device awake while recording (`Bw`, 36778).

### 14. Frontmatter migration (ex-"Format converter", `Nte`)

Observed 129102-129282 and command at 145683-145690. Command `app:migrate-frontmatter` (always available, not a
plugin). Runs over **all** Markdown files (warning + Stop button, cancellable `_T` runnable):
- `alias` → renamed to `aliases`; a string value is split on commas/newlines, trimmed, empties dropped.
- `tag` → `tags`; a string value is split on spaces/commas/newlines.
- `cssclass` → `cssclasses`; string split on spaces/commas/newlines.
Edits use `vault.process` with `mtime: old + 1` (preserves ordering); counts processed/modified/failed;
yields every 10 files; finishes with a 30 s "N files updated — Undo" notice (`notifyForBulkUndo`, 64981)
that restores old contents and mtimes. The old Roam/Bear/highlight/tag converters are gone (observed
absence of any such code paths in `Nte`).

### 15. Footnotes view (`footnotes`, `Rte` / `Fte`)

Observed 128850-129101. Default **off**. View type `footnotes` in the right sidebar (`footnotes:open`),
`canAcceptExtension` true; follows the active file (base `T2` "linked file view", 100329). Re-renders on
`metadataCache` `resolve` for its file, skipped while any item is being edited. Order: by the offset of the
first reference (`footnoteRefs`; inline footnotes `^[...]` whose id starts with `"[inline"` count their own
position, 28925), footnotes with no references last and styled `mod-no-occurrences`. Number = display index.
Each item embeds the definition via the embed component (`f2`, linktext `#[^id]`) and becomes an inline editor
on click — i.e. footnote definitions are editable from the sidebar. Items are cached by id and re-used if the
section text did not change.

### 16. Page preview (`page-preview`, `tne`) — brief

Observed 130837-130956. Listens to workspace `hover-link`. Settings = one toggle per registered hover source
(`workspace.registerHoverLinkSource(id, {display, defaultMod})`; sources seen: `search, preview, editor,
tab-header, graph, file-explorer, outline, properties, bases`, bookmarks, backlinks...), stored as
`{<sourceId>: requireMod}` in `.obsidian/page-preview.json`. If Mod is required and not held, it arms
document listeners for ~2 s (debounced on mousemove): pressing Mod while still over the target opens the
preview; arrows/printable keys/click/leaving cancel. Popover created by `E1.create` (other worker). Remembers
"unfold properties in preview" in localStorage `<appId>-page-preview-unfold-properties`.

### 17. Properties (`properties`, `lne`) — brief

Observed 130961-131651. Views: `all-properties` (`une`, vault-wide list; sorts `alphabetical`,
`alphabeticalReverse`, `frequency` (default), `frequencyReverse`; counts from
`metadataTypeManager.getPropertyOccurrences()`; shows properties with ≥1 occurrence or an assigned type;
rename → `fileManager.renameProperty`, delete → `fileManager.deleteProperty`; refreshes on vault `delete`,
metadata `finished`, type-manager `changed`) and `file-properties` (`hne`, per-file editor following the active
file; pinnable). Commands `properties:open`, `properties:open-local`. Status bar "N properties" (hidden at 0,
click opens the local view). Hover source `properties`. Types persist in `.obsidian/types.json` as `{types:
{name: widget}}` (63683-63704; other worker).

### 18. Outgoing links (`outgoing-link`, `_te`) — brief

Observed 129762-129853. View `outgoing-link` (right sidebar), commands `outgoing-links:open`,
`outgoing-links:open-for-current` (split pane linked to the current file), file-menu entry, CLI `links`
(lists resolved paths and `<name> (unresolved)`).

### 19. Web viewer (`webviewer`, `c5` / `v5`)

**Gate & defaults** (observed 110485-110506): desktop only and `Hx.webViewer`; default off. Options
(`.obsidian/webviewer.json`), defaults `l5 = {openExternalURLs: true, enableAdblocking: true}` plus
`homepage`, `markdownPath` (save folder), `searchEngine` (`duckduckgo` default | `brave` | `bing` |
`google` | `custom`), `customSearchEngine` (must contain `%s`; validated on blur) (observed 110490-110499,
110664-110757). Engine URLs: `duckduckgo.com/?q=%s`, `search.brave.com/search?q=%s`, `www.bing.com/search?q=%s`,
`www.google.com/search?q=%s`.

**Commands** (observed 110512-110598): `webviewer:open` (homepage or `about:blank`), `webviewer:open-history`,
`webviewer:toggle-reader-mode`, `webviewer:focus-address-bar`, `webviewer:zoom-in` / `:zoom-reset` /
`:zoom-out` (zoom factor 0.5-3, step 0.1; the zoom-out command reuses the `zoom-in` icon, 110562),
`webviewer:search` (prompt → new tab with engine URL), `webviewer:save-to-vault`. Also a `url-menu` item
"Open in web viewer", a window `open-url` listener that hijacks external links when `openExternalURLs` (opens
in a popout window if a modal is open), and CLI `web url=<url> [newtab]` (prepends `https://` if no scheme).

**Session / ad-block** (observed 110649 + main.js:4083-4111, 4365, 5032-5040, 5234-5249): renderer sends
`create-browser-session(partition, adblock)`; partition is `persist:vault-<appId>` (per vault, persistent
cookies). Main process strips `Obsidian`/`Electron` tokens from the user agent, blocks requests matching the
filter engine when ad-block is on, spoofs UA "Chrome" for `accounts.google.com`, allows only
`clipboard-read`/`clipboard-sanitized-write` permissions, denies device permissions. Default lists:
`https://easylist.to/easylist/easylist.txt` and `https://easylist.to/easylist/easyprivacy.txt`, cached in
`<userData>/adblock/<basename>`, refreshed every `adblockFrequency` days (default 4; 0 = never; timer capped
at 24 days) — lists and frequency are global (main-process `obsidian.json` config), editable in settings via
sync IPC `adblock-lists` / `adblock-frequency`.

**History & favicons** (`J3`, observed 110234-110377): IndexedDB **`<appId>-webview`** v1 with stores
`history` (keyPath `id`, autoIncrement; record `{id, title, url, accessTs}`) and `icons` (key = host;
value `{source, base64 data URL}`). `addHistoryItem` skips if the newest entry has the same URL, then trims
to the **newest 1000** entries; triggers workspace event `webviewer:update-history`. Favicons fetched once per
host (prefers a 32px candidate, else the largest) and cached as data URLs. History view `webviewer-history`
(left sidebar tree) supports open, copy URL, remove, clear.

**View `v5`** (observed 110850-111426): view type `webviewer`, state `{url, title, mode}` with modes `blank |
webview | reader | error`. Uses an Electron `<webview>` (`allowpopups`, white background); main process
hardens attached webviews (no preload, sandbox, no node integration, webSecurity; main.js:4298-4309). Page
loads are debounced (`reportPageLoad` → `commitPageLoad`): updates address bar, tab title, history, bookmark
headers, and pushes the previous URL into the leaf's back/forward history (so Obsidian navigation buttons drive
the browser). After load it strips `target="_blank"` attributes in the page (so links stay in-pane). Keyboard
events from the guest are fed to Obsidian's keymap (`before-input-event`) so hotkeys work inside pages. Native
context menus for links (open in tab/split/window/default browser, copy, bookmark), selections ("Search for
...", **"Extract selection" → new note named after the page title containing the selected text**), images
(save to vault as attachment, copy image/link), and navigation. In-page find for both webview and reader mode.

**Address bar** (`X2`/`Q2`, observed 101574-101704): suggestions merge `about:blank`, history, URL bookmarks;
fuzzy-scored on `title + url`. If no exact URL match: input with `http(s)://` → open as typed; first
host-like token containing a dot (not trailing) → `https://<input>`; otherwise → "Search for ..." with the
engine URL.

**Reader mode & save to vault** (observed 111109-111175): fetches `/lib/readability.js`, injects it into the
page, runs `new Readability(document.cloneNode(true)).parse()` in the guest, takes `content`/`title||siteName`,
sanitises the title (`Y2`: drop `?*`, replace `\ / :` with ` - `, fallback "Untitled"), converts HTML →
Markdown with the bundled Turndown instance (`SR`, 61874, with custom table rules), and renders it with the
normal markdown renderer in the reader pane. **Save to vault** writes `<markdownPath>/<title>.md` (available
path) containing only that Markdown — no frontmatter, no source URL, no capture date (observed absence).
`lib/defuddle.full.js` is shipped but not referenced from app.js (observed by grep; inferred: used by the
separate Web Clipper or reserved).

**Clear data modal** (`h5`, observed 110759-110826): toggles cookies, cache, history, "all". "All" clears
`cookies, filesystem, indexdb, localstorage, shadercache, serviceworkers, cachestorage` and `clearData()`.
**Bug (observed, 110778-110782):** the *History* toggle's change handler assigns `clearAll` instead of
`clearHistory`. `clearHistory` therefore stays at its default `true`, so history is always cleared even with the
toggle off, and switching History off and back on sets `clearAll`, which triggers the full wipe without the
"All" toggle showing it.

### 20. Command palette (`command-palette`, `dte`)

Observed 127236-127491. Command `command-palette:open` (hotkey **Mod+P**, ribbon, mobile toolbar). Options
`.obsidian/command-palette.json` = `{pinned?: [commandId]}` (settings tab = reorderable list with "Add
command" picker). Recent commands in localStorage `<appId>-recent-commands` (most recent first, max **100**).
Ordering `getCommands`: pinned (in pinned order) first, then the rest alphabetically (`BT` locale compare) and
then stably re-ordered by recency (`pte`: commands in the recent list move to the front in recency order).
Fuzzy modal; `sortSuggestions` adds `name.length / 10000` to positive scores before sorting descending
(observed; intent unknown — a tiny tiebreak). Rendering splits "Plugin: Command" into a muted prefix, shows
custom hotkeys else defaults, and a pin flair.

### 21. Slash commands (`slash-command`, `lie` / `uie`)

Observed 135409-135485. Default off. An `EditorSuggest` registered into `workspace.editorSuggest`. Trigger regex
`/(^|\s)\/([^\s\/]*)$/` on the text before the cursor (slash at line start or after whitespace; query = no
spaces or slashes). Suggestions = command-palette's ordered list, fuzzy-filtered (`lx`) and score-sorted (`px`);
choosing deletes the `/query` text and executes the command (`R8`). Same rendering as the palette.

### 22. Editor status (`editor-status`, `Cte`)

Observed 128026-128122. Hidden from the core-plugin list; exposed as a toggle in the Editor tab (142810).
Status-bar icon: `book-open` (Reading), `code-2` (Source), `edit-3` (Live Preview); hidden when the active
view is not a Markdown view. Click/right-click → menu to switch: sets view state `mode: "preview"` or
`mode: "source"` with `source: true|false`. Updates on `layout-change` and `active-leaf-change`.

### 23. Status bar

`Ere` (observed 141680-141689) is minimal: `registerStatusBarItem()` returns a new `div.status-bar-item`
appended to `dom.statusBarEl`; order = registration order. Core items are created synchronously during
enable in plugin load order (inferred: backlinks, properties, editor-status, word-count, sync).

### 24. Release notes view (`release-notes`, `e3`)

Observed 103855-104040, 145316, 145524, 145944, 106221. Shown automatically when the stored
`localStorage["most-recently-installed-version"]` is older than the running version `goe = "1.14.4"`
(then updated), via command `app:show-release-notes`, or URI action `show-release-notes?version=`. Fetches
`https://obsidian.md/changelog/desktop/<x.y.z>.md` (404 → "missing release notes" text), reads `date` from
frontmatter ("Released MMMM D, YYYY"), renders Markdown via the lightweight mdast→HTML path (not the full
renderer), and adds collapsible callouts for patch versions (`x.y.N` down to `x.y.0`, lazy-loaded on expand)
plus a link to the full changelog. State `{currentVersion}` validated by `/^(\d+)\.(\d+)(\.\d+)?$/`.

### 25. Mobile feedback / rating banner (`Zre`)

Observed 143017-143114, 143957, 144489. Phone-only banner at the top of the Settings modal. Shown only if
all hold: online; `localStorage.didProvideMobileFeedback` unset; user has a license **or** a Sync remote
vault; on iOS the app is installed from the App Store; vault has ≥ **50** files; the config folder was
created ≥ **180 days** ago (`15552000000` ms, from `adapter.stat(configDir).ctime`). "Rate" calls the native
in-app review API (`Ow.requestReview`) and sets the flag; "Dismiss" sets the flag. Scale-out animation on hide.

### 26. Built-in settings tabs

Vault config defaults `XP` (observed 50170-50228; these are `app.json` / `appearance.json` keys — `YP`
lists the appearance keys: `accentColor, theme, cssTheme, enabledCssSnippets, showViewHeader, showRibbon,
nativeMenus, translucency, textFontFamily, interfaceFontFamily, monospaceFontFamily, baseFontSize,
baseFontSizeAction, slidingSidebar, floatingNavigation, autoFullScreen`, 50169).

**General (`Mne`, id `about`)** (observed 131984-132327): version + update check (IPC `update`,
`check-update`), "Automatic updates" (IPC `disable-update`), "Receive early access versions" (IPC
`insider-build`, only with a license), language dropdown (relaunch), Help, Account group (account, Catalyst,
commercial license key), Advanced: "Notify if startup takes long" (localStorage `<appId>-slow-startup-check`,
with a startup-timing modal `wne`), **"Command line interface"** toggle (IPC `cli`; registering adds the app
folder to the user PATH on Windows via PowerShell, main.js:5250ff), "Hardware acceleration" (IPC
`disable-gpu`, relaunch).

**Editor (`Yre`)** (observed 142780-142973):

| Setting | Key | Default |
|---|---|---|
| Default view for new tabs | `defaultViewMode` (`source`/`preview`) | `source` |
| Default editing mode | `livePreview` | `true` |
| Show editing mode in status bar | toggles the `editor-status` plugin | on |
| Show inline title | `showInlineTitle` | true |
| Readable line length | `readableLineLength` | true |
| Strict line breaks | `strictLineBreaks` | false |
| Properties in document | `propertiesInDocument` (visible/hidden/source) | `visible` |
| Fold heading / Fold indent | `foldHeading` / `foldIndent` | true / true |
| Line numbers | `showLineNumber` | false |
| Indentation guides | `showIndentGuide` | true |
| Right-to-left | `rightToLeft` | false |
| Allow Mermaid (`g2`/`m2`) | localStorage `<appId>-mermaid-vault-trust` | off |
| Spellcheck / languages / custom dictionary | `spellcheck` | true |
| Auto-pair brackets / Markdown | `autoPairBrackets` / `autoPairMarkdown` | true / true |
| Smart lists | `smartIndentList` | true |
| Indent using tabs / Tab size | `useTab` / `tabSize` (slider 2-8) | true / 4 |
| Convert pasted HTML | `autoConvertHtml` | true |
| Vim key bindings | `vimMode` (mobile: localStorage `vim`) | false |

Enabling Vim first opens a confirm dialog asking how to quit Vim; the answer must start with `:q`
(observed 142940-142970).

**Files and links (`eoe`, id `file`)** (observed 143114-143385): Default file to open `openBehavior`
(`""` last opened | `new` | `file:<path>` | `daily`; default `""`), Always focus new tabs `focusNewTab` (true),
New note location `newFileLocation` (`root`/`current`/`folder`, default `root`) + `newFileFolderPath`,
Attachment location `attachmentFolderPath` (default `/`; UI choices root/current/subfolder/specified folder are
encoded into this one string — exact encoding inferred, not traced),
New link format `newLinkFormat` (`shortest` default / `relative` / `absolute`), Auto-update links
`alwaysUpdateLinks` (false), Use `[[Wikilinks]]` = `!useMarkdownLinks` (false), Detect all file extensions
`showUnsupportedFiles` (false), Confirm deletion `promptDelete` (true), Delete unlinked attachments
`deleteUnlinkedAttachments` (`ask` default / `always` / `never`), Deleted files `trashOption` (`system`
default / `local` (.trash) / `none`), Excluded files `userIgnoreFilters` (list; `/regex/` form supported),
Override config folder (localStorage `<appId>-config`, relaunch), Allow URI callbacks `uriCallbacks` (false),
Rebuild vault cache (`metadataCache.clear()` + reload).

**Appearance (`_re`)** (observed 141926-142355): Base color scheme `theme` (`obsidian` dark / `moonstone`
light / `system`; default `system`), Accent color `accentColor` (`""` = default), Themes (`cssTheme`,
manage/update modal `k3`, legacy themes), CSS snippets (`enabledCssSnippets`), Interface/Text/Monospace font
pages (`interfaceFontFamily`, `textFontFamily`, `monospaceFontFamily`, comma lists), Font size `baseFontSize`
(slider 10-30, default **16**; read per device from localStorage `<appId>-base-font-size`, seeded from config,
146226-146231), Quick font-size adjustment `baseFontSizeAction`, Custom app icon (desktop;
PNG/ICO/ICNS, re-encoded through a canvas, IPC `set-icon`), Translucent window `translucency`.
Font availability is detected without OS APIs by measuring the width of `"abcdefghijklmnopqrstuvwxyz0123456789"`
at 72px in a canvas with the candidate font vs. `monospace`/`sans-serif`/`serif` fallbacks (observed
141700-141718); the candidate list = `Inter`, `Source Code Pro` + OS fonts from IPC `get-fonts` (desktop) or
native plugin (mobile) + a hard-coded list of ~130 common Windows/macOS fonts, probed 10 per tick.

**Interface (`aoe`, id `interface`)** (observed 143437-143694): `showViewHeader` (true), `showRibbon` (true) +
"Configure ribbon" page (order/hide items), phone `autoFullScreen`, mobile `slidingSidebar`,
`mobileQuickRibbonItem`, `mobilePullAction` (default `command-palette:open`), mobile toolbar page
(`mobileToolbarCommands`, default list of ~21 editor commands, 50199), desktop zoom level (slider -2.5..3 step
0.5 shown as `100*1.2^z %`), `nativeMenus` (null = platform default), window frame style (IPC `frame`:
`hidden` default / `custom` / `native`, relaunch), `settingsPopoutWindow` (true).

**Core plugins (`soe`, id `plugins`)** (observed 143694-143778): searchable list of every non-hidden core
plugin sorted by name; each row has a toggle (`enable(true)`/`disable(true)` → user hooks fire), a gear (only if
the plugin registered a settings tab) and a hotkeys button (only if some command id starts with
`<pluginId>:` — so Templates, Unique note, Random note show no hotkey shortcut button; inferred quirk).

**Other tabs** (brief): Keychain `B4` (id `keychain`; `app.secretStorage` list/add/edit/delete, last-access
time, warning when OS encryption is unavailable, 103242), Hotkeys `f3` (104862), Community plugins `Kre`
(142355; other worker), plus each core plugin's own tab (all `q3` subclasses listed in "Where it lives").

### 27. Bundled sandbox vault (`x/obsidian/sandbox`)

31 short Markdown notes (~23 KB): `Start here` (welcome, "changes will not be saved" warning, link to help
site and to contribute via `obsidian-docs/Sandbox`), an **Adventurer** branch (choose-your-path pages for "no
prior experience", "from standard note-taking", "from plain-text note-taking") that funnel into value pages
(`Vault is just a local folder` — data ownership/back up yourself; `Plugins make Obsidian special for you`),
**Guides** (`Get started with Obsidian` → `Create a vault`, `Create your first note`, `Link notes` — the
linking guide frames linking as improving recall and insight), and **Formatting** (one page per syntax:
blockquote, callout, code, comment, diagram/mermaid, embeds, emphasis, footnote, heading, highlight, divider,
images, inline code, internal link, links, lists, math, strikethrough, table, task).
Mechanics: main process copies `resources/sandbox` to `<userData>/Obsidian Sandbox`, **deleting any previous
copy first** (so edits are discarded each time it is opened), unless a window for it is already open
(main.js:5395-5421). On load, if the vault is named "Obsidian Sandbox" and its path equals IPC
`get-sandbox-vault-path`, the workspace closes all leaves, shows a persistent notice and opens `Start here` in
Live Preview (app.js:107522-107534).

### 28. CLI handlers registered by core plugins (cross-cutting)

`app.cli` (`NF`, 58413) keeps `Map<name, {handler, description, flags}>`; flags are `{name: {value?,
description, required?}}`; help is rendered as `name=<value>` / `[optional]`; typos get suggestions by
prefix/substring/Levenshtein ≤ 3 (58380-58401); tables can be output as TSV/CSV/JSON; `tryResolveFile` accepts
`path=` or `file=` (link-resolved) or the active file (60419). Core-plugin handlers (observed, 44 total):
`search, search:context, search:open, web, base:query, bases, base:views, base:create, bookmarks, bookmark,
daily, daily:path, daily:read, daily:append, daily:prepend, history, history:list, history:read,
history:restore, history:open, links, outline, publish:*(6), sync, sync:*(6), templates, template:read,
template:insert, unique, wordcount, workspaces, workspace:save, workspace:load, workspace:delete`.
Built-ins (73 `registerHandler` calls) include file CRUD (`create, append, prepend, move, rename, delete, read,
diff`), graph queries (`backlinks, unresolved, orphans, deadends, aliases, tags, tasks`), plugin/theme/snippet
management, and developer hooks (`eval`, `devtools`, `dev:cdp`, `dev:dom`, `dev:console`, `dev:screenshot`).

---

## Data formats & on-disk files

| Location | Owner | Shape |
|---|---|---|
| `.obsidian/core-plugins.json` | `Z3` | `{ "<plugin-id>": true/false, ... }` (legacy: array of enabled ids + `core-plugins-migration.json`) |
| `.obsidian/daily-notes.json` | daily notes | `{format?, folder?, template?, autorun?(legacy)}` |
| `.obsidian/templates.json` | templates | `{folder?, dateFormat?, timeFormat?}` |
| `.obsidian/zk-prefixer.json` | unique note | `{folder?, template?, format?}` |
| `.obsidian/note-composer.json` | note composer | `{replacementText?: "link"/"embed"/"none", template?, askBeforeMerging?}` |
| `.obsidian/file-recovery.json` | file recovery | `{intervalMinutes: 5, keepDays: 7}` |
| `.obsidian/workspaces.json` | workspaces | `{workspaces: {<name>: <layout> & {mtime: string}}, active: string}` |
| `.obsidian/command-palette.json` | palette | `{pinned?: string[]}` |
| `.obsidian/page-preview.json` | page preview | `{<hoverSourceId>: boolean (require Mod)}` |
| `.obsidian/webviewer.json` | web viewer | `{openExternalURLs, enableAdblocking, homepage?, markdownPath?, searchEngine?, customSearchEngine?}` |
| `.obsidian/app.json` / `appearance.json` | settings tabs | keys/defaults in `XP` (50170) |
| IndexedDB `<appId>-backup` → store `backups` (indexes `path`, `ts`) | file recovery | `{path, ts (ms), data (full text)}` |
| IndexedDB `<appId>-webview` → `history` (keyPath `id`), `icons` (key host) | web viewer | `{id, title, url, accessTs}` / `{source, base64}` |
| Electron partition `persist:vault-<appId>` | web viewer | cookies, cache, storage of browsed sites |
| `<userData>/adblock/easylist.txt`, `easyprivacy.txt` | main process | cached filter lists |
| localStorage `<appId>-recent-commands` | palette | `string[]` (≤100) |
| localStorage `<appId>-page-preview-unfold-properties` | page preview | boolean |
| localStorage `<appId>-slow-startup-check`, `<appId>-config` | general / files tab | `"1"` / config-folder override |
| localStorage `most-recently-installed-version`, `didProvideMobileFeedback`, `vim` | app / banner / mobile vim | strings |
| `<userData>/Obsidian Sandbox/` | main process | fresh copy of `resources/sandbox` each open |

`appId` is the vault's random id (per vault), so all IndexedDB/localStorage state above is per vault and
per device (never synced).

---

## Rebuild notes

Design takeaways for a learning-focused knowledge app (Neural Map), separating essentials from incidentals:

1. **Plugin host contract** (essential): a feature module declares commands/ribbon/status/views/settings/CLI
   up front; the host registers and unregisters them atomically on toggle. Keep ids namespaced from day one
   (Obsidian's unprefixed legacy ids break its own "hotkeys" shortcut). Store per-feature JSON beside the
   vault, hot-reload on external change using an "ignore my own write" timestamp (cheap and robust for sync).
2. **Declarative settings** (essential): definitions with typed controls give you free search, consistent
   UI, and testability. Worth copying.
3. **Template engine** (essential, but do better): Obsidian's is two regex passes. Use a real tokenizer:
   escape values (avoid `$&`-style replacement bugs), don't re-expand variables inside inserted content, add
   `{{cursor}}`, and expose the same engine to daily notes, unique notes and refactors.
4. **Daily note = canonical date-addressed note** (essential for review loops): filename derived from a
   date format, strict round-trip parsing to recognise notes, prev/next navigation. Improve by indexing dates
   once (not O(n) scans per navigation) and by giving templates access to *the note's* date, not "now"
   (Obsidian's `{{date}}` in a daily template for tomorrow's note would still print today). This is the
   natural hook for a "weekly review" ritual.
5. **Link-preserving refactors** (high value for atomic notes): the `runAsyncLinkUpdate` pattern —
   snapshot every resolved reference, perform file ops, retarget, then rewrite only references whose
   resolution changed — plus an optimistic-concurrency check on the source. Splitting a long note into
   atomic notes without breaking links is directly useful for building a concept graph.
6. **Local history** (essential safety net): append-only snapshots keyed by path with time-throttling,
   de-dup by content, retention sweep, and snapshot-on-open. For a rebuild: store diffs or content-addressed
   blobs (Obsidian stores full copies with no size cap), snapshot all note types, and put it in SQLite next to
   your index so it is queryable ("what did I learn last week" = diff of snapshots).
7. **Word counting** (incidental but nice): run in a worker, debounce 200 ms, count CJK per character. A
   learning app might count *new* words/concepts per day instead.
8. **Resurfacing** (gap = opportunity): Obsidian core's only resurfacing is uniform random note. A retention
   product should replace this with scheduled review (SM-2/FSRS) over notes or extracted cards, weighted by
   graph centrality and last-review time — there is nothing to copy here.
9. **Web capture** (useful): Readability + Turndown gives a clean Markdown capture in two calls. Add what
   Obsidian omits: source URL, capture date and title in frontmatter, selection-to-note with a backlink to the
   source, highlights. Keep the browser in a sandboxed `<webview>` with a per-vault persistent partition.
10. **Presentations from notes** (incidental): split mdast at thematic breaks and hand sections to reveal.js
    — a cheap "teach it back" mode that could double as a self-test view.
11. **Incidental**: rating banner heuristics (≥50 files, ≥180 days, licensed), release-notes fetcher,
    font-detection-by-canvas trick, vim gate quiz.

---

## Open questions

1. ~~CLI subsystem transport and auth model~~ Resolved: see [01 — boot and main process](01-boot-and-main-process.md)
   (named pipe / Unix socket served by main, no caller authentication) and [12 — CLI](12-cli.md) (every command).
2. Exact `MA` illegal-character set used by daily-note format validation and `Y2` title sanitising
   (search `MA =` in app.js) — low priority.
3. ~~Who else calls `fileManager.storeTextFileBackup`?~~ Resolved by grep: Sync merge/overwrite (139885-139895)
   and failed saves in the Markdown/text views (99258, 103809); see §8.
4. Command-palette `sortSuggestions` length bonus: whether fuzzy scores are usually negative (making the bonus
   apply only to exact/prefix matches) — check `lx`/`cx` scoring in the fuzzy module (~43100).
5. ~~Mermaid "allow" toggle storage key~~ Resolved: localStorage `<appId>-mermaid-vault-trust`, JSON `true` or
   removed when off (app.js:99484-99491). See [04](04-markdown-rendering.md) for why the gate does not stop rendering.
6. Runtime confirmation of status-bar order and of the file-recovery snapshot cadence would need a live
   probe (not allowed under the brief); static reading is consistent but timing is inferred.
7. Whether `lib/defuddle.full.js` is loaded by `quicklook.js`, `help.js` or the Web Clipper bridge — grep
   those bundles for `defuddle`.
