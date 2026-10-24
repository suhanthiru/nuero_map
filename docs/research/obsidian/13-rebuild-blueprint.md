# Rebuild blueprint: an Obsidian-class app on Tauri 2, and what Neural Map should borrow

> Part of the [Obsidian 1.14.4 teardown](README.md). This is design guidance distilled from the subsystem
> documents' "Rebuild notes" sections. It describes ideas and architecture, not Obsidian code. Where it says
> "Obsidian does X", the evidence is in the linked document.

Neural Map is not a notes app: topics live in SQLite and are created from chat history. So this page has two
parts:
1. a **general blueprint**, the order in which you would rebuild Obsidian's core on Tauri 2 / Rust / React,
   keeping what is essential and fixing what the teardown found weak;
2. a **Neural Map mapping**: concrete borrowings for the code that exists today, ranked by value for the
   priorities in memory (graph visuals, easy visualisation, accessibility, retention).

## Part 1 — General blueprint

### Target architecture

```
 Rust core (Tauri 2)                                        WebView (React)
 ┌───────────────────────────────────────────┐   typed     ┌─────────────────────────────────────────┐
 │ vault: watcher (notify) → reconcile by     │  commands   │ workspace tree (split/tabs/leaf), deferred│
 │   stat → stable file ids                   │  + events   │   views, per-leaf history                 │
 │ index: blake3 gate → parser (rayon pool)   │ ◀─────────▶ │ editor: CM6 + lezer markdown + wikilink/  │
 │   → SQLite: files, metadata, links,        │             │   tag/block-id extensions, live preview   │
 │   backlinks (reverse index), FTS5          │             │ reading view: sections + recyclers        │
 │ resolver: segment-aware, incremental       │             │ graph: WebGL/canvas + worker physics      │
 │ rename: snapshot → re-resolve → rewrite    │             │ command registry ⇄ palette, hotkeys, CLI  │
 │ history: content-addressed snapshots       │             │ plugin sandbox (iframe/worker + RPC)      │
 │ sync (optional): uid log + 3-map state     │             │ design tokens (3 tiers) + full ARIA       │
 │ CLI: named pipe / UDS + console shim       │             └─────────────────────────────────────────┘
 └───────────────────────────────────────────┘
```

The one structural change from Obsidian: **the index lives in Rust and SQLite, not in the renderer**. Obsidian
keeps the vault object model in JavaScript and pays for it with main-thread link resolution, linear search scans
and no reverse index ([03](03-metadata-cache-and-links.md), [08](08-search-and-navigation.md)). A Tauri app has a
real backend; use it.

### Build order

Each phase lists the Obsidian idea to keep and the fix to apply. The "done when" lines are acceptance tests.

**Phase 1 — Files and identity** ([02](02-vault-and-files.md))
- Keep: two layers (flat stat table, then object tree with stable ids); every watcher event re-stats and diffs
  instead of being trusted; own writes reconcile before the call returns; a hidden-by-rule config folder;
  NFC/slash path normalisation; a per-vault case-sensitivity probe.
- Fix: atomic writes (temp file + fsync + rename, keeping the birth time); a lowercase path index instead of
  linear scans; `.trash` that keeps relative paths; surface config parse errors instead of overwriting the file.
- Done when: an external editor, a `git checkout` and a sync client can all change files while the app is open,
  and the tree, open editors and links stay correct.

**Phase 2 — Index and links** ([03](03-metadata-cache-and-links.md))
- Keep: content-addressed cache (`path → (mtime, size, hash)`, `hash → metadata`); parse off the UI thread;
  positional metadata (0-based line/col plus offset, exclusive ends); events `changed`/`deleted`/`resolved` plus
  a "clean" barrier; resolution order (exact relative → exact absolute → unique basename → suffix with same-subtree
  preference → shortest path).
- Fix: segment-aware suffix tests; a **reverse link table** so backlinks are O(degree); incremental resolution keyed
  on which unresolved names each file depends on; persist resolved links so a cold start doesn't redo them; show
  YAML errors instead of silently dropping all frontmatter; decide deliberately whether links in `%%comments%%`
  count.
- Done when: renaming a note with 500 backlinks rewrites exactly those links, in under a second, and nothing else.

**Phase 3 — Shell, commands, keyboard** ([06](06-workspace-and-ui.md), [07](07-plugins-and-api.md))
- Keep: one `Component`-style owner per view, menu, window and plugin, with LIFO cleanup; a serialisable layout
  tree with collapse rules and percentage sizes; deferred views that build on first visibility; a per-window scope
  stack for keys; one command registry feeding the palette, hotkeys, menus and CLI; declarative settings
  definitions (searchable).
- Fix: the hotkey first-match bug; a real history cap; persist history; accessibility from day one (see below).
- Done when: every action is a command, reachable from the palette, a hotkey and the keyboard alone.

