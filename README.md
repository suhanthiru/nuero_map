# Neural Map

A personal idea graph built from your own AI chat history (Claude, ChatGPT, Gemini).
Topics are nodes sized by how alive they are, edges carry the excerpts where two ideas met,
and every topic has a source-linked "current state".

## Develop

Requirements (Windows): Node 22.12+, Rust stable with the **MSVC** toolchain, VS Build Tools
(C++ workload), WebView2.

```bash
npm install
npm run tauri dev        # desktop app
npm run dev:mock         # UI only, in a browser, on mock data
npm run dev:stress       # UI only, 800-node synthetic graph
npm test                 # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml
```

If your default Rust host is `x86_64-pc-windows-gnu`, run once in the repo:
`rustup override set stable-x86_64-pc-windows-msvc`.

The embedding model (bge-small-en-v1.5, ~130 MB) downloads on first run. The fastembed
smoke test is ignored by default: `cargo test --test spike_fastembed -- --ignored`.

## How it works

Import → extract → assign → link, each a durable background job (resumes after a crash):

1. **Import** a Claude or ChatGPT export zip. Re-imports only add new or changed chats.
2. **Extract**: each chat is split into windows; Claude Haiku 4.5 returns ideas with
   verbatim, verified quotes (Message Batches for big imports, 50% cheaper).
3. **Assign**: ideas are embedded locally (no key) and joined to the topic their label names,
   else the nearest topic by meaning, else a new topic. Restatements are folded together.
4. **Link**: topics that came up in the same chat, or that Claude saw you connect, get an
   edge with the excerpts as evidence. Each topic's "alive" score halves every 14 days
   (configurable) without a mention, keyed off when you said it, not when it was imported.

Only one API key is needed (Anthropic); it is stored in Windows Credential Manager.

## Using it

The window works like a notes app: an icon ribbon on the left, a left sidebar with the
topic explorer, search and bookmarks, side-by-side panes of tabs (each tab with its own
back/forward history), and a right sidebar with the open topic's connections, local graph
and outline.

- **Panes**: "Split right" (tab or ⋮ menu, palette, `Ctrl+\`) opens the current view in a
  new pane; drag the divider (or focus it and use `←`/`→`) to resize, drag a tab onto
  another pane's tab bar to move it. `Ctrl`+click opens in a new tab, `Ctrl+Alt`+click
  opens to the right. Closing a pane's last tab closes the pane.
- **Pinned tabs**: Pin from a tab's menu, the ⋮ menu or the palette ("Pin / unpin current
  tab"). A pinned tab shows a pin instead of ×, keeps what it shows (anything you open from
  it lands in a new tab beside it; Back and Forward still work), and survives `Ctrl+W`,
  middle-click, Close others and Close tabs to the right. Click the pin to unpin.
- **Command palette** (`Ctrl+P`): every command by name with its hotkey; the ones you
  used there recently come first.
- **Menus**: right-click (or `Shift+F10`) a topic in the explorer, a bookmark or a tab;
  the ⋮ button in a view header has Split right, Bookmark, Show on graph, Open local graph,
  Reveal in explorer, Copy title and Close.
- **Explorer**: sort order (title, most alive, recently active, most ideas), collapse or
  expand every state folder, and reveal the open topic.
- **Bookmarks**: topics and screens you bookmark, newest first.
- **Status bar**: for the open topic, its backlinks (click to see them) and the word and
  character count of your note.

- **Today**: three topics to revisit (fading, parked, newly connected), search, and the
  most alive topics.
- **Graph** (`Ctrl+G`): topics are grey dots sized by how alive they are; hovering one
  lights it and its links in the accent color. Drag topics to rearrange them. Click to
  preview a topic, click a link to read the excerpts where the two met, double-click (or
  `Ctrl`+click for a new tab) to open it. The settings button opens:
  - **Filters**: search (`state:parked` works too), states, active-within range, weak
    links, orphans.
  - **Groups**: color every topic that matches a search.
  - **Display**: size by aliveness / links / ideas, text fade threshold, node size, link
    thickness, fade quiet topics, color by state, state shapes, and **Animate**, which
    replays the map growing in the order you first talked about each topic.
  - **Forces**: center, repel, link force, link distance (applied live).
- **Local graph** (right sidebar): the open topic's neighbourhood, 1–3 hops deep.
- **Topic page** reads like a note: an inline title you can edit to rename the topic,
  foldable **Properties** (state, aliases, how alive, last active, check-in, first seen,
  ideas, a 16-week activity strip), the cited **Current state** as a summary callout,
  **My notes**, pinned quotes as quote callouts, the **Timeline** (month headings, each
  idea tagged `#insight`, `#decision`, …, your words and the AI's styled differently), and
  **Linked mentions** and **Unlinked mentions** at the foot. Headings fold from the arrow
  in the left margin.
- **My notes**: your own markdown on each topic. `Ctrl+E` (or Edit / Done, or the pencil
  in the view header) switches between reading view and **live preview** editing: the
  note keeps its formatting while you type, and the markdown (`**`, `#`, `[[…]]`) shows
  only where the caret is. It saves as you type. `[[Title]]` or `[[Title|shown text]]`
  links another topic by title or alias (type `[[` for suggestions; hover a link for a
  preview, click it to open, `Alt+Enter` from the keyboard). `- [ ]` makes a task you
  can tick in either view (`Ctrl+L` toggles one), `> [!tip] Title` makes a callout (note,
  info, tip, success, question, warning, danger, bug, example, quote; `[!type]-` starts
  folded). Enter continues a list or quote, Tab indents a list, `Ctrl+B` / `Ctrl+I` bold
  and italic. Your note's headings show in the outline.
- **Note links on the map**: a `[[link]]` in a note connects the two topics on the graph
  (a teal line, "you linked these in a note") and in both topics' Linked mentions, with
  the note line it came from. Links count once the topic exists, so you can link ahead.
- **Unlinked mentions**: other topics' notes and ideas that name this topic (title or
  alias, whole words) without linking it. **Link** turns a note mention into a
  `[[link]]` in place; for an idea mention it adds `- [[that topic]]` to this topic's note.
