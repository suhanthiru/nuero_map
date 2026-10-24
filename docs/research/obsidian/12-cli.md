# CLI command registry, renderer side (Obsidian 1.14.4 desktop)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

The CLI's semantics live in one renderer object, `app.cli` (class `NF`, app.js:58413-60483). It is a flat
`Map<name, {handler, description, flags}>`. The map is filled from three sources, in this order (**observed**):
core plugins in `onEnable` (44 commands), community plugins in `onload` through the public
`Plugin.registerCliHandler`, and finally `NF.init()` itself (73 built-ins, 3 of them hidden `__*` helpers). `init()`
runs once the workspace layout has finalised (app.js:145294). `init()` installs `window.handleCli(argv)`. The main process
reaches that function through `webContents.executeJavaScript`. It turns argv into a command name plus a flat
`{key: string}` bag (`k=v`, or a bare `k` meaning `"true"`), validates required flags against a small declarative
schema, awaits the handler, and returns **one string**. Errors are thrown **strings**, which main prefixes with
`Error: `. There is no streaming, no exit status (the client always exits 0), no cancellation and no caller
authentication. The same schema drives three things: `help` text, "Did you mean" suggestions, and the TUI's tab completion
(main pulls it as JSON through the hidden `__completions` command). The command set covers notes and properties,
links, tasks, plugins, themes, sync, publish and bases. It also includes ten desktop-only developer commands. Two of them,
`eval` (run JS in a Node-enabled renderer) and `dev:cdp` (raw Chrome DevTools Protocol), turn an enabled CLI into
same-user remote code execution. Nothing gates them except the global `cli` toggle. In particular, the enterprise
`policy.json` `devTools:false` does not gate them.

Transport recap (from [01 — boot and main process](01-boot-and-main-process.md) §9, not re-derived here): `Obsidian.com`/second `Obsidian.exe` →
named pipe `\\.\pipe\obsidian-cli-<user>` (POSIX: `~/.obsidian-cli.sock` / `$XDG_RUNTIME_DIR`) → one JSON header line
`{argv, tty, cwd}` → main `Pt` (main.js:4834) → `At` (main.js:4772) → `executeJavaScript("…window.handleCli(argv)…")`
in the chosen vault window, or the interactive TUI `zt` (main.js:714) when the client is a TTY with no args.

---

## Where it lives

| Minified id | Public / inferred name | Role | Lines |
|---|---|---|---|
| `NF` | `app.cli` (not in the public `.d.ts` App typings, **inferred**) | registry, argv parser, dispatcher, all built-in commands, shared formatters | app.js:58413-60483 |
| `NF.prototype.registerHandler` | – | add a command, throws on duplicate name | app.js:58418-58423 |
| `NF.prototype.unregisterHandler` | – | delete by name. If a handler ref is given, delete only when it matches | app.js:58436-58439 |
| `NF.prototype.init` | – | installs `window.handleCli`, drains `window.cliQueue`, registers built-ins | app.js:58440-60418 |
| `NF.prototype.formatTable` | – | rows → json / csv / tsv (headerless csv/tsv) | app.js:58424-58435 |
| `NF.prototype.tryResolveFile` | – | `path=` exact / `file=` wikilink-style / active file | app.js:60419-60441 |
| `NF.prototype.formatDiff` | – | line diff → `--- / +++` then `+ `/`- `/`  ` prefixed full listing | app.js:60442-60468 |
| `NF.prototype.formatAsciiTree(+WithRoot)` | – | `├── / └── / │` tree printer | app.js:60469-60482 |
| `FF` | (internal "table model") | `{header, body}` → `toCSV`/`toTSV`/`toText(sep)`/`toMarkdown`/`toObsidianTableClipboard`. Shared with Bases and table copy | app.js:58314-58377 |
| `AF` | diff-match-patch `patch_obj` | `@@ -a,b +c,d @@` hunk with `encodeURI`d text. **Not used by the CLI**; it belongs to the vendored dmp | app.js:58267-58291 |
| `DF` | diff-match-patch (Obsidian-extended, has public `diff_lineMode`) | line diff engine for `diff` | app.js:57592, 57623 |
| `RF` | "did you mean" ranker | prefix (score 0) → substring (1) → Levenshtein ≤3 (2+d), top 3 | app.js:58378-58402 |
| `BF` | usage-string builder | `flag=<value>` or `flag`, wrapped in `[...]` unless required | app.js:58403-58411 |
| `IF` | YAML stringify (vendored `yaml`, `nullStr:""`, `lineWidth:0`, no anchors) | `properties` default output | app.js:58294-58309 |
| `uF` | template variable expander | `{{title}}`, `{{date}}`, `{{time}}`, `{{date:FMT}}`/`{{time:FMT}}` | app.js:57546-57557 |
| `H3.registerCliHandler` | `Plugin.registerCliHandler` (public, `@since 1.12.2`) | prefixes description with `[<manifest.name>]: `, auto-unregisters on unload | app.js:109078-109084 |
| `Q3.registerCliHandler` | internal-plugin wrapper | same without prefix | app.js:110121-110126 |
| `xoe` (App) | `app.cli = new NF(app)`, `this.cli.init()` | creation / init | app.js:144743, 145294 |
| `Hx` / `Vx` | policy object / allow-check | `plugins/themes` checks in a few commands | app.js:43359-43372 |
| main `At`, `Pt`, `nt.initCompletions`, `Lo`, `Io` | main-process callers | dispatch, TUI completion loader, TUI tokenizer, usage-to-flags fallback | main.js:4772, 4834, 305-402, 242-270, 271-280 |
| core plugin classes | `E2` global-search, `c5` webviewer, `e9` bases, `h9` bookmarks, `bte` daily-notes, `Tte` file-recovery, `_te` outgoing-link, `Jte` outline, `tie` publish, `Jie` sync, `lre` templates, `dre` zk-prefixer, `yre` word-count, `wre` workspaces | register 44 commands in `onEnable` | see §14 |

---

## How it works

### 1. Lifecycle and registration order

1. `app.cli = new NF(app)` in the App constructor (app.js:144743). The registry starts empty.
2. During boot, core plugins are loaded and enabled (app.js:145060-145089). Their `onEnable` calls
   `plugin.registerCliHandler(...)`, which goes to `Q3.registerCliHandler` → `app.cli.registerHandler`, plus a
   `register()` cleanup that unregisters by `(name, handler)` (app.js:110121-110126). **Observed.** Publish and Sync are
   only loaded when `policy.publish` / `policy.sync` are true, and Web Viewer only on desktop with `policy.webViewer`
   (app.js:145085-145088).
3. Community plugins are initialised (`U3.initialize`, app.js:145236 → 109380ff), so their `onload` runs **before** `NF.init`.
   `Plugin.registerCliHandler` registers with a `[Plugin Name]: ` description prefix (app.js:109078-109084).