**Phase 4 — Editor and reading** ([05](05-editor-and-live-preview.md), [04](04-markdown-rendering.md))
- Keep: two-layer live preview (inline hide/reveal per formatting run in a ViewPlugin; block widgets in a
  StateField); freeze decorations while the mouse is down or an IME is composing; widget pooling; a throttled save
  (first edit + N s) with immediate save on blur or close and a three-way merge when the file changed on disk;
  Reading view as top-level sections diffed by value, with recyclers for expensive widgets, progressive
  time-sliced rendering, scroll position as a fractional source line, and one sanitiser at the boundary.
- Fix: use **one grammar** (a lezer Markdown grammar with GFM plus wikilink, embed, highlight, comment, block-id,
  math and callout extensions) for the editor, and the same extensions for the index parser. Obsidian runs a CM5
  mode in the editor and a remark-8 fork for indexing and reading. Restrict block-widget rebuilds to the viewport.
- Done when: a 5,000-line note types without lag in live preview with a Reading view open beside it.

**Phase 5 — Search and navigation** ([08](08-search-and-navigation.md))
- Keep: the query language's matcher tree with tri-state results (match / no match / not applicable) and
  per-field ranges; operators declare whether they need content; scope operators (`line:`, `block:`, `section:`)
  split content using cached sections; the fuzzy scorer's tiered penalties (gaps ≫ mid-word starts ≫ spread ≫
  position ≫ length); unlinked mentions with a one-click link.
- Fix: SQLite FTS5 (or tantivy) as the candidate index with the matcher tree as verifier; run off the UI thread;
  BM25 relevance with a title boost; diacritic folding; recency and frequency boosts in the switcher; skip code
  and URLs in unlinked mentions.

**Phase 6 — Extensibility** ([07](07-plugins-and-api.md), [12](12-cli.md))
- Keep: the lifecycle stack; namespaced command ids; shared editor module singletons; lazy re-hydration of views
  whose plugin loads late; a startup watchdog per plugin; a directory index plus GitHub releases; a remote
  kill-switch.
- Fix: never eval plugins in the privileged context. Use a sandboxed iframe or worker per plugin with an async
  RPC API and manifest-declared capabilities enforced by Tauri 2's permission system. Keep in-process execution
  for a small "trusted tier" with explicit consent. Hash or sign every download. Authenticate the CLI socket with
  a per-session token file if any command can run code.

**Phase 7 — Optional heavy features** ([09](09-canvas-and-bases.md), [10](10-sync-publish-account.md), [11](11-core-plugins.md))
- Canvas: DOM nodes in one CSS-transformed container, zoom stored as log2(scale), an R-tree for culling, one
  dirty-set frame loop, snapshot undo with id-diffing, unknown fields preserved, and canvases indexed like notes.
- Bases-style queries: a typed value model with per-type methods, an AST evaluated per row with null propagation,
  "membership hash" separate from presentation, and filter-derived defaults for new items.
- Sync: a server-ordered change log with a uid cursor, three-map client state, one action per loop iteration,
  merge only on true divergence, Argon2id + HKDF + AES-GCM, and deterministic encryption only with a keyed IV. Keep
  the master key in the OS keychain. Use a CRDT or JSON-patch merge for structured files instead of last-writer-wins.
- Local history: content-addressed snapshots in SQLite next to the index.

### Accessibility checklist (where Obsidian falls short)

From [06 §14](06-workspace-and-ui.md):
- every icon control is a real `<button>` with an accessible name and a tooltip that also shows on `:focus-visible`;
- `role="dialog"` + `aria-modal` + `aria-labelledby` on modals;
- `menu`/`menuitem` with real focus movement;
- combobox + listbox with `aria-activedescendant` for the palette and suggesters;
- `tree`/`treeitem` with level, expanded and posinset attributes, plus roving tabindex;
- `tablist`/`tab`/`tabpanel` for tabs;
- landmarks for regions, and F6 to cycle between them;
- `role="status"` live region for notices;
- `prefers-reduced-motion` applied globally through the animation duration tokens;
- `prefers-contrast` and `forced-colors` overrides;
- toggles as `role="switch"` with `aria-checked`;
- `dir` set for RTL languages.

## Part 2 — Neural Map mapping

Current state (checked 2026-10-21):
- **Shell:** an Obsidian-style shell already exists: a ribbon, sidebars, panes of tabs with per-tab history
  (`src/features/workspace/model/panes.ts`, `tabs.ts`), a command palette, a quick switcher, bookmarks and hotkeys.
- **Topic page:** the note editor is a textarea with wikilink completion and list continuation
  (`src/features/topic/NoteEditor.tsx`, `model/editing.ts`), and rendering uses `react-markdown` + `remark-gfm`.
