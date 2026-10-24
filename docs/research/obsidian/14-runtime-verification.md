# 14 — Runtime verification pass (2026-10-22)

> Part of the [Obsidian 1.14.4 teardown](README.md). This pass ran the real app against a throwaway vault to
> confirm or refute the questions the static reading left open. Results here are **observed at runtime**
> unless stated otherwise. Nothing here is Obsidian code.

## Setup

| | |
|---|---|
| App | the installed Obsidian 1.14.4 (Electron 43.7.7, Chromium 150, Node 24.21.0) |
| Isolation | `--user-data-dir` pointed at a new empty profile, so the test had its own vault registry, IndexedDB, localStorage and single-instance lock; it never saw the user's vault, settings or account token |
| Vault | a new throwaway vault of 15 probe files (Mermaid, comments, headings, CRLF, Bases, canvases, rename fixtures), registered only in the test profile's `obsidian.json` |
| Instrumentation | `--remote-debugging-port=9333` on loopback (a Chromium switch; it is not covered by the disabled `--inspect` fuse), driven by a small CDP client that ran probe scripts in the renderer and read the accessibility tree |
| Shutdown | CDP `Browser.close` on the test instance's own browser endpoint |

### What REA could and could not do here

* `list_electron_targets` and `list_browser_targets` both connected and confirmed the browser identity
  (Evidence `ev_bdf13da2…6bab9d`, `ev_1d6cf68a…8842ca`), but **listed no targets**: the Obsidian window is served
  from the custom `app://obsidian.md/index.html` scheme, and REA's Electron page tools accept only `file://` pages
  while its browser tools accept only `http(s)` pages. `inspect_web_page` refused the target for the same reason.
* `capture_electron_scenario` (REA-owned launch) refused the target because the
  `EnableNodeCliInspectArguments` fuse is disabled in `Obsidian.exe`, which matches the static fuse evidence
  (`ev_9986ca49…b9b1a`). REA's suggested alternative, a stock Electron runtime running the extracted app,
  was not attempted.
* REA's passive tools never evaluate JavaScript by design, and these questions needed code run in the page. The probes
  therefore used a minimal CDP client. Each probe's code and output stayed in the scratchpad; the results are
  below.

## Results