4. After the workspace layout is finalised: `this.cli.init()` (app.js:145294). In order, it:
   * defines `window.handleCli` (app.js:58442-58484),
   * subscribes `workspace.onLayoutReady` to drain `window.cliQueue` (requests that main queued while the renderer was
     still booting; each queued entry carries its own `resolve`/`reject`, app.js:58485-58492),
   * registers `help`, `__completions`, `__commands`, `__files` (app.js:58505-58577),
   * when `Platform.isDesktopApp && window.electron`, installs `error`/`unhandledrejection` listeners and registers the 10
     developer commands (app.js:58578-58903),
   * registers the remaining 59 general built-ins (app.js:58905-60417).
5. Disabling a core plugin, or unloading a community plugin, removes its commands. Re-enabling re-registers them.

Consequences (**inferred** from that order):
* A plugin can claim a name `NF.init` registers later (`read`, `files`, `tags`, ...). `registerHandler` then throws
  `Command "x" is already registered as a handler.` inside `init()`. All built-ins after that point would be missing,
  and the rest of the boot step at app.js:145295ff (`registerQuitHook`, indexing notice, share receiver) would be skipped.
  Nothing namespaces or reserves built-in names.
* A plugin that registers a name another plugin already holds makes that plugin's `onload`/`onEnable` throw.
* `unregisterHandler(name)` without a handler deletes unconditionally (app.js:58436-58439), and `app.cli` is
  reachable from any plugin. A plugin can therefore remove and replace built-ins such as `eval` or `read`, or wrap
  `window.handleCli` to observe every CLI call.
* The registry is also built on mobile. The developer block is skipped there, and `vaults` throws "This command is only available on
  desktop." (app.js:59625). No mobile code calls `handleCli`, so on mobile the registry has no transport (**inferred**;
  whether native shells inject calls is **unknown**).

### 2. From argv to a handler call (`window.handleCli`, app.js:58442-58484)

Main has already pre-filtered argv in the one-shot client path. It drops every argument that starts with `--` except
`--copy --help --json --md --tsv --csv`, and strips argv[0]/electron (main.js:3971-3975). It also removes a leading
`vault=<name>` (main.js:4865). The TUI path does **not** apply the `--` filter. It tokenises with `Lo` instead (§9).

Renderer algorithm (**observed**):

1. Log `Received CLI command <argv>` to the renderer console (argument values, note content and `eval` code included).
2. `cmd = argv[0]`. A missing value or `--help` becomes `help`.
3. Each remaining argument splits on its **first** `=`: `key=value` (the value may contain `=`), and a bare `key` becomes `"true"`.
   Duplicate keys: the last one wins. Undeclared keys are passed through untouched. There is no unknown-flag error.
4. **`cmd:flag` shorthand**: if `cmd` is not registered, split at the **last** `:`. If the prefix is a command and the
   suffix is one of its declared flags, run the prefix with `suffix="true"`. So `sync:off` = `sync off`,
   `tags:counts` = `tags counts`, `dev:debug:on` = `dev:debug on`. This only applies when the full name is unregistered,
   so `workspace:save` (a real command) is never re-read as `workspace save`.
5. Unknown command → throw `Command "x" not found.` followed by ` Did you mean: a, b, c?` (from `RF` over all keys,
   `__*` included) or ` It may require a plugin to be enabled.`
6. **Format aliases**: if the command declares a `format` flag whose placeholder lists alternatives (`json|tsv|csv`),
   and no `format=` was given, the first alternative (in placeholder order) present as a key `<alt>` or `--<alt>` sets
   `format=<alt>` and that key is removed.
   So `obsidian tags --json`, `obsidian tags json`, `obsidian base:query md` and `obsidian outline tree` all work.
   For commands without a `format` flag, `--json` silently arrives as an ignored key.
7. **Required check**: for every declared flag with `required:true`, the key must be present (`key in params`;
   an empty `key=` passes this check). Missing keys throw `Missing required parameter: a, b` followed by
   `\nUsage: <cmd> <BF(flags)>`.
8. `--copy` is removed from params and remembered.
9. `await handler(params)`. If `--copy` was set and the result is truthy, `navigator.clipboard.writeText(result)`.
10. Return the result string.

Semantics worth knowing (**observed** unless marked):
* **Booleans are truthiness tests on strings.** `"false"` is truthy, so `sync off=false` still pauses sync and
  `delete permanent=false` still deletes permanently. Only absence, or an empty `k=`, means false.
* `--help` is only special as argv[0]. `obsidian tags --help` runs `tags` with an ignored `--help` key. Per-command
  help is `obsidian help tags`.
* Content escapes are per handler, not global. Only `create`, `append`, `prepend`, `daily:append/prepend`,
  `base:create` and `unique` turn literal `\n` / `\t` into newline/tab. `eval code=` does not.
* Positional arguments do not exist. `help` fakes one by taking the first key whose value is `"true"`.
* The client's `cwd` is used only by main to pick the vault. It is never sent to the renderer, so `path=` is
  vault-relative (except the desktop `file:` prefix, §4).

### 3. Vault selection (main side, recap plus details)

`Pt` (main.js:4865) resolves the target vault, then `At` (main.js:4772) runs the command in that vault's window:
1. A **first** argument `vault=<x>` matches either a vault id or the vault folder basename, case-insensitive (`Ye`,
   main.js:4560-4567). The first registry match wins (**inferred** for duplicate names). In any other position,
   `vault=` reaches the renderer as an ordinary key that no handler reads.
2. Else the vault whose path equals the resolved `cwd` or is a prefix of it followed by the path separator
   (`Ft`/`Be`, main.js:4571-4588; a string compare, so **inferred** case-sensitive on Windows).
3. Else the most recently focused vault window (`ve`, main.js:4552-4559).
4. Nothing found, or an unknown name → `Vault not found.`. With the global `cli` toggle off →
   `Command line interface is not enabled. Please turn it on in Settings > General > Advanced.` (main.js:4773-4776).
   The vault window is opened **without focus** if it is closed (`se(id, false)`). If the renderer is not ready, the
   request waits in `window.cliQueue`.

Before any of this, `Pt` routes a last argument that starts with `obsidian://` (URI handler) or names an existing
file (open it), and both bypass the `cli` toggle (main.js:4849-4858, see 01 §9.1).

Inside the TUI, `vault:open <name>` switches the target for the session and opens that window. A per-line leading `vault=`
overrides it for one command (main.js:694-711).

### 4. File resolution (`tryResolveFile(params, fallbackToActive = true)`, app.js:60419-60441)

| Input | Resolution | Errors (thrown) |
|---|---|---|
| `path=<p>` (wins if both are given) | `vault.getAbstractFileByPath(p)`: exact vault-relative path **with extension**, no normalisation | `File "p" not found.` / `"p" is a folder, not a file.` |
| `file=<name>` | `metadataCache.getFirstLinkpathDest(name, "")`: wikilink resolution (extension optional, shortest-path match, case-insensitive basename) | `File "name" not found.` |
| neither, fallback on | `workspace.getActiveFile()` | `No active file. Use file=<name> or path=<path> to specify a file.` |
| neither, fallback off (`open`, `task`) | – | `Missing required parameter: file or path` |

Exceptions to this rule (**observed**):
* `tab:open file=` and `bookmark file=` take an **exact path** only (`getAbstractFileByPath`).
* `base:query`, `base:create` and `history:open` implement the path/file/active logic themselves with different messages.
  `history:open` never throws: an unknown file opens the modal without a file.