- **Appearance** (Settings): theme, accent color (six presets, contrast-checked), text
  size, and readable line length.
- **Weekly review** (graduation-cap icon): retrieval practice so a week of reading doesn't
  just wash past. Pick a week (Monday to Sunday) and Claude writes a test from that week's
  ideas: multiple choice plus a few written answers, about the substance rather than the
  chats. Answers save as you go. When you hand in, multiple choice is scored right away and
  Claude grades the written answers against a rubric, then writes a study guide aimed at
  what didn't stick: key ideas, the misconception an answer showed, practice questions for
  a few days later, and the original quotes to re-read. Copy it as Markdown. Today suggests
  the review once a week has ended. Uses two calls on the synthesis model.

Shortcuts: `Ctrl+P` command palette, `Ctrl+O` quick switcher, `Ctrl+G` graph,
`Ctrl+Shift+F` search, `Ctrl+E` reading/editing view, `Ctrl+T` new tab, `Ctrl+W` close tab,
`Ctrl+Tab` / `Ctrl+Shift+Tab` next and previous tab, `Ctrl+1`–`9` jump to a tab,
`Alt+←/→` back and forward, `Ctrl+\` split right, `Ctrl+,` settings, `Ctrl+/` the full list
(also behind the `?` at the bottom of the left sidebar).

## Accessibility

- Every screen works from the keyboard (see shortcuts above); `/` finds a topic on the map.
- The map is keyboard-drivable: arrows move between nearby topics, `[` `]` step by
  importance, `Enter` selects (again opens), `+` `−` `0` zoom, `Esc` clears. Each move is
  announced to screen readers.
- **List view** shows the map as a sortable table.
- The weekly review works from the keyboard: `A`–`D` answer, `[` `]` move between
  questions, and grades are shown with ✓ ◐ ✗ and words, not color alone.
- State is never color alone: with state colors on, shapes are forced on too, and every
  view also labels state in words. Colors are validated for color-blind
  separation and WCAG AA contrast in both themes.
- Text size setting (Settings → Appearance) scales the whole app, including map labels.
  Motion follows the system "reduce motion" setting; Windows High Contrast is respected.