| # | Question (doc) | Static claim | Runtime result |
|---|---|---|---|
| 1 | Renderer isolation ([01](01-boot-and-main-process.md)) | `nodeIntegration` on, no context isolation, not sandboxed, remote enabled | **Confirmed.** `require` exists, `process.contextIsolated === false`, `process.sandboxed === false`, `@electron/remote` available |
| 2 | Storage names ([00](00-architecture-overview.md), [03](03-metadata-cache-and-links.md)) | `<vaultId>-cache` v19, `<appId>-backup`, `<appId>-sync`; appId = vault id | **Confirmed.** IndexedDB `<id>-backup v1`, `<id>-cache v19`, `<id>-sync v1`; `app.appId` equals the registry id. The trust flag is `<id>-mermaid-vault-trust` in localStorage |
| 3 | Default core plugins ([07](07-plugins-and-api.md)) | 9 off by default | **Confirmed.** 21 enabled; off: audio-recorder, footnotes, publish, random-note, slash-command, slides, webviewer, workspaces, zk-prefixer. Sync is enabled by default even with no account |
| 4 | Mermaid trust gate, untrusted vault, Reading view ([04](04-markdown-rendering.md)) | the ungated post-processor still calls `mermaid.render`; output not shown | **Confirmed with a nuance.** In 6 of 7 Reading-view opens across 4 cold starts, Obsidian loaded `mermaid.min.js` (when not yet loaded) and called `mermaid.render` once on the diagram source, while the view showed only the "Allow" guard and no SVG. The exception was one open in a brand-new tab after Mermaid was already loaded, which rendered nothing (the deferred render waits for the code block to be shown, and it never is once the guard replaces it) |
| 5 | Mermaid, trusted vault, Reading view | two renders per diagram | **Confirmed.** 2 `mermaid.render` calls for one diagram; one SVG shown |
| 6 | Mermaid in Live Preview | gated path only | **Confirmed.** Trusted: 1 render, diagram shown. Untrusted: 0 renders, guard shown |
| 7 | Links inside `%%comments%%` ([03](03-metadata-cache-and-links.md)) | indexed | **Confirmed.** Inline and block-comment links appear in `resolvedLinks` (so in the graph) and in backlinks |
| 8 | Position of a link on a block comment's opening line ([03](03-metadata-cache-and-links.md)) | suspected shifted | **Confirmed, and it corrupts notes.** For `%% [[Target B]] on the opening line`, the cached offset is 2 characters early (cached text `% [[Target B`). With link auto-update on, renaming `Target B` rewrote the line to `%[](Target%20Bee.md)]] on the opening line`, which destroys the comment opener and leaves a broken link. Text meant to stay hidden can then become visible |
| 9 | Heading text with a trailing `^id` | unknown | **Observed:** `headings[].heading` keeps it (`"Heading with id ^abc123"`); the block id is also in `blocks` |
| 10 | Extra sections in notes with footnotes | two trailing sections | **Confirmed:** after `footnoteDefinition`, two more sections typed `text` and `element` on the same line |
| 11 | CRLF on save ([02](02-vault-and-files.md), [05](05-editor-and-live-preview.md)) | probably converted | **Confirmed:** the editor's text has no `\r`; after one edit and a save, the whole file was rewritten with LF only (3 of 3 line endings) |
| 12 | A moved note's own links ([03](03-metadata-cache-and-links.md)) | "not re-resolved" | **Refuted / clarified.** Moving `f1/Linker.md` (`[[Dup]]`, resolving to `f1/Dup.md`) into `f2/`, where its link would now resolve to `f2/Dup.md`, made Obsidian rewrite the link to `[[f1/Dup]]` so the target stays the same; `resolvedLinks` for the new path was correct immediately (with "Automatically update internal links" on) |
| 13 | Bases `&&` vs `\|\|` precedence ([09](09-canvas-and-bases.md)) | unknown | **Answered:** `true \|\| false && false` = `true`, so `&&` binds tighter (standard precedence). `1 + 2 * 3` = 7 |
| 14 | Bases `!null` | `!null` is null | **Confirmed:** `!note.missing` → null; `(!note.missing).isType("null")` → true |
| 15 | Search keywords ([08](08-search-and-navigation.md)) | `EMPTY` matches all, `TRUE` nothing | **Confirmed:** `TRUE` 0, `FALSE` 0, `EMPTY` 12 (every Markdown note). Lowercase `or` is an ordinary word (`alpha or zzz` → 0); only `OR` works (→ 1) |
| 16 | Malformed `.canvas` JSON ([09](09-canvas-and-bases.md)) | unguarded parse; overwrite risk unknown | **Safe:** the tab falls back to an empty view and the file is untouched. Minor bug: the notice reads `Failed to open “”` with the file name missing |
| 17 | Unknown canvas node types and dangling edges | dropped on next save | **Confirmed:** in memory and after a save, the `custom-widget` node is gone, along with both its edge and the edge to a missing node; unknown top-level keys survive |
| 18 | Hotkey first-match bug ([06](06-workspace-and-ui.md)) | first matching binding wins even if its command can't run | **Confirmed.** `Ctrl+Shift+F9` bound to `editor:toggle-bold` then `app:open-settings`, with no editor open: nothing happens. Bound in the other order, or alone: Settings opens |
| 19 | Settings window | modal | **Observed:** in 1.14 Settings opens as a separate popout window (`about:blank` target titled "Settings - …"), driven by the main window's JS |
| 20 | Toggle state for screen readers ([06](06-workspace-and-ui.md)) | `input.checked` never updated | **Confirmed.** In Editor settings, 12 of 17 toggles were visually on, yet all 17 underlying checkboxes report `checked: false` to the accessibility tree, and none has an accessible name. A screen reader hears "checkbox, not checked" with no label |
| 21 | Other accessibility claims | no dialog/tab/status roles; icon controls not focusable | **Confirmed in the accessibility tree:** Settings `.modal` is role none; notices are generic divs with no live region (0 `aria-live` regions in the window); tab headers are `group`, not `tab`, and not focusable; tab close buttons are hidden from assistive tech; ribbon actions are named but not focusable; sidebar toggles have an empty name and are not focusable; 4 of 27 `.clickable-icon` controls are focusable; settings nav items are focusable generics with no `tab` role; dropdowns are unnamed comboboxes; 1 `prefers-reduced-motion` rule in all loaded CSS |

## Not covered

* Sync and Publish behaviour (needs an account and subscription), web viewer, CLI over the real pipe, screen-reader
  speech itself (the accessibility tree is what a screen reader receives; actual NVDA output was not recorded),
  Windows watcher overflow on mass changes, and `sim.js` WASM constants.

## Incident during the pass

The user's own Obsidian instance, open on their real vault, exited at about 02:54 local time. That was about
90 seconds after the isolated test instance started (02:53) and about 13 seconds after a probe opened a note *in
the test instance*. It left no crash dump or Crashpad report, and its vault registry still marks the vault as open,
which fits an app quit or abrupt exit rather than a normal window close. Windows had logged GPU driver resets
(LiveKernelEvent 141/193) at 02:49 and 02:52. The test instance used a separate profile, and its graceful shutdown
came about 13 minutes later, so that shutdown did not cause the exit. Whether starting the second instance
contributed is **unknown**.

**Practical advice for a rerun:** quit your own Obsidian first. Running a second Electron instance of the same app,
even with a separate profile, also contends for the per-user CLI pipe name `\\.\pipe\obsidian-cli-<user>`. The test
instance only logged an error for that, but it is avoidable.