* `task` tries `ref`'s path as an exact path first, then as a linkpath (app.js:59278).
* On desktop, `getAbstractFileByPath` falls back to the external-file manager for `file:`-prefixed paths
  (app.js:50634-50637, 50115-50131). `path=file:<absolute path>` therefore resolves to a `TExternalFile`, which is a
  `TFile` subclass and passes the folder check, so `read`, `append`, `prepend`, `property:*`, `task` and `delete` can
  reach files outside the vault (**inferred**, not runtime-tested).
* `publish:*` call `tryResolveFile` only when `file`/`path` is given, otherwise use the active file with the message `No active file.`

### 5. Output model, formatters and errors

**Return contract.** A handler returns a string, or a Promise of one. Main writes it followed by a newline if the string
lacks one, then closes the socket (main.js:4841-4845, 4866-4868). An empty string or `undefined` produces **no output at all**.

**Errors.** Handlers `throw "<message>"` (plain strings, almost never `Error`s). `handleCli` lets them propagate,
`executeJavaScript` rejects, and `At` catches and returns `"Error: " + msg` for strings or `String(err)` otherwise
(main.js:4789-4792). That text is written like any normal result. **The process exit code is always 0**: the
client exits 0 on socket `end` and 1 only when it cannot connect or hits an uncaught exception (main.js:3999-4022).
A few handlers *return* their usage errors instead of throwing (`command` without id, `history:restore` without
version, `workspace:save` without name or active workspace), so those don't even get the `Error:` prefix. Successful
"empty" results are friendly sentences (`No tags found.`, `No backlinks found.`, ...), not empty output. A script
cannot tell "nothing" from "something" except by string matching.

**Conventions shared by most list commands**: `total` returns a count only. `counts` / `verbose` add columns.
Default output is newline-separated, natural-sorted with `Intl.Collator(numeric, sensitivity:"base")` (`BT`,
app.js:45171). Key/value records are `key\tvalue` lines.

**`formatTable(headers, rows, format)`** (app.js:58424-58435):
* `json` gives an array of objects keyed by header (missing/null → `""`), `JSON.stringify(…, null, 2)`.
* `csv` gives `FF.toCSV(false)`. Anything else (including absent) gives `FF.toTSV(false)`. **Neither has a header row.**
  Short rows are padded with `""`.

**`FF` table model** (app.js:58314-58377):
* `toText(sep, withHeader=true)`: a cell is double-quoted, with inner quotes doubled, if it contains `"`, `\n`, `\r` or
  the separator. This also applies to TSV (RFC-4180 style).
* `toMarkdown()`: escapes `|` as `\|`. Each column is as wide as its longest cell + 2. Cells are **centre-padded**.
  The separator row has dashes as wide as each column's content (`| ----- |`).
* `toObsidianTableClipboard()`: `{"header":[..],"rows":[[..]],"alignment":[null,..]}` JSON (used outside the CLI).
* `base:query` uses `FF` **with** headers (`toCSV()`/`toTSV()` default `true`), unlike `formatTable`.

**`formatDiff(a, b, labelA, labelB)`** (app.js:60442-60468): ensures both texts end in `\n`, runs `diff_lineMode` and
`diff_cleanupSemantic`, and prints `--- labelA`, `+++ labelB`, then **every** line of the merged sequence prefixed
`+ `, `- ` or two spaces. There are no hunks or context trimming, so it is not a patch. Version labels look like
`path (Local #3, 2026-10-20 14:03:11)` or `path (current)`.

**`formatAsciiTree(nodes, indent)`**: nodes are `{label, children?}`, drawn with `├── `, `└── `, `│   `.
`formatAsciiTreeWithRoot(root, nodes)` adds a root line. Used by `workspace` and `outline`.

**YAML** (`properties` for one file): the vendored `yaml` stringify with `null` printed as empty, no line wrapping, no
anchors (app.js:58294-58309).

### 6. Long-running work, streaming, concurrency

* **No streaming.** Every command is a single request → single string. There is no progress channel. A plugin
  handler cannot write incrementally either: the `CliHandler` type returns `string | Promise<string>`.
* **No timeout.** `At` awaits `executeJavaScript` indefinitely. Only the 5 s header timeout exists (main.js:4814).
  Slow commands (`search` reads every markdown file sequentially, `base:query` evaluates every markdown file,
  `tasks` re-reads every file with tasks, `plugin:install` downloads from GitHub, `publish:add changed` uploads
  one file at a time) simply block. **Inferred**: in one-shot mode with a TTY, the client puts stdin in raw mode and
  pipes it to the socket (main.js:4008-4009). Ctrl-C therefore becomes a `0x03` byte that main ignores
  (one-shot mode never reads after the header) instead of SIGINT, so a hung command cannot be interrupted from that terminal.
* **No cancellation**, even inside the TUI: keystrokes are dropped while `isProcessing` (main.js:731-733).
* **Concurrency**: separate connections run concurrently against the same renderer with no locking. `eval`
  monkey-patches the global `console.log/warn/error` for the duration of an awaited evaluation, so concurrent
  `eval`s or ordinary app logging during that window get mixed into the captured output (**inferred**).
* **Stateful dev "sessions"** are the only persistent mode: `dev:debug on` keeps a CDP attachment and a 200-entry console
  ring buffer until `dev:debug off`. `dev:cdp` and `dev:css` attach the same way and also leave it attached. The error ring (50 entries) is always on in desktop builds from `init()` onwards.
* Self-terminating commands: `reload`, `plugins:restrict on|off` reload after `setTimeout(10ms)` so the reply can
  leave first. `restart` calls IPC `relaunch` (main `app.relaunch(); app.quit()`, main.js:4984-4990). `dev:mobile`
  reloads synchronously through `app.emulateMobile`. Whether the reply always beats the teardown is **unknown**
  (race between the `executeJavaScript` resolution and window/app shutdown).

### 7. Help and usage text (app.js:58493-58540)

* Per-command block: two-space indent, command name padded to 22 columns, description. Then one line per flag:
  four spaces, `name=<value>` or `name` padded to 20 (or followed by two spaces when ≥20), `- `, the description,
  and ` (required)` when required.
* `help` with no argument: a fixed header (`Obsidian CLI`, `Usage: obsidian <command> [options]`, the global option
  `vault=<name>`, four usage notes: file vs path, active-file default, quoting `name="My Note"`, and `\n`/`\t` escapes in content), then
  `Commands:` (all names sorted with `BT`, `__*` hidden), then a `Developer:` section holding `dev:*`, `devtools` and `eval`.
* `help <x>`: every command equal to `x` or starting with `x:` (`help base` → `base:create`, `base:query`,
  `base:views`, but not `bases`). No match → `No commands matching "x".` plus a "Did you mean".
* All CLI strings are hard-coded English. None go through the i18n table `db` (**observed**: they are plain literals).
* Usage lines in errors come from `BF` (generated), but many handlers also hard-code their own `Usage:` strings,
  and some of those drift from the schema (e.g. `move` says `to=<folder> or to=<path>`).

### 8. Completion data: how main learns the command list (main.js:305-402)