- **Graph:** Canvas 2D with d3-force on the main thread, an eased emphasis fade, a timelapse, and the
  semantic-zoom node size and centroid seeding already ported from the graph teardown (`src/features/graph/`).
- **Search:** the quick switcher (`searchNodes`, `src/features/graph/model/filterGraph.ts:86`) and `[[` completion
  (`suggestTopics` in `NoteEditor.tsx`) rank prefix over substring over title and aliases, then by decay. The
  command palette already has a subsequence `fuzzyScore` (`src/features/workspace/model/hotkeys.ts`). The home
  `SearchBox` calls a Rust `search` command (`src-tauri/src/topics/search.rs`) that runs `LIKE '%q%'` over topic
  labels and idea titles/summaries. There is no full-text index in SQLite.

| # | Borrow | Why it fits Neural Map | Where it lands | Effort |
|---|---|---|---|---|
| 1 | **Accessibility checklist above**, compared against the existing ARIA work | the user's stated top priority; Obsidian is weak here, so this is where Neural Map can be clearly better | `src/features/workspace/*`, `src/shared/ui/*` | M |
| 2 | **Fuzzy scorer with tiered penalties** for the quick switcher, palette and `[[` completion | the switcher's and `[[` completion's prefix/substring match misses `nrlmp` → "Neural Map" style queries; the palette's subsequence scorer has no gap or mid-word tiers; Obsidian's scorer is small and predictable | replace `searchNodes` scoring in `filterGraph.ts` and `suggestTopics` in `NoteEditor.tsx`; share with `fuzzyScore` in `model/hotkeys.ts` (used by `CommandPalette.tsx`) | S |
| 3 | **FTS5 table over topics, ideas and excerpts** with BM25 + title boost, and Obsidian-style operators (`tag:`-like `state:`, `source:`, quoted phrases) as a matcher tree on top | the app's value is "find where I said X"; today's `LIKE` scan skips message text, and Obsidian's linear scan is the thing *not* to copy | `src-tauri/src/db/sql/0007_fts.sql` (next migration), replace the `LIKE` queries in `src-tauri/src/topics/search.rs`, `src/features/home/SearchBox.tsx` | M |
| 4 | **Unlinked mentions** (whole-word title/alias hits in excerpts and notes not already linked, with one-click link) | turns implicit connections into edges the user confirms, which supports retention | Rust query + `LinkedMentions.tsx` section | M |
| 5 | **Graph physics in a worker** with a packed `Float32Array` per tick (semantic zoom and centroid placement from the [graph teardown](../obsidian-graph-teardown.md) are already ported) | the main remaining graph item from the earlier teardown, with retained rendering and an idle render stop; pays off at `dev:stress` scale | `src/features/graph/layout/useForceLayout.ts` → worker | M |
| 6 | **Deferred views** (restore hidden tabs as placeholders and build on first visibility) | today `ViewHost` mounts every tab and keeps hidden ones mounted; deferring keeps startup cost proportional to visible panes as layouts grow | `ViewHost.tsx`, `Panes.tsx` | S |
| 7 | **Throttled save + merge** for notes (first edit + 2 s; immediate on blur or close; three-way merge if the stored note changed) | today `NoteEditor` saves 700 ms after typing stops and flushes on close, and takes another pane's text only when it has no unsaved edits (no merge); this protects notes edited in two panes or by a job | `NoteEditor.tsx`, notes repo | S |
| 8 | **Declarative settings definitions** (one tree drives rendering, search and deep links) | makes the settings page searchable and testable | `src/features/settings/*` | M |
| 9 | **File Recovery-style history** as content-addressed snapshots in SQLite | answers "how did my thinking on this topic change?", a retention feature, not just a safety net | notes repo + topic Timeline | M |
| 10 | **Three-tier design tokens** (palette → semantic → component) with a WCAG-contrast accent text colour and reduced-motion via duration tokens | consistent theming, and accent/text-size controls already exist | `src/shared/ui/*`, global CSS | S |
| 11 | **Lexical editor upgrade path**: CM6 + lezer markdown with the two-layer live preview, *if* notes grow beyond short annotations | only worth it if notes become a primary surface | `NoteEditor.tsx` | L |

**Do not borrow:**
- running plugins with full privileges (Neural Map has no plugin system; if it gets one, start sandboxed);
- the CM5-mode editor stack;
- linear search;
- main-thread link resolution;
- plaintext token storage (Neural Map already uses Windows Credential Manager);
- `contextIsolation: false`-style shortcuts.

**Retention gap:** Obsidian ships **no spaced repetition**. Its only resurfacing feature is a uniformly random
note ([11](11-core-plugins.md)). Neural Map's weekly review already goes further. The obvious next step is
scheduling (FSRS or SM-2) over topics and ideas, weighted by the decay score and graph centrality. There is
nothing in Obsidian to copy for this.