The CLI ships no shell completion scripts (no bash/zsh/fish/PowerShell completion anywhere, **observed** by grep). Completion exists only in the TUI.
When the TUI starts (`zt` → `nt.initCompletions`), main calls the **same** `At` path four times:

| Request | Renderer result | Used for |
|---|---|---|
| `__completions` | `JSON.stringify({ <name>: { usage: BF(flags), description, flags: {<flag>: {value?, description(+ " (required)"), required?}} } })` for all non-`__` commands (app.js:58541-58553) | command names, descriptions, flag lists, enum values (`a|b|c` placeholders), `<command-id>` detection |
| `vaults` | newline list of vault names | `vault:open <name>` |
| `__files limit=1000` | JSON array of vault paths: files in `workspace.getLastOpenFiles()` first (kept in vault order, not recency order), then the rest. With `query=`, fuzzy-scored with `prepareFuzzySearch` and sorted by score. Default limit 20 (app.js:58558-58577) | `file=` (strips `.md`, quotes value), `path=`, `folder=` (derived from file paths), `.base`-only for `base:*` |
| `__commands` | JSON `[{id, name}]` from `commands.listCommands()` (app.js:58554-58557) | values for flags whose placeholder is exactly `<command-id>` (`command id=`, `hotkey id=`) |

Each response is only parsed if it starts with `{` or `[`, and failures are swallowed. The data is loaded **once per TUI
session**: commands that plugins register later, and files of a vault switched to with `vault:open`, are not reflected
(**observed**: `executeCommand` never calls `initCompletions` again). A command without a flags object falls back to
parsing its `usage` string with `Io` (main.js:271-280). The completion engine matches the first word by prefix, then by
description substring. Later words match not-yet-used flags by prefix. A partial `key=` completes values ([01](01-boot-and-main-process.md) §9.3
has the key bindings).

TUI tokenizer caveat (**observed**, `Lo` main.js:242-270): a backslash escapes the next character **everywhere,
including inside quotes**, and the backslash is dropped. The `\n` content escape documented in `help` therefore
arrives as plain `n` when typed in the TUI. It works only from a normal shell (one-shot mode), or as `\\n` in the TUI.

### 9. Plugin extension API

Public surface (obsidian-api `obsidian.d.ts`, `@since 1.12.2`, confirmed against app.js:109078):
`Plugin.registerCliHandler(command, description, flags: CliFlags | null, handler: CliHandler): void`, with
`CliFlag = {value?: string, description: string, required?: boolean}`, `CliFlags = Record<string, CliFlag>`,
`CliData = {[key: string]: string | 'true'}`, `CliHandler = (params: CliData) => string | Promise<string>`.
The doc comment recommends `<plugin-id>` / `<plugin-id>:<action>` names and says duplicates throw.

What a plugin handler receives (**observed**):
* exactly one argument: the parsed key/value bag after shorthand, format aliasing and `--copy` removal. Undeclared
  keys stay in it. Required keys are present (possibly empty).
* nothing else: no cwd, tty flag, vault, raw argv, stdin, caller identity, or output stream. The handler runs in
  the renderer with the plugin's full `app` access.
* its description is shown as `[Plugin Name]: <description>` in `help` and the TUI. Its flags appear in completion
  like built-ins. `value` placeholders containing `|` become enum completions, and the exact placeholder `<command-id>`
  gets command-palette completion.
* thrown strings become `Error: …` output. A thrown `Error` becomes `String(err)` (**inferred** formatting).
  Returning `undefined` prints nothing.
* the handler is unregistered automatically on plugin unload (`this.register(() => unregisterHandler(name, handler))`).
Nothing enforces the `<plugin-id>:` naming convention.

### 10. Developer commands and security semantics

All of these sit behind `Platform.isDesktopApp && window.electron` (app.js:58578) and nothing else. **No check of
`policy.devTools`** (`Hx.devTools` is never read by the CLI. **Observed**: only `Hx.plugins`/`Hx.themes` appear in
`NF`, app.js:58974-59082).

| Command | Mechanism | What it exposes |
|---|---|---|
| `eval code=<js>` | `await window.eval(code)` in the vault renderer (global scope). Vault windows have `nodeIntegration:true`, `contextIsolation:false` (main.js:4605-4612) | arbitrary JS **with Node `require`** (fs, child_process): full code execution as the user, plus the whole `app` object. Output: captured `console.log/warn/error` lines (warn/error prefixed `[warn]`/`[error]`), then `=> <value>` (objects as 2-space JSON). Exceptions are *returned* as `Error: msg`, not thrown |
| `dev:cdp method=<CDP.method> [params=<json>]` | `webContents.debugger` from `@electron/remote` (`getCurrentWebContents()`), attached at protocol `1.3`, with `Runtime.enable`, `DOM.enable`, `CSS.enable` (app.js:58590-58625) | any CDP command on the page target: `Runtime.evaluate`, `Page.navigate`, `Network.*`, `Storage.*`, `Input.dispatch*`, ... Equivalent to `eval` |
| `dev:debug on|off` | attach/detach the same debugger. Attach also starts `Runtime.consoleAPICalled` capture | – |
| `dev:console [limit=50] [level=…] [clear]` | reads the 200-entry console ring. Throws unless the debugger is attached | console contents (may include secrets plugins log) |
| `dev:errors [clear]` | 50-entry ring of `error`/`unhandledrejection` (always capturing) | stack traces |
| `dev:dom selector=… [total|text|inner|all|attr=|css=]` | `document.querySelectorAll` in-page | full rendered DOM, i.e. note contents, without CDP |
| `dev:css selector=… [prop=]` | `CSS.getMatchedStylesForNode` | stylesheet source lines |
| `dev:screenshot [path=]` | `webContents.capturePage()` → PNG written with `original-fs.writeFileSync` | writes to **any absolute path** (or vault-relative, or `os.tmpdir()`) |
| `devtools` | `webContents.toggleDevTools()` | (blocked when the window was created with `devTools:false` by policy, **inferred** from the webPreference) |
| `dev:mobile on|off` | `localStorage.EmulateMobile` + reload | – |

Caller checks: **none** anywhere in `handleCli` or in handlers. Trust rests on (a) the OS ACL of the pipe/socket and
(b) the global `cli` toggle in `obsidian.json` (default off; label "Command line interface", described only as
"Allow interactions with Obsidian from the command line.", with no security warning). Enabling it offers PATH
registration (app.js:132128-132150). There is **no `policy.json` key for the CLI** (policy keys: `plugins, themes,
snippets, sync, publish, webViewer, devTools, insider`, main.js:29-63), so managed deployments cannot force it off.
Any code already in the renderer can also call `window.handleCli` directly.

Destructive commands have **no confirmation, dry-run or undo prompt** (**observed**: no modal/confirm in `NF`):
`delete permanent`, `create overwrite`, `property:remove`, `history:restore`, `sync:restore`, `plugin:uninstall`,
`theme:uninstall`, `workspace:delete`, `publish:add` / `publish:add changed` (uploads to a public site without
the publish dialog's review), `publish:remove`, `plugins:restrict off`, and `plugin:install id=… enable` (downloads
`manifest.json`/`main.js`/`styles.css` from the plugin's GitHub release and runs it).

### 11. Policy and restricted-mode interplay (**observed** unless marked)

| Command(s) | Gate in the CLI | Gate further down | Net effect |
|---|---|---|---|
| `plugin`, `plugins`, `plugins:enabled`, `plugins:restrict` | `policy.plugins === false` → `Restricted: plugins are disabled.` | – | an allow-list array passes |
| `themes`, `theme` | `policy.themes === false` → `Restricted: themes are disabled.` | – | – |
| `plugin:install` | none | `installPlugin` has no policy check (app.js:109714ff) | files are written even when plugins are disabled by policy or not allow-listed (**inferred**). `enable` is then refused by `enablePlugin`'s `Vx(policy.plugins,id)` check, but the CLI ignores the result and still prints `Installed and enabled: …` (**observed**, app.js:60305-60308). `installPlugin` reports its own download failures with a Notice and returns without throwing, so the CLI can print `Installed: …` after a failed install (**inferred**) |
| `plugin:enable` (community) | none | `enablePlugin` checks the policy allow-list. `loadPlugin` is a no-op while restricted mode is on (app.js:109347) | in restricted mode the CLI prints `Enabled: x` and persists it to `community-plugins.json`, but no code loads until restricted mode is turned off (**inferred**) |
| `theme:install` | none | `installTheme` returns early if not allowed (app.js:45947) | the CLI still prints `Installed: x` (**inferred**) |
| `theme:set` | none | theme application checks `Vx(policy.themes)` (app.js:45641) | config saved, theme not applied (**inferred**) |
| `snippet:enable/disable` | none | CSS loader ignores snippets when `policy.snippets` is false (app.js:45663) | toggles config only |
| `sync*`, `publish*`, `web` | exist only if policy loaded the plugin **and** the user enabled it | `sync*` (except `sync`/`sync:status`) also require `vaultId` and a status not `paused`/`disconnected`/`error` | – |
| `eval`, `dev:*`, `devtools` | desktop only | none for `eval`/`dev:cdp` | `policy.devTools:false` does not stop them |

### 12. Built-in commands (`NF.init`, 73 registrations)

Legend: `*` = required. `(A)` = falls back to the active file when `file`/`path` are omitted. Output "lines" =
newline-separated. "tbl" = `formatTable` (headerless tsv default, `json`, `csv`). Line = registration line in app.js.

**Hidden helpers (3)**: `__completions` (58541), `__commands` (58554), `__files [query=] [limit=20]` (58558). See §8.

**Meta and app (8)**

| Command | Parameters | Behaviour | Output | Safety | Line |
|---|---|---|---|---|---|
| `help` | `<command>` (bare word) | full listing, or the command plus its `:` sub-commands | text | – | 58505 |
| `commands` | `filter=<prefix>` | `commands.listCommands()` ids by prefix | sorted ids, lines | – | 58905 |
| `command` | `id=<command-id>*` | `findCommand` then `executeCommandById` | `Executed: id`. Throws if unknown or the command reports failure | runs any palette command (some open dialogs) | 58917 |
| `reload` | – | `location.reload()` after 10 ms | `Reloading...` | – | 58963 |
| `restart` | – | `app.relaunch()` → IPC `relaunch` (quit + relaunch) | `Restarting...` | reply may be lost | 58969 |
| `version` | – | asar version + installer version | `1.14.4 (installer x.y.z)` | – | 59635 |
| `vault` | `info=name\|path\|files\|folders\|size` | vault name, absolute base path, file/folder counts, total bytes | `key\tvalue` lines or a single value | reveals the absolute path | 59566 |
| `vaults` | `total`, `verbose` | IPC `vault-list`, sorted by last-open `ts` desc | names, or `name\tpath` | desktop only | 59623 |

**Developer (10, desktop only, listed under "Developer:")**: `devtools` 58626, `dev:mobile [on|off]` 58630,
`dev:debug [on|off]` 58634, `dev:errors [clear]` 58650, `dev:screenshot [path=]` 58661,
`dev:cdp method=* [params=<json>]` 58682, `dev:css selector=* [prop=]` 58702,
`dev:dom selector=* [total] [text] [inner] [all] [attr=] [css=]` 58756,
`dev:console [clear] [limit=<n>] [level=log|warn|error|info|debug]` 58811, `eval code=*` 58830. Semantics in §10.
`dev:dom css=<prop>` has a bug: the specific-property path is unreachable, so it always prints a fixed list of 17
computed properties (`display … z-index`) (**observed**, app.js:58785-58790; the inner condition repeats the outer one).

**Files and folders (16)**

| Command | Parameters | Behaviour | Output | Safety | Line |
|---|---|---|---|---|---|
| `files` | `folder=`, `ext=`, `total` | `vault.getFiles()` with prefix/extension filter | paths | – | 59594 |
| `folders` | `folder=`, `total` | recursive folders under root or `folder` | paths | – | 59612 |
| `folder` | `path=*`, `info=files\|folders\|size` | recursive counts/size | `path/files/folders/size` kv | – | 59757 |
| `file` | `file`, `path` (A) | stat | `path,name,extension,size,created,modified` kv (epoch ms) | – | 59785 |
| `read` | `file`, `path` (A) | `vault.cachedRead` | raw content | – | 59983 |
| `open` | `file`, `path` (**no** active fallback), `newtab` | open in current or new tab | `Opened: path` | – | 59800 |
| `create` | `name`, `path`, `content`, `template`, `overwrite`, `open`, `newtab` | `path`+`name` join. A trailing `.ext` is split off. A `/` in `name` throws. `template` (needs Templates) expands `{{title}}/{{date}}/{{time}}` with Templates' formats, otherwise `content` with `\n`/`\t` escapes. Without `overwrite` → `fileManager.createNewFile` (creates folders, **auto-renames on collision**, unknown extensions become `.md`, **inferred** from `fileParentCreatorByType`, app.js:64301-64332). With `overwrite` and an existing file → `vault.modify` | `Created: p` / `Overwrote: p` | overwrite without prompt | 59815 |
| `append` | `file`, `path` (A), `content*`, `inline` | `vault.process`: content + `"\n"` + new text (unless `inline`; no check for an existing trailing newline) | `Appended to: p` | – | 59872 |
| `prepend` | same | inserts after the frontmatter block (`getFrontMatterInfo().contentStart`) | `Prepended to: p` | – | 59897 |
| `move` | `file`, `path` (A), `to*` | trims slashes. A `to` containing a `.` is a full target path, otherwise a folder (a folder named `v1.2` is misread). `fileManager.renameFile` (link updates per settings) | `Moved: a -> b` | – | 59923 |
| `rename` | `file`, `path` (A), `name*` | keeps the folder. Appends the old extension only if `name` has no `.` (`Notes 1.2` loses `.md`, **inferred**) | `Renamed: a -> b` | – | 59943 |
| `delete` | `file`, `path` (A), `permanent` | `vault.trash(file, true)`: system trash, falling back to `.trash`, **ignoring the user's "Deleted files" setting** (**observed**: it bypasses `fileManager.trashFile`, which reads `trashOption`, app.js:64700). `permanent` → `vault.delete`. Files only | `Moved to trash: p` / `Deleted permanently: p` | no confirm | 59964 |
| `diff` | `file`, `path` (A), `from=<n>`, `to=<n>`, `filter=local\|sync` | merges File Recovery snapshots (IndexedDB `backups`, index `path`) and Sync history (`getHistory`), newest first, numbered **1-based after filtering**. No from/to → list. `from` only → v`from` vs current. `to` only → v1 vs v`to`. Sync bodies via `getContentForVersion` | list: the path, then `#  Source  YYYY-MM-DD HH:mm:ss  size B  [device]` rows. Diff: §5 | read-only | 59996 |
| `random` | `folder=`, `newtab` | random markdown file, opened | `Opened: p` | – | 58937 |
| `random:read` | `folder=` | random markdown file | `path\n\ncontent` | – | 58950 |
| `recents` | `total` | `workspace.getLastOpenFiles()` | paths | – | 59462 |

**Metadata, links, tasks, hotkeys (15)**

| Command | Parameters | Behaviour | Output | Line |
|---|---|---|---|---|
| `tags` | `file`, `path`, `active`, `total`, `counts`, `sort=count`, `format=json\|tsv\|csv` | vault: `metadataCache.getTags()`. File: `getAllTags(cache)` occurrence counts | tbl `tag[,count]` | 59104 |
| `tag` | `name=<tag>*`, `total`, `verbose` | adds `#`, exact-case lookup of the count, files matched case-insensitively | files, or `#tag\tN` + files | 59300 |
| `tasks` | `file`, `path`, `active`, `daily`, `total`, `done`, `todo`, `status="<c>"`, `verbose`, `format` | `listItems` with a `task` char over all markdown files (or one file / today's daily note, **created if missing**), then each task's raw line read back via `cachedRead`. Filter precedence: `status` > `done` (≠ space) > `todo` (= space) | raw trimmed task lines. `verbose`: file header then `line\ttext`. `format`: tbl `status,text,file,line` | 59140 |
| `task` | `ref=<path:line>` or (`file`/`path`/`daily`) + `line=<n>`, `toggle`, `done`, `todo`, `status="<c>"` | regex on the raw line (`-`, `*` or `N.` bullets; **`+` bullets are not recognised**), single char status. Writes the whole file with `vault.modify` | info kv, or `Updated: [ ] → [x]\n<line>` | 59235 |
| `properties` | `file`, `path`, `active`, `name=`, `total`, `sort=count`, `counts`, `format=yaml\|json\|tsv` | file: frontmatter as YAML (default), JSON or `key\tvalue` (arrays joined `, `). Vault: `metadataTypeManager.getAllProperties()` + occurrence counts. `name=` → count. `format=json` → `[{name,type(widget),count}]` | see left | 59317 |
| `property:set` | `name*`, `value*`, `type=text\|list\|number\|checkbox\|date\|datetime`, `file`, `path` (A) | `[..]` JSON → list. Number validated. Checkbox `true`/`1`. List splits on `,`. Date `YYYY-MM-DD`, datetime `YYYY-MM-DDTHH:mm[:ss]`. `processFrontMatter`. **`type` also changes the vault-wide property type** (`list`→`multitext`) | `Set name: value` | 59369 |
| `property:remove` | `name*`, `file`, `path` (A) | `processFrontMatter` delete | `Removed: name` | 59424 |
| `property:read` | `name*`, `file`, `path` (A) | from the cache. Arrays as lines. `(empty)` | value | 59443 |
| `aliases` | `file`, `path`, `active`, `total`, `verbose` | `parseFrontMatterAliases` per file or vault-wide map | aliases, or `alias\tfiles` | 59717 |
| `backlinks` | `file`, `path` (A), `counts`, `total`, `format` | scan `metadataCache.resolvedLinks` for the target. `total` = **sum of link counts** | tbl `file[,count]` | 59638 |
| `unresolved` | `total`, `counts`, `verbose`, `format` | aggregate `unresolvedLinks` | tbl `link[,count[,sources]]` | 59664 |
| `orphans` | `total`, `all` (**declared but unused**) | every file (attachments included) with no incoming resolved link | paths | 59696 |
| `deadends` | `total`, `all` (unused) | every file (attachments included) with no outgoing resolved link | paths | 59710 |
| `hotkeys` | `total`, `verbose`, `format`, `all` (unused: commands without a hotkey are always listed) | effective (custom or default) hotkeys for `commands.commands` | tbl `id,hotkey[,custom]` | 59529 |
| `hotkey` | `id=<command-id>*`, `verbose` | – | `Ctrl + …` list, ` (custom)`/` (default)`, `(none)` | 59547 |

**Workspace UI (3)**: `tabs [ids]` 59454 (`[viewType] title[\tid]` for every leaf); `tab:open [group=<id>]
[file=<exact path>] [view=<type>]` 59466 (searches root/left/right/floating for a `WorkspaceTabs`-like group by id,
`createLeafInTabGroup`, or `getLeaf("tab")`); `workspace [ids]` 59510 (ASCII trees `main`, `left`, `right`,
`floating`, splits shown as `split:vertical` etc.).

**Plugins, themes, snippets (18)**

| Command | Parameters | Behaviour / output | Policy | Line |
|---|---|---|---|---|
| `plugin` | `id*` | core: `type core / name / enabled`. Community: `type/name/version/author/enabled[/description]` kv | `plugins===false` | 58973 |
| `plugins` | `filter=core\|community`, `versions`, `format` | **all** core ids + installed community manifests | `plugins===false` | 58989 |
| `plugins:enabled` | same | enabled core + community | `plugins===false` | 59011 |
| `plugins:restrict` | `on`, `off` | status `on`/`off`, or `plugins.setEnable(!on)` + reload | `plugins===false` | 59033 |
| `plugin:enable` / `plugin:disable` | `id*`, `filter=core\|community` | core first, then community (auto-detected). Core `enable(true)` / `disable(true)`. Community `enablePluginAndSave` / `disablePluginAndSave` | §11 | 60165 / 60200 |
| `plugin:reload` | `id*` | core: disable(false) + enable(false). Community: `disablePlugin`, `loadManifests`, `enablePlugin` (dev reload) | – | 60232 |
| `plugin:install` | `id*`, `enable` | `community-plugins.json` (cached 5 min) → repo → `manifest.json` from the repo HEAD (id must match) → `Rx` picks a release compatible with `minAppVersion` (via `versions.json`) → `installPlugin` | none (§11) | 60270 |
| `plugin:uninstall` | `id*` | `uninstallPlugin` | – | 60316 |
| `themes` / `theme` | `versions` / `name=` | installed themes (new + legacy). Active theme or `(default)` | `themes===false` | 59061 / 59081 |
| `theme:set` | `name*` (empty = default) | `customCss.setTheme` | (§11) | 60355 |
| `theme:install` | `name*`, `enable` | `community-css-themes.json` → manifest → compatible version → `installTheme` (also posts a download-stat ping to `releases.obsidian.md`, app.js:45955) | (§11) | 60364 |
| `theme:uninstall` | `name*` | `removeTheme` | – | 60400 |
| `snippets` / `snippets:enabled` | – | names | – | 59098 / 59101 |
| `snippet:enable` / `snippet:disable` | `name*` | `setCssEnabledStatus` | – | 60339 / 60347 |

### 13. Core-plugin commands (44 registrations; exist only while that core plugin is enabled)

| Plugin (class) | Command | Parameters | Behaviour | Output | Line |
|---|---|---|---|---|---|
| global-search (`E2`) | `search` | `query*`, `path=<folder>`, `limit=<n>`, `total`, `case`, `format=text\|json` | full Obsidian search syntax (`NL` query engine), sequential `cachedRead` over markdown files, skipping user-ignored paths. `limit` is applied **after** the full scan. `total` = number of **files** | paths, or JSON array / `{"total":n}` | 99834 |
| | `search:context` | same minus `total` | per content match: line number and trimmed line | `path:line: text`. JSON `[{file, matches:[{line,text}]}]` | 99860 |
| | `search:open` | `query=` | opens the search pane | `Opened search[: q]` | 99893 |
| webviewer (`c5`) | `web` | `url*`, `newtab` | prepends `https://` if there is no `://`, `openUrl` | `Opened: url` | 110615 |
| bases (`e9`) | `base:query` | `file`, `path` (else active `.base`, and the active view name), `view=<name>`, `format=json\|csv\|tsv\|md\|paths` (default json) | parse `.base` YAML. Global AND view filters over **all markdown files** (errors per file swallowed), sort by path, view ordering/columns via `BasesQueryResult` | JSON `[{path, <column display name>: string\|null}]`. CSV/TSV/MD **with** header. `paths` | 119771 |
| | `bases` | – | all `.base` files | paths | 119848 |
| | `base:views` | – (active file only) | views of the active base | `name\ttype` | 119860 |
| | `base:create` | `file`, `path` (else the active base view), `view`, `name` (default `Untitled`), `content`, `open`, `newtab` | folder and frontmatter derived from the view's filters (`L$`), `getAvailablePath`, `vault.create`, then `processFrontMatter` | `Created: p` | 119881 |
| bookmarks (`h9`) | `bookmarks` | `total`, `verbose`, `format` | file (`path#subpath`), folder, search, url items. `getBookmarks()` flattens groups depth-first via `M5` (app.js:120864), and group entries themselves print as `[group] <title>` | tbl `value` or `type,value,title` | 120921 |
| | `bookmark` | `file=<exact path>` (file or folder), `subpath`, `folder`, `search`, `url`, `title` (else the active file) | `addItem` | `Bookmarked…: x` | 120941 |
| daily-notes (`bte`) | `daily` | `paneType=tab\|split\|window` | get or **create** today's note, then open it | `Opened: p` | 127635 |
| | `daily:path` | – | computes the expected path (folder setting + format), **no creation** | path | 127652 |
| | `daily:read` | – | get or create, then read | content | 127674 |
| | `daily:append` / `daily:prepend` | `content*`, `inline`, `open`, `paneType` | like `append`/`prepend` (escapes, after frontmatter) | `Added to: p` | 127723 / 127729 |
| file-recovery (`Tte`) | `history` | `file`, `path` (A) | snapshots from IndexedDB `backups` (index `path`), newest first, **1-based** | `path` then `n\tYYYY-MM-DD HH:mm\t<size>` | 128304 |
| | `history:list` | – | unique paths via `openCursor(null,"nextunique")` | paths | 128322 |
| | `history:read` | `file`, `path` (A), `version=<n>` (default 1) | – | `path (version n, ts)\n---\n<content>` | 128345 |
| | `history:restore` | `file`, `path` (A), `version*` | **`adapter.write` directly** (bypasses `vault.modify`), then `forceAdd` a fresh snapshot | `Restored: …` | 128367 |
| | `history:open` | `file`, `path` (lenient) | opens the recovery modal | text | 128397 |
| outgoing-link (`_te`) | `links` | `file`, `path` (A), `total` | `frontmatterLinks` + `links` + `embeds`, resolved against the file. Unresolved marked ` (unresolved)`. De-duplicated | sorted lines | 129794 |
| outline (`Jte`) | `outline` | `file`, `path` (A), `format=tree\|md\|json`, `total` | `cache.headings` (markdown only) | ASCII tree (nesting by level stack). `#… heading`. JSON `[{level, heading, line}]` (1-based) | 130470 |
| publish (`tie`) | `publish:open` | `file`, `path` (else active) | must already be published (`apiList`). Opens the URL via `window.open` | URL | 134709 |
| | `publish:status` | `total`, `new`, `changed`, `deleted` | `scanForChanges`. Default hides `to-delete` | `type\tpath` | 134737 |
| | `publish:list` | `total` | `apiList` | paths | 134769 |
| | `publish:site` | – | slug, `publish.obsidian.md/<slug>`-style URL, custom domain | kv | 134787 |
| | `publish:add` | `file`, `path` (else active), `changed` | single: supported type, not `publish: false`, then upload. `changed`: uploads every new/changed file sequentially, **does not delete** removed ones, reports failures | summary | 134809 |
| | `publish:remove` | `file`, `path` (else active) | `apiRemoveFile` | `Unpublished: p` | 134866 |
| sync (`Jie`) | `sync` | `on`, `off` | `setPause` | status text | 138864 |
| | `sync:history` | `file`, `path` (A), `total` | `getHistory(path)`, **0-based**, `0` = newest | `i: ts (N bytes) [device] [deleted] (renamed from x)`, `(more history available)`, total `N+` | 138867 |
| | `sync:read` | `file`, `path` (A), `version*` | `getContentForVersion(uid)` | `path (version i, ts)\n---\n<content>` | 138901 |
| | `sync:restore` | `file`, `path` (A), `version*` (≠0) | `restoreVersion(uid, path)` | `Restored …` | 138929 |
| | `sync:open` | `file`, `path` (A) | opens the version-history UI | text | 138958 |
| | `sync:deleted` | `total` | `server.listDeleted()`, oldest first after `reverse()` | `ts: path (N bytes) [device]` | 138974 |
| | `sync:status` | – | status, remote vault name, device name, vault size, account usage/limit | `key: value` lines | 139003 |
| templates (`lre`) | `templates` | `total` | `.md` files under the templates folder, relative, without extension | names | 140727 |
| | `template:read` | `name*`, `resolve`, `title=` | resolution: exact `<folder>/<name>.md`, else case-insensitive relative-name match | raw or expanded text | 140742 |
| | `template:insert` | `name*` | needs an active editor. `insertTemplate` | `Inserted template: x` | 140759 |
| zk-prefixer "Unique note creator" (`dre`) | `unique` | `name=`, `content=`, `paneType`, `open` | timestamped unique name (`getUniquePath`). Plugin folder setting. Template expansion only when there is no `content` | path | 141014 |
| word-count (`yre`) | `wordcount` | `file`, `path` (A), `words`, `characters` | markdown only. Same strip function and word regex as the status bar | `words: N\ncharacters: M`, or one number | 141296 |
| workspaces (`wre`) | `workspaces` | `total` | names, ` (active)` marker | lines | 141437 |
| | `workspace:save` | `name=` (else the active workspace) | save + set active | text | 141443 |
| | `workspace:load` / `workspace:delete` | `name*` | – | text | 141447 / 141465 |

Core plugins with UI counterparts but **no** CLI commands of their own: file explorer, graph, canvas, backlinks pane, tag pane,
properties pane, page preview, note composer, switcher, command palette, slides, audio recorder, random note,
markdown importer, footnotes. Several of these are covered by built-ins instead (`backlinks`, `tags`, `properties`,
`random`, `commands`). **Observed** from the grep of all 44 `registerCliHandler` call sites.

Index-base inconsistency (**observed**): File Recovery `history*` is 1-based, `diff` is 1-based over a merged
and filtered list, and `sync:*` is 0-based with 0 = current.

---

## Data formats & on-disk files

**Flag schema** (`CliFlag`): `{ value?: "<placeholder>" | "a|b|c", description: string, required?: boolean }`. Two
placeholder values have meaning: one containing `|` (enum completion and `--alt`/bare-word format aliasing when the flag
is named `format`) and the exact `<command-id>` (palette completion). The quote-wrapped `"<char>"` used by
`tasks`/`task` is cosmetic.

**`__completions` JSON** (internal contract between renderer and main TUI):
```
{ "<name>": { "usage": "<BF string>", "description": "<desc>",
              "flags": { "<flag>": { "value"?: "...", "description": "<desc>[ (required)]", "required"?: true } } | undefined } }
```

**JSON shapes produced** (all `JSON.stringify(x, null, 2)` unless noted):
* `formatTable` json: `[{ <header>: string }]`.
* `properties format=json` (vault): `[{name, type, count}]`. For a file: the frontmatter object.
* `outline format=json`: `[{level, heading, line}]`.
* `search format=json`: `["path", ...]` (compact). `search:context format=json`: `[{file, matches:[{line, text}]}]` (compact).
* `base:query` json: `[{path, "<column display name>": string|null}]`.
* `__files`: `["path", ...]`. `__commands`: `[{id, name}]` (compact).
* `dev:cdp`: the raw CDP result object.

**Files and state written by CLI commands** (beyond normal note edits): `dev:screenshot` PNG (default
`<tmp>/obsidian-screenshot-<…>.png`. The name is built by calling `toLocaleString("sv")` on a **number** (`Date.now()`),
so it holds digit groups separated by non-breaking spaces rather than a date, **inferred**); `.obsidian/plugins/<id>/{manifest.json,main.js,styles.css}`
(`plugin:install`); `.obsidian/community-plugins.json` (enable/disable); `localStorage["enable-plugin-<appId>"]`
(`plugins:restrict`); `localStorage["EmulateMobile"]` (`dev:mobile`); `localStorage["local-themes"]` (theme install);
the vault-wide property type registry (`property:set type=`); `workspaces.json` (workspace commands).
The global toggle is `obsidian.json` → `"cli": true`.

---

## Rebuild notes

Essential ideas worth keeping:
1. **One registry, three consumers.** A declarative command spec (`name`, `description`, typed params with
   placeholder/enum/required) generates help, "did you mean", shell/TUI completion and validation. Plugins use
   the same API. This is the best part of Obsidian's design and costs very little.
2. **`noun:verb` naming + shorthand** (`sync:off` ≡ `sync off`) and `--json/--csv/--md` aliases make a flat
   `key=value` grammar pleasant. Keep `file=` (fuzzy, link-style) vs `path=` (exact), with an explicit opt-in active-file default.
3. **Queue until ready**: requests that arrive while the app boots are parked and replayed after the UI is ready.

Things to do better in a clean design (for a Tauri app):
* **Structured results.** Handlers return `{ok, data, error, code}`, and formatting (`text|json|tsv|csv|md`) happens once
  at the edge with consistent header rules. Map errors to **non-zero exit codes**. Obsidian's string-only contract
  makes scripting fragile ("No tags found." vs data; `Error:` vs a return value; the exit code is always 0).
* **Typed params.** Parse booleans properly (`=false`), integers and enums in the registry, and reject unknown flags.
  Then handlers never re-check `required` with hand-written usage strings.
* **Streaming and cancellation.** Use NDJSON frames over the socket (`{type:"progress"|"line"|"result"|"error"}`)
  plus a cancel frame. Give each request an id and a timeout. Don't put the client TTY in raw mode for one-shot commands,
  so Ctrl-C works.
* **Security.** Write a per-session random token to a user-only file and check it in the header. Put dangerous capabilities
  (`eval`, CDP, arbitrary-path writes, plugin install, publish/sync writes, permanent delete) behind a separate
  "developer/automation" switch and a policy key. Add `--dry-run`/`--yes` for destructive verbs. Keep an audit log of CLI calls.
  Never `eval` in a Node-enabled context. In Tauri, run scripts in an isolated webview or a sandboxed JS engine
  with an explicit API.
* **Namespacing.** Reserve built-in names before plugins load (or register built-ins first). Require plugin commands to
  be `<plugin-id>:…`. Make `unregister` require ownership.
* **Consistency.** Use one version-index base everywhere, one file-resolution helper everywhere, and route deletes through the
  user's trash preference. Load completion data lazily per request (or push an "invalidate" event), so plugin
  commands and vault switches show up.
* **Incidental** (skip it): the ASCII-art TUI banner, Swedish-locale timestamps, centre-padded markdown tables, and the
  per-handler hand-written `Usage:` strings.

---

## Open questions

1. **Error object formatting.** Does Electron's `executeJavaScript` reject with the original thrown string, or
   wrap it in an `Error`? That decides `Error: msg` vs `Error: Error: msg`. *Probe*: enable the CLI in a scratch vault and run
   `obsidian read path=nope.md`.
2. **`--copy` without focus.** `navigator.clipboard.writeText` normally requires a focused document, and `At` opens
   windows unfocused. Does `--copy` fail with "Document is not focused" when Obsidian is in the background (after the command's
   side effects have already happened)? *Probe*: run any command with `--copy` while another app has focus.
3. **`dev:cdp` under `policy.devTools:false`.** Does `webContents.debugger.attach` still work when the window was
   created with `devTools:false`? If so, the policy fails to disable developer access over the CLI. *Probe*: drop a test
   `policy.json` on a VM.
4. **Self-terminating commands.** Do `restart`, `dev:mobile` and `plugins:restrict` reliably deliver their reply before
   teardown, or can the client hang or see a broken pipe?
5. **Obsidian.com argv handling.** Does the console shim apply the same `--` filter and argv[0] stripping as
   `Obsidian.exe`'s client path (main.js:3971-3975)? `--copy`/`--json` semantics depend on it. *Probe*: strings in
   `Obsidian.com`, or a pipe sniffer.
6. **Ctrl-C in one-shot mode** (raw stdin piped to a socket nobody reads): confirm it cannot interrupt a slow
   command, both for `Obsidian.exe` as client and for `Obsidian.com`.
7. **Mobile.** The registry exists on iOS/Android. Do the native shells (Shortcuts, intents) ever call
   `window.handleCli`? Nothing in app.js does.
