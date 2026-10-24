# Canvas (.canvas / JSON Canvas) and Bases (.base database views)

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Two core plugins that turn plain files into structured, interactive views. **Canvas** (`ate`, view `ste`, engine `kee`)
is an infinite 2D board. It stores a JSON Canvas 1.0 document and renders it as **absolutely positioned DOM nodes inside one
CSS-transformed container**, with SVG Bezier edges. It uses an **rbush R-tree for viewport culling**, a single
`requestAnimationFrame` loop that batches all dirty, moved and selection work, **zoom-dependent unmounting of node content**, and
**whole-document snapshot undo** (100 states). Text cards are real embedded Markdown editors. A background indexer feeds
canvas links into `metadataCache.resolvedLinks`, search, backlinks and rename-updating. **Bases** (`e9`, view `Q8`,
controller `w1`) is a YAML-defined query over every vault file. A hand-written **lezer grammar** parses a small expression
language into an AST (`MQ` subclasses) that evaluates to a typed **`Value` hierarchy** (Null/String/Number/Boolean/List/
Object/Date/Duration/File/Link/Url/Tag/Image/Icon/HTML/RegExp). Methods come from a per-type function registry (`VK`). Results
come from a **time-sliced full scan, then incremental per-file re-evaluation** driven by `metadataCache` events. Sort, group,
limit and summaries are derived on every notify, and four built-in views (table, cards, list, kanban) are all virtualized.
Plugins can add views (`registerBasesView`) and formula functions (`registerGlobalFunc`/`registerInstanceFunc`).

---

## Where it lives

### Canvas

| minified id | public / inferred name | role | lines (pretty/app.js) |
|---|---|---|---|
| `p9`,`d9`,`f9` | canvas i18n, hotkey label fmt, CanvasHelpModal | help modal listing every gesture | 121217-121260 |
| `v9`,`g9`,`m9`,`y9`,`b9`,`w9`,`k9`,`C9`,`E9`,`M9`,`S9`,`x9` | bbox helpers | rect↔bbox, union, inflate, contains, center, anchor-positioning, resize-source | 121261-121354 |
| `A9`,`P9`,`I9` | file / media / image pickers | `D5` (quick-switcher-like) subclasses for adding cards | 121355-121469 |
| `L9` | nearest-side finder | picks connection side for edge drop | 121470-121479 |
| `O9`,`F9`,`B9` | snap-point generation + 1-D snapper | object snapping | 121480-121548 |
| `z9`,`W9`,`H9`,`q9` | color application + legacy "r,g,b" → hex | canvas colors | 121555-121574 |
| `j9` | SelectionBox | multi-select rectangle with 8 proportional resizers | 121575-121730 |
| `G9` | CanvasMenu | floating toolbar above the selection (delete/color/align/group…) | 121730-122130 |
| `K9`,`Y9` | quickselect | rbush dependency | 122131-122159 |
| `$9` = `Z9` | **rbush** (vendored, maxEntries 9) | R-tree | 122160-122431 |
| `hee` | CanvasHistory | snapshot undo stack (max 100) | 122432-122466 |
| `yee`/`bee`/`wee` | NodeIndex / EdgeIndex | rbush subclasses caching `bbox` on items | 122466-122509 |
| `kee` | **Canvas** (engine) | data model, viewport, frame loop, input, snapping, clipboard, export | 122509-124542 |
| `Cee` | zIndex comparator | stable node order | 124543 |
| `Eee`,`xee` | URL prompt, heading/block picker | link-card URL, "narrow to heading/block" | 124546-124653 |
| `Tee` | NodeInteractionLayer | one shared overlay of resizers + connection dots for the hovered node | 124653-124710 |
| `Dee` | CanvasNode (base) | geometry, color, unknownData, select/focus, resize, connect | 124710-125123 |
| `Aee` | ContentNode | mount/unmount content by zoom breakpoint | 125123-125160 |
| `Pee` | DummyNode | temp node for drag previews / dangling edge ends | 125160-125168 |
| `Lee` | EmbedNode | hosts an embed "child", editing, auto-fit on resizer dblclick | 125172-125289 |
| `Oee` | **FileNode** (`type:"file"`) | embeds any vault file via embed registry | 125289-125492 |
| `Fee` | Bases view picker | "narrow to Bases view" for `.base` file cards | 125492-125536 |
| `Ree` | **TextNode** (`type:"text"`) | Markdown card | 125536-125613 |
| `Bee` | TextNodeEditor (extends `E0` embeddable MD editor) | live editor inside a card | 125613-125648 |
| `Nee` | **LinkNode** (`type:"link"`) | `<webview>`/iframe web page | 125648-125757 |
| `Vee` | UnresolvedFileEmbed | placeholder with create/swap/remove | 125757-125818 |
| `Hee` | **GroupNode** (`type:"group"`) | label + background image | 125818-125970 |
| `qee`,`Wee`,`jee`,`Uee`,`_ee` | side auto-pick, side anchor, arrow offset, normal offset, Bezier builder | edge geometry | 125971-126016 |
| `Gee`,`Kee`,`Yee` | arrow rotation table, `"none"`, `"arrow"` | edge ends | 126017-126022 |
| `Xee` | **CanvasEdge** | path, ends, label, reconnect | 126022-126245 |
| `Qee` | EdgeLabel | contentEditable label at Bezier midpoint | 126245-126316 |
| `Zee` | Jump-to-group modal | command `canvas:jump-to-group` | 126316-126342 |
| `Jee` | FileIndexer (generic) | queue + per-file async index | 126342-126435 |
| `ite` | **CanvasIndex** | parses .canvas → embeds + per-text-node CachedMetadata | 126435-126517 |
| `rte` | **CanvasLinkUpdater** | `metadataCache.linkUpdaters["canvas"]` | 126517-126636 |
| `ote` | CanvasLocalData | localStorage `<appId>-canvas-<path>` (readonly flag) | 126636-126657 |
| `ate` | **Canvas core plugin** | commands, rename propagation, registration | 126657-126931 |
| `ste` | **CanvasView** (TextFileView, type `"canvas"`) | hotkeys, state, (de)serialize | 126931-127079 |
| `lte`,`cte` | canvas embed in Markdown | static SVG minimap | 127080-127166 |
| `ute` | Canvas settings tab | options | 127166-127236 |
| `Yb`/`Xb` | compact JSON stringifier | on-disk formatting | 36534-36580 |
| `Ub` | random hex id | 16-hex node/edge ids | 36474 |

### Bases

| minified id | public / inferred name | role | lines |
|---|---|---|---|
| `oK` | `RenderContext` | renders file links, external links, tags (hover source `"bases"`) | 80030-80101 |
| `aK` | `Value` | root: `equals`, `looseEquals`, `renderTo`, `keys`, `objectAccess`, static `type` | 80101-80134 |
| `sK` | ErrorValue (`"Error"`) | carries message; renders warning icon | 80134-80162 |
| `lK` | `NullValue` (singleton `.value`) | | 80162-80184 |
| `cK`,`uK` | `NotNullValue`, `PrimitiveValue` | | 80184-80210 |
| `hK`,`pK`,`dK` | `StringValue`, `NumberValue`, `BooleanValue` | | 80210-80258 |
| `fK` | `ListValue` | lazy element conversion + aggregate methods | 80258-80458 |
| `gK`,`mK` | `TagValue`, tag-list | hierarchical tag match | 80462-80499 |
| `yK` | `ObjectValue` | lazy, case-insensitive; `fromFrontMatter` type sniffing | 80499-80585 |
| `bK` | `RegExpValue` | | 80585-80601 |
| `wK`,`kK` | `DateValue`, `RelativeDateValue` | date vs datetime flag | 80601-80682 |
| `CK` | `DurationValue` | y/mo/d/h/m/s/ms fields | 80682-80790 |
| `EK`,`MK`,`SK`,`xK`,`TK` | `IconValue`, `FileValue`, `UrlValue`, `LinkValue`, `ImageValue` | | 80790-81006 |
| `DK` | `HTMLValue` (a dead "Markdown" class is defined and discarded in the same expression) | | 81006-81033 |
| `AK` | JS → Value converter | | 81034-81050 |
| `IK`,`LK`,`OK`,`FK` | param descriptors (required/optional/variadic/custom-widget) | | 81052-81071 |
| `RK`,`BK`,`HK` | Function base, BooleanFunction (operator-capable), NumberUnaryFunction | | 81072-81110, 81714 |
| `NK` → `VK` | function registry (global + per-type, prototype-chain lookup) | | 81110-81158 |
| (anonymous) | the built-in function library | ~80 functions | 81159-82434 |
| `zK`…`NY` | vendored @codemirror/autocomplete | | 82435-83600 |
| `NX` | formula autocomplete (CM6 language data) | | 84021-84143 |
| `WX`…`hQ` | vendored @lezer/lr runtime | | 84171-85377 |
| `fQ`,`vQ`,`yQ` | **formula grammar** (serialized lezer tables) + CM language | | 85390-85444 |
| `bQ`,`EQ` | parse → plain JSON AST | | 85445-85571 |
| `mQ` | Formula (text + compiled AST, `test`, `getValue` → ErrorValue on throw) | | 85411-85431 |
| `MQ` + `SQ xQ TQ DQ AQ PQ IQ LQ OQ FQ RQ BQ NQ VQ` | AST nodes: invalid, empty, compare, math, negate, not, call, index, member, paren, literal, regexp, array, ident | | 85572-86088 |
| `HQ`,`zQ` | built-in summary formulas per type | | 86088-86105 |
| `qQ`,`WQ` | summary evaluation context (`values`) | | 86106-86124 |
| `UQ` | `parsePropertyId` → `{type: note|file|formula, name}` | | 86125-86131 |
| `GQ` | BasesContext (app, combined filter, formulas, `this` file) | | 86135-86151 |
| `YQ` | `BasesEntry` (one file's row) | | 86152-86199 |
| `XQ` | per-entry formula cache with cycle detection | | 86200-86221 |
| `QQ`,`$Q` | `this` value (ThisFile), `formula` object value | | 86222-86261 |
| `JQ`,`e$`,`t$`,`n$`,`i$`,`r$` | filter tree: base, leaf, group, and/or/not | | 86262-86408 |
| `o$`,`a$` | file-property labels, per-property config (`displayName`) | | 86408-86455 |
| `s$`,`l$`,`c$`,`u$` | default sort/order, non-editable props | | 86455-86463 |
| `h$` | `BasesViewConfig` | | 86464-86586 |
| `p$` | BasesQuery (whole `.base` document model) | | 86586-86807 |
| `d$`,`f$`,`v$`,`g$` | filter parse, propertyId shorten/expand, view parse | | 86808-86916 |
| `m$`,`y$` | mock context for type inference/autocomplete | | 86917-86981 |
| `P$`,`I$`,`L$`,`O$`,`F$`,`R$` | widget-for-type, display string, **derive new-item frontmatter from filters**, Value→YAML | | 87352-87497 |
| `yJ`,`wJ`,`kJ` | visual filter editor (group / statement rows, advanced formula mode) | | 90743-91211 |
| `OJ` | `BasesEntryGroup` | | 91752-91761 |
| `FJ`,`VJ`,`HJ`,`zJ`,`qJ`,`WJ`,`jJ` | grouping, manual group order, hidden groups | | 91762-91839 |
| `UJ` | `BasesQueryResult` | sort, limit, groupedData, summaries | 91840-91965 |
| `_J` | `BasesView` (public base class) | transactions/undo, group headings, renderers, export | 91966-92223 |
| `KJ`,`YJ`,`XJ` | cell renderers: note property (editable widget), file name, formula/computed | | 92227-92330 |
| `i1` | new-item menu | | 92692-92788 |
| `F7` | summary picker | | 117956-118086 |
| `b1`,`w1` | events, **`QueryController`** | | 93406-93932 |
| `k1` | `.base` file embed (`![[x.base#View]]`) | | 93932-94030 |
| `Gj`,`GT`,`qI` | vault scan queue, generator queue, time-slicer | | 74165-74223, 45376, 51840 |
| `Q8` | **BasesFileView** (TextFileView, type `"bases"`) | | 116230-116360 |
| `a7` (`"cards"`), `m7` (`"kanban"`), `D7` (`"list"`), `q7` (`"table"`) | built-in views | | 116495, 116872, 117628, 118235-119279 |
| `e9` | **Bases core plugin** | | 119575-120031 |
| Plugin `registerBasesView`, `registerGlobalFunc`, `registerInstanceFunc` | public plugin API | | 109035-109054 |

Public exports (observed, export map ~12755): `BasesEntry`=YQ, `BasesEntryGroup`=OJ, `BasesQueryResult`=UJ,
`BasesView`=_J, `BasesViewConfig`=h$, `QueryController`=w1, `RenderContext`=oK, `parsePropertyId`=UQ, and every
Value class (`Value`, `NullValue`, `NotNullValue`, `PrimitiveValue`, `StringValue`, `NumberValue`, `BooleanValue`, `ListValue`,
`ObjectValue`, `RegExpValue`, `DateValue`, `RelativeDateValue`, `DurationValue`, `IconValue`, `FileValue`, `UrlValue`,
`LinkValue`, `TagValue`, `ImageValue`, `HTMLValue`). The function base classes (`RK`/`BK`) are **not** exported (observed:
absent from the export map), so how a plugin builds a function for `registerGlobalFunc` is unknown.

---

## How it works — Part A: Canvas

### A1. Lifecycle and registration
- `ate.init` registers view type `"canvas"`, the commands `canvas:new-file`, `canvas:export-as-image` (desktop only),
  `canvas:jump-to-group` and `canvas:convert-to-file`, plus a ribbon item. It creates the index `ite` as a child component
  (always running, even before a canvas is opened) and `ote` local data (observed app.js:126726-126818).
- `onEnable`: hooks file-menu, vault rename/delete; sets `metadataCache.linkUpdaters["canvas"] = new rte(...)`;
  registers the `.canvas` extension with the view registry; adds an embed handler (`cte`) for `![[x.canvas]]`; adds a file-parent
  creator. It loads options with defaults `{snapToObjects:true, snapToGrid:true}` (observed 126819-126848).
- `ste` (TextFileView): `setViewData(json, clear)` → `JSON.parse` → `canvas.setData` and, on first load, `zoomToFitQueued`.
  An empty string gives a placeholder. `getViewData` → `Yb(canvas.data)` (observed 127017-127026). The leaf state carries
  `viewState: {x, y, zoom}` built from target viewport values (`tx, ty, tZoom`) (observed 123480-123487, 126984-127001).
- Hotkeys in the view scope: Mod+Z undo, Mod+Shift+Z / Mod+Y redo, Mod+A select all, Shift+1 zoom-to-fit,
  Shift+2 zoom-to-selection, arrows (±Shift) nudge. Each one is skipped when the event target is an editable element (`C1`) (observed 126939-126980).
- Per-file local data: `app.saveLocalStorage("canvas-" + path)`, which the app prefixes, so the real localStorage key is
  `<appId>-canvas-<path>` (observed 146186-146202). It holds `{readonly:true}` or null, moves with renames and is removed on delete
  (observed 126636-126656, 127069-127077).

### A2. Data model (`kee`)
- `nodes: Map<id, Dee>`, `edges: Map<id, Xee>`. `edgeFrom`/`edgeTo` are multimaps (`Gb`) from node to edges. `nodeIndex` (rbush, by node x/y)
  and `edgeIndex` (rbush, by edge bbox) (observed 122536-122541).
- `data` keeps the last serialized document, so **unknown top-level keys survive**: `getData` spreads the old `data` and
  overwrites `nodes`/`edges` (observed 122824-122836).
- `getData` emits nodes **sorted by zIndex** (array order = paint order, as the spec requires), then edges in Map order (observed 122825-122834).
- `importData(doc, removeMissing)` diffs by id. It reuses existing node objects, creates by `type`
  (`file`→`Oee`, `text`→`Ree`, `link`→`Nee`, `group`→`Hee`), and **skips unknown node types** (observed 122874-122884).
  Unknown types are therefore dropped on the next save (**confirmed at runtime**, [14](14-runtime-verification.md): a
  `custom-widget` node and both of its edges vanished after one save, while an unknown top-level key survived). Edges whose `fromNode`/`toNode` is missing are skipped
  or removed (observed 122898-122914). Missing `fromSide`/`toSide` are computed (`qee`) and written back into the edge JSON (observed 122904-122905).
- Node base (`Dee`) fields: `x,y,width,height` (each **rounded to integers** on set), `color`, and `unknownData` (all
  other keys, preserved on round-trip). `getData` spreads `unknownData` first, then `id,x,y,width,height`, and adds `color` only if set
  (observed 124730-124756). Edges likewise keep `unknownData` (observed 126050-126081).
- IDs are 16 random hex chars (`Ub(16)`) (observed 36474, 124712).

### A3. Rendering approach (DOM, not canvas/WebGL)
- Structure: `div.canvas-wrapper` contains an SVG dot-grid background, `div.canvas-card-menu` (bottom "drag to add" buttons),
  `div.canvas-controls`, and `div.canvas`. `div.canvas` is the transformed world. It holds the node divs, two SVGs
  (`canvas-edges` for paths, a second `canvas-edges` for arrowheads) and a snap overlay SVG (observed 122575-122729).
- **World transform** on `div.canvas`: `translate(w/2,h/2) scale(s) translate(-x,-y)`, where `(x,y)` is the world point at the
  viewport center (observed 123368). Each node is positioned with `transform: translate(x,y)` + width/height and also sets
  CSS vars `--canvas-node-width/height` (observed 124828-124829).
- **Zoom** is stored as `zoom = log2(scale)`, clamped to [-4, 1] (scale 1/16 to 2) (observed 123334, 123067). Coordinate mapping:
  `pos = (x + domX/scale, y + domY/scale)` with dom coords relative to the wrapper center (observed 123088-123109).
- **Animation**: every frame, x/y/zoom move toward targets `tx/ty/tZoom` by `1 - 0.984^dt_ms`. They snap when the
  difference is below 0.01 (`vee`). Zoom-about-point adjusts x/y so the point under the cursor stays fixed (observed 123326-123365).
  `finishViewportAnimation` forces an instant jump. It is used for trackpad-like wheel deltas and initial zoom-to-fit (observed 123992, 123246).
  Pinch and wheel zoom pause the animation for 200 ms (`pauseAnimation`) (observed 123758, 123987).
- When the viewport settles, it sets `--zoom-multiplier = sqrt(1/scale)` on the wrapper. CSS uses this to keep labels, resize
  handles and menus a readable size at any zoom (observed 123376; app.css 18200, 18430-18431, 18681-18732). It also toggles
  `mod-animating` and calls `workspace.requestSaveLayout()` (persists the viewport).
- `mod-zoomed-out` is set when `zoom <= -1.7` (`mee`). CSS hides node labels then (observed 123367; app.css 18464).
- **Background grid**: an SVG `<pattern>` with one dot (r = 0.7). The pattern size is `gridSpacing*scale`, offset by
  `x mod spacing` (observed 122586-122596, 123369-123375). `gridSpacing` adapts to zoom: zoom < -3.3 gives 160, < -2.16 gives 80,
  < -0.91 gives 40, otherwise 20 (observed 123081-123084).
- **Single frame loop** (`requestFrame`, observed 123324-123428). In order it: (1) animates the viewport; (2) for every node in the
  `moved` set, adds its edges to `moved`, removes and reinserts all moved items in the rbush indices, and marks them dirty;
  (3) `virtualize()`; (4) renders attached dirty items; (5) diffs the selection against the `staleSelection` snapshot and calls
  `focus/blur/select/deselect` (focus = single selection, select = multi); (6) re-renders the floating menu if needed; (7) renders the
  interaction layer. Every mutation API (`markMoved`, `markDirty`, `select`…) only records state and calls `requestFrame`.
- **Culling / virtualization** (`virtualize`, observed 123443-123473): it queries the rbush with the viewport bbox. Nodes visible last
  frame are re-attached. Newly visible nodes attach **at most 10 per frame** (progressive mounting), and another frame is requested while
  more remain. Edges in the viewport always attach. Nodes that left the viewport get `preDetach()` (content teardown) and then `detach()`
  (DOM removal). A single selected node is always kept attached. During screenshot export everything is attached.
- **Level of detail**: `zoomBreakpoint = -1.7 - options.zoomBreakpoint` (log2 scale). The setting slider runs -0.7..2.4, default 0
  (observed 122987-122989, 127222-127231). `ContentNode` (`Aee`) mounts its content only when `zoom > breakpoint` or while editing.
  Otherwise it shows a cheap placeholder (file name / text icon) (observed 125142-125152). Image and canvas embeds
  stay mounted at any zoom (observed 125342-125348). Link nodes are `alwaysKeepLoaded` and never detach, so a webview is not reloaded
  (observed 125652, 125136-125141). On unmount/detach, `qE` walks the subtree and saves the `scrollTop` of every scrolled
  element in a WeakMap; `jE` restores them on re-attach. Without this, detaching DOM loses scroll position (observed 38409-38434).
- **z-order**: a counter `zIndexCounter` is bumped by `getZIndex()` whenever a node is brought forward (e.g. drag start). Groups do not
  take part: a group's zIndex is `round(-width*height)`, so bigger groups always sit behind smaller ones (observed 125946-125952).
  A single selected node is raised to `counter+1`. Menus sit at `counter+3`, the snap overlay at `counter+2` and the mover at `counter+4`
  (observed 123248-123254, 124840-124844, 123597).
- **Shared interaction layer** (`Tee`): there is one overlay `div` with 4 edge resizers (each with a `canvas-node-connection-point`)
  and 4 corner resizers. It is moved over the node under the pointer instead of building handles per node. On pointermove the
  hit-test is rAF-throttled, with tolerance `8/scale` (observed 124653-124709, 123682-123693).

### A4. Interactions
- **Pan**: wheel (default), middle-drag, right-drag (cancels the context menu), Space+drag (mover overlay), and one-finger touch drag.
  **Zoom**: Ctrl/Meta+wheel or Space+wheel (swapped when `defaultWheelBehavior: "zoom"`), pinch, and the +/−/reset controls (step 0.5 in
  log2). The zoom delta is `-deltaY/300`, doubled on macOS for fractional deltas. Pan is `delta/scale*0.93`, with line-mode deltas ×40 and
  page-mode ×800 (observed 123975-123995). A macOS ctrl-wheel event with zero deltas triggers "smart zoom": zoom to the selection,
  or to the smallest node under the cursor, or fit everything (observed 123960-123974).
- **zoomToBbox**: scale = min(w/(1.1·bw), h/(1.1·bh)) clamped to ≤1 (observed 123064-123074). `panIntoView` pads by gridSpacing and
  only zooms if the target is bigger than the viewport (observed 123075-123080).
- **Selection**: click (Shift toggles), drag on empty space for a marquee (Shift adds or toggles). Groups are only marquee-selected when
  fully contained (observed 123798-123820). Mod+drag marquee then *creates* a node of that size per `defaultModDragBehavior`
  (`menu|card|note|media|webpage|group`) (observed 123821-123859). Double-click on empty space creates a text card
  (observed 123868-123873). Escape deselects; Backspace/Delete deletes (only when the wrapper itself has focus) (observed 123620-123633).
- **Dragging a selection** (`handleSelectionDrag`, observed 124107-124235): dragging a group also drags every node fully
  contained in it (`getContainingNodes`). Alt (mac) / Ctrl (others) held during the drag creates clones: dummy nodes show the
  original position and the clone is committed on drop via `cloneData` + `importData`. Shift locks the axis. Snapping is suppressed
  while Ctrl (mac) / Alt is held (`canSnap`). Near the wrapper edge (30 px inset) a 60 Hz interval auto-pans, with speed clamped ±40
  scaled by `0.5/sqrt(scale)` (observed 124082-124106).
- **Snapping** (`getSnapping`, observed 123571-123587; `F9`/`B9` 121484-121548). Snap points are the 4 corners + center of each bbox,
  de-duplicated and sorted. For each axis independently, a binary search finds the closest target coordinate. The best delta within
  `snapDistance = ceil(15/scale)` world px wins, and every source/target pair with that same delta is kept so guides can be drawn. Grid
  snap (round to `gridSpacing`) applies per axis only when no object snap was found on that axis. Guides render as circles + a line in
  `svg.canvas-snaps` (observed 123594-123619). While dragging groups, snapping uses only group targets (and only the
  outermost dragged groups). While dragging cards, it uses non-group targets (observed 124165-124188).
- **Resize** (per node, observed 124914-124997; multi via `j9`, 121617-121725): the minimum dimension is 50 (`minContainerDimension`).
  Snapping works as above. Aspect ratio is locked when `aspectRatio != 0` (images/videos, `ratio`-style group backgrounds), and Shift
  toggles the lock in multi-resize. Multi-resize scales every selected node by its fractional position inside the selection bbox.
  **Auto-resize**: double-clicking the bottom/right resizer of a Markdown-showing card fits the height to the content (up to 10
  iterations of measuring `scrollHeight`). The right handle binary-searches the narrowest width that does not grow the content height
  (10 iterations) (observed 125238-125276).
- **Nudge**: arrows move by gridSpacing, ×5 with Shift, aligning to the grid first when grid snapping is on (observed 123024-123054).
- **Toolbar menu** (`G9.render`, observed 121748-122125): delete; color (none, `"1"`-`"6"`, native color input → hex); zoom to
  selection; create group (selection bbox inflated by 20); **Align** submenu (left/center/right/top/middle/bottom; arrange
  horizontally/vertically/grid with gridSpacing gaps, where rows are clustered by overlapping y-ranges; distribute spacing; justify =
  stretch to the selection extent); edge direction (none / one-way / two-way); edit/remove edge label; edit text card; group
  label/background (set, replace, remove, style `cover|ratio|repeat`). Position: centered above the selection, offset
  `10/scale` (35/√scale for groups, 30/√scale for file cards), clamped 10 px inside the viewport (observed 122112-122124).
- **Connecting edges** (`onConnectionPointerdown`, observed 124998-125112). The interaction layer's side dot starts a new edge to a
  dummy node that follows the pointer. On each move it intersects nodes within 15 world px and picks a side via `L9`: the first
  side midpoint within the snap distance, else the nearest midpoint (observed 121470-121479). An edge cannot be connected into a group
  that contains its source, or vice versa. Dropping on empty space opens a menu: *Add card*, *Add note from vault*, and up to **20
  files linked from the source note** (from `metadataCache` links, skipping files already connected). Choosing one creates the node at
  the drop point, anchored on the opposite side, and connects it. Plugins can extend the menu via the workspace event
  `canvas:node-connection-drop-menu`. Dragging an existing edge moves whichever end is nearer the pointer; dropping on nothing deletes
  the edge (observed 126212-126243).
- **Drag & drop in** (observed 122730-122801): file/link drag creates a file card; multi-file or folder drags are sorted by basename and
  laid out as a grid of 10 per row with 45 px gaps (observed 123275-123288). External OS files are imported as attachments. A URL becomes a link
  card (640×360 for YouTube, `mj` regex 72670). Plain text becomes a text card.
- **Clipboard**: copy writes MIME `obsidian/canvas` = `{nodes, edges, center}`. It includes only edges whose both ends are selected
  (observed 122837-122858, 123514-123519). Paste regenerates every id, remaps edges and offsets everything so the old center lands at the
  viewport center (observed 123499-123513, 123520-123562). Pasting files imports them; URL → link card; text → text card.
- **Mobile**: a 600 ms long-press (with vibration) acts as right-click / drag-select. Two-pointer pinch zoom works around the midpoint
  (observed 123697-123796).
- **Readonly mode** (toggle in quick settings / lock button) is persisted in the local data, not in the file (observed 123901-123929).
- Plugin hook events: `canvas:node-menu`, `canvas:edge-menu`, `canvas:selection-menu`, `canvas:node-connection-drop-menu`.
  `files-menu` fires for multiple selected file cards (observed 124044-124050, 124912, 126210, 125100).

### A5. Node types
- **Text** (`Ree`): the child is `Bee`, a subclass of the shared embeddable Markdown editor `E0`. It shows rendered preview by default.
  Double-click (or click with the editor already active) calls `showEditor(pos)`, which turns the card into a real CodeMirror 6
  editor at the clicked position (observed 125190-125198, 125225-125229). On save, `node.text` is updated and `requestSave` called
  (observed 125624-125628). Fold state is persisted in `foldManager` under the virtual linktext `<canvasPath>#^<nodeId>`
  (observed 125636-125646). Focusing a card sets `workspace.activeEditor` to its editor and fires `file-open`
  (200 ms debounce), so global commands, outline and so on act on the card (observed 125205-125212, 122859-122862). *Convert to file*
  creates a note with the text, swaps in a file card of the same rect and rewires its edges (observed 125575-125611).
- **File** (`Oee`): the child comes from the global embed registry (`d2.load({linktext: file+subpath, sourcePath: canvasPath,
  containerEl, depth:0})`), so every embeddable type works: Markdown (`f2`, set `editable` + `useIframe`), images, PDF, audio/video,
  canvas (minimap) and base (observed 125367-125379). After load, the native size of an image/video sets `aspectRatio` and resizes the
  card to fit. That correction uses `overrideHistory()` so it does not become an undo step (observed 125403-125405). PDF cards add a
  "save page location" button that writes `subpath = "#page=N"` (observed 125387-125401). The menu offers *Narrow to heading / block*:
  a block narrow writes a new `^id` into the target note if it has none (observed 125443-125463). For `.base` files the menu offers
  *Narrow to Bases view* (subpath `#ViewName`) (observed 125464-125484). The label above the card shows the short name ›
  subpath and can be `always|hover|never` (observed 125338-125341). Double-clicking the label opens the file. A missing file gets
  `Vee`: buttons create note / swap / remove, and it listens for create/rename to auto-resolve (observed 125757-125817).
- **Link** (`Nee`): desktop uses an Electron `<webview>` with the app's webview partition (IPC `create-browser-session`). Mobile uses an
  iframe sandboxed with `allow-forms allow-presentation allow-same-origin allow-scripts allow-modals`. The page title becomes the label.
  Only `http(s)` URLs load (observed 125667-125720).
- **Group** (`Hee`): `label` is a contentEditable div (Enter commits). The background image is drawn as CSS `background-image` on the
  content element: `cover` (default), `repeat` (tile from top-left), or `ratio`, which also locks the group's aspect ratio to the image
  (observed 125897-125945). Label foreground switches light/dark from the color's luminance (observed 125899-125911).

### A6. Edges (`Xee`)
- Geometry (observed 126159-126168, 125975-126016). The anchor is the midpoint of the chosen side. The path starts 7 px outward
  (`jee`), leaving room for the arrowhead. It is a **cubic Bezier** whose two control points sit along each side's outward normal at
  distance `clamp(dist/2, 70, 150)`. When an end has no arrow, a straight stub to the actual side point is added to the path.
- The arrowhead is the polygon `0,0 6.5,10.4 -6.5,10.4`, translated to the anchor and rotated by side (top 180°, bottom 0°, left 90°,
  right 270°). Arrowheads live in a separate SVG layer (observed 126017-126021, 126169-126173).
- Two `<path>`s per edge: a wide transparent `canvas-interaction-path` for hit-testing and a `canvas-display-path` (observed 126144).
- Side auto-pick (`qee`): compares the angle between node centers with the node's diagonal angle and returns
  right/bottom/left/top (observed 125971-125974).
- The label is a `div.canvas-path-label-wrapper` placed at Bezier t = 0.5 (`getCenter`). Typing saves without pushing history
  (`requestSave(false)`); an emptied label removes itself (observed 126127-126131, 126245-126315).
- The edge bbox used for culling covers only the two anchors, not the curve bulge (observed 126098-126106). This can cull curvy
  edges early (inferred).
- *Follow connection* zooms to the far end, relative to the click (observed 126204-126209).

### A7. Undo / redo and saving
- `hee` is a linear stack of **full document snapshots** (the same objects as `canvas.data`), max 100. Pushing after an undo truncates
  the redo tail (observed 122432-122465).
- `requestSave()` sets `data = getData()`, calls `requestPushHistory(data)` (trailing debounce 250 ms, so a burst of changes is one
  undo step) and then `view.requestSave()` (the TextFileView save debounce) (observed 122951-122956, 122525).
- Undo/redo calls `importData(snapshot, removeMissing=true)`. This diff-patches the live node/edge objects by id, so unchanged
  nodes keep their DOM and editors (observed 122964-122977).
- `overrideHistory()` replaces the current entry. It is used for automatic adjustments such as aspect-ratio fixes (observed 122957-122963).
- On-disk formatting via `Yb`: tab-indented JSON in which any object or array whose members are all primitives goes on **one
  line**, giving one node or edge per line (observed 36534-36580). This keeps git diffs small (inferred motive). Sync does not
  merge `.canvas` at all: a conflicting remote change is rejected and the last uploader wins (see 10, app.js:139937).

### A8. Link-index integration
- `Jee` is a generic background indexer. It listens to vault create/modify/rename/delete, processes queued files one per
  100 ms tick (`SC(run,100)`) and logs failures (observed 126342-126434).
- `ite.process(file)` (observed 126445-126503) parses the JSON:
  - `file` nodes → `embeds.push({file, subpath})`; group `background` → `embeds.push({file: background, subpath: ""})`;
  - `text` nodes → full Markdown metadata: synchronous parse (`Im`) if under 5000 chars, otherwise the worker
    (`metadataCache.computeMetadataAsync`). The result is stored as `caches[nodeId]`, and every reference object is mapped back to
    its node id in a `WeakMap refNodeIds`;
  - then `metadataCache.queueFileForLinkResolution(file)`.
- `metadataCache.getCache(path)` returns `{}` for non-md files, so `resolveLinks` runs for `.canvas`. `iterateRefsForFile`
  then delegates to `linkUpdaters[ext]` (observed 62844-62855, 62877-62885, 63158-63173). The result: **canvas cards and text-card
  links appear in `resolvedLinks`/`unresolvedLinks`**, so they show up in backlinks and the graph. Bases `file.links` also uses
  `iterateRefsForFile` (observed 80824-80832).
- `rte` (the link updater interface: `iterateReferences`, `iterateReferencesForFile`, `applyUpdates`, `renameSubpath`):
  - text-card links are rewritten through the same generic link-replacement routine as Markdown (`zR`). Edits are grouped per node via
    the `refNodeIds` WeakMap and written with `vault.process` (observed 126546-126580);
  - heading/block renames update `subpath` on file cards (observed 126582-126634).
- Separately, `ate.onRename` batches renames (500 ms) into a queue. It rewrites `file` and group `background` paths in every canvas
  whose index embeds mention the old path, and shows a Notice with the count (observed 126667-126724, 126876-126878).
- Search: the global search matcher handles `.canvas` specially. Each text node is matched separately with its cached metadata;
  match keys look like `canvas-<nodeId>`, plus a filename match (observed 52876-52900). Opening a result passes
  `eState.match = {nodeId, content, matches}`. The view then selects the node, pans to it and scrolls/highlights inside its preview
  (observed 71832-71845, 127002-127010). Backlinks also iterate canvas caches (observed ~113937).

### A9. Embedding a canvas in Markdown, and export
- `![[x.canvas]]` renders a **static SVG minimap** (`lte`): group rects first, then edges, then other nodes, all as rounded rects
  (rx = 20) colored with canvas colors. Edge stroke width is `sqrt(bboxWidth/10)`, and the viewBox is the content bbox padded on each side by
  5 % of its larger dimension (observed 127120). Clicking
  opens the canvas (observed 127080-127165).
- **Export PNG** (desktop): a modal offers full or viewport, zoom, logo watermark and "privacy mode" (all text in a scribble font
  'Flow Circular', app.css 3406). Full export moves the wrapper into `body`, opens a covering popup with progress,
  sets zoom, then pans tile by tile. For each tile it waits for a frame plus idle and captures with `webContents.capturePage`, then
  draws onto a 2D `<canvas>` capped at 16284 px per side and scale ≤ 2, and writes the PNG with `original-fs` (observed 124237-124540).

---

## How it works — Part B: Bases

### B1. Files, entry points, embedding
- Extension `base`, view type `"bases"` (`Q8`), registered via `viewRegistry.registerViewWithExtensions` (observed 119732).
  The CM5 mode `base` is aliased to YAML (observed 119710).
- `Q8.setViewData(text)` → `p$.fromString(text)` (YAML → model). A parse error object is passed to the controller, which shows it.
  `saveFn` calls `requestSave()` and `getViewData()` → `query.toString()` re-emits YAML (observed 116290-116351). UI edits (sort, filter,
  columns) **rewrite the file**. Unknown keys are preserved through `unrecognizedData`/`data`.
- Current file (`this`): when the base view is in a sidebar it follows the active file through `file-open`; linked tab groups follow the
  linked leaf; a main-area base starts with no `this` file (observed 116238, 116270-116289).
- **Code block** ```` ```base ````: a post-processor creates a `w1` controller in the rendered block, with `this` = the note containing the
  block. Leading tabs become 4 spaces before YAML parsing. UI edits write back into the code block via `replaceCode` (100 ms debounce)
  (observed 119658-119684).
- **File embed** `![[x.base]]` or `![[x.base#View Name]]` (`k1`): a controller with `this` = the embedding note. It reloads when the
  `.base` file changes and saves edits with `vault.modify` (1000 ms debounce) (observed 119719-119722, 93932-94011).
- Commands: `bases:new-file`, `bases:insert` (creates a base and inserts `![[path]]` at the cursor), `bases:copy-table`,
  `bases:change-view`, `bases:add-view`, `bases:add-item` (observed 119586-119656).
- **CLI handlers** (new Obsidian CLI surface; observed 119771-119951):
  - `base:query` (`file|path|view|format=json|csv|tsv|md|paths`) — note: it scans **only Markdown files**, while the in-app scan covers all files;
  - `bases`;
  - `base:views`;
  - `base:create` (uses the same filter-derived frontmatter as the UI).

### B2. `.base` YAML schema (every key the parser reads; observed `p$.parse` 86600-86678, `g$` 86845-86916)

Top level:

| key | type | meaning |
|---|---|---|
| `filters` | filter tree | global filter, ANDed with each view's filter (`JQ.and`, observed 93701-93703) |
| `formulas` | map name → expression string | computed properties, addressed as `formula.<name>` |
| `properties` | map propertyId → `{displayName, …}` | per-property config. Other keys are preserved (`a$.unrecognizedData`) |
| `display` | map propertyId → string | **legacy**; migrated into `properties.<id>.displayName` |
| `summaries` | map name → expression string | custom summary formulas, evaluated with identifier `values` |
| `views` | list of view objects | at least one; an empty or missing list gives a default `table` view |
| `newItemFolder` | string | folder for "New item" |
| `newItemTemplate` | string (path) | its **frontmatter** is copied into new items (body not copied, inferred from 92728-92745) |
| *anything else* | any | kept verbatim (`unrecognizedData`) |

View object:

| key | type | meaning |
|---|---|---|
| `type` | string (required) | `table`, `cards`, `list`, `kanban`, or a plugin-registered id |
| `name` | string (required) | the view's unique name; also the subpath `#name` |
| `filters` | filter tree | view-specific |
| `order` | list of propertyIds | visible columns/properties, in order (default `["file.name"]`, observed 86455) |
| `sort` | list of `{property, direction: ASC|DESC}` | multi-key. Legacy `column` key accepted. Default `file.name ASC` |
| `groupBy` | `{property, direction: ASC|DESC}` | both keys required |
| `groupOrder` | list of raw keys | manual group order. **Groups not listed are hidden** (`zJ`, observed 91797-91802); kanban "manual sort" |
| `limit` | positive number | truncates after sorting |
| `summaries` | map propertyId → summary name | built-in name or key of the top-level `summaries` |
| *other keys* | any | view options stored in `config.data`, e.g. table `rowHeight` (`""|medium|tall|extra` → ×1/2/4/8 of a 30 px base), `columnSize` {propertyId: px}; cards `cardSize` (50-800, 200), `image` (propertyId), `imageFit` (`""`=cover / `contain`), `imageAspectRatio` (0.25-2.5, 1); kanban `columnWidth` (200-500, 280), `image`, `imageFit`, `imageAspectRatio` (0.5); list `markers` (`bullet|number|none`), `indentProperties` (bool), `separator` (", ") (observed 116717-116747, 117299-117330, 117675-117696, 119265-119277) |

Filter tree (`d$`, observed 86808-86834): a node is either an expression string (leaf) or an object with **exactly one** key
`and` / `or` / `not`, whose value is an array of child nodes. `not` means "none of the children" (NOR) (observed 86400-86406).
`optimize()` flattens nested and/or, drops empty groups and collapses single children (observed 86341-86407).

Property ids (`UQ`/`v$`/`f$`, observed 86125-86131, 86835-86844): the canonical forms are `note.<prop>`, `file.<field>` and
`formula.<name>`. On write, `note.` is stripped unless the remainder starts with `file./formula./note.`, and `file.file` is written as
`file`. On read, a bare `x` becomes `note.x`.

### B3. Expression language
**Grammar** (lezer, serialized tables at 85395-85410). Node names in grammar order: `LogicalExpression (|| &&)`,
`EqualityExpression`, `RelationalExpression`, `AdditiveExpression (+ -)`, `MultiplicativeExpression (* / %)`, `UnaryExpression (! -)`,
`Call`, `ArrayAccess [ ]`, `ObjectAccess .`, `Identifier`, `NullLiteral`, `BooleanLiteral`, `RealNumber`, `String`
(+`Escape`), `RegExp`, `Array`, `GroupedExpression` (observed 85400). Keywords `null`, `true`, `false` are specialized identifiers
(observed 85390-85394). Precedence is inferred to follow that order (loosest = logical, tightest = member/call/index). The relative
precedence of `&&` and `||` was settled at runtime ([14](14-runtime-verification.md)): `true || false && false` evaluates to
`true`, so `&&` binds tighter than `||` (standard precedence); `1 + 2 * 3` is 7.
- Strings: double-quoted (JSON escapes) or single-quoted (converted to JSON) (observed 85534-85545). Regex literal `/pat/flags`
  (observed 85547-85550). Unary minus on a number literal is constant-folded (observed 85592).
- Bad input becomes `SQ` (invalid). It evaluates to null, `test()` returns false, and the error message is shown in the UI (observed 85610-85630).

**Evaluation semantics** (observed 85646-86088):
- `&&`/`||` short-circuit on truthiness and return a Boolean.
- `==`/`!=` use `Value.looseEquals`, a cross-type equality: a string equals a parsed date/duration/link, a link equals a file it resolves to,
  a one-element list equals its element, and so on.
- `< <= > >=`: if either side is null the result is **null** (not false). Dates compare by ms (a string RHS is parsed as a date), and
  durations by ms. Otherwise numbers compare as numbers and anything else compares as strings.
- Arithmetic: number op number; `date ± duration` (a string RHS is parsed as a duration); `duration * / number`; `duration ± duration`;
  `list + list` concatenates; `+` with any string operand concatenates (null becomes ""); `date - date` gives a duration; anything else
  with null gives null; otherwise it throws.
- `!x` returns **null when x is null** (so `!note.missing` is falsy). `-x` requires a number, except that null passes through as null (observed 85759-85766).
- Member access `a.b` calls `a.objectAccess("b")`; a non-null result is required or it throws. `a[expr]`: list with a number index
  (negative counts from the end); object with a string key; string with a char index; other values with a string go to `objectAccess`.
- Identifier lookup goes through the context's `getByIdentifier`. For a row (`YQ`, observed 86180-86190): `this`, `note`, `file`,
  `formula`, otherwise a **case-insensitive frontmatter key**. `formula.x` is computed lazily, cached per row, and has cycle detection
  (a sentinel Symbol throws "infinite loop", observed 86206-86220).
- Calls: `if(cond, a, b?)` is special-cased and evaluated **lazily** (observed 85806-85814). `list.map(expr)`, `list.filter(expr)`,
  `list.reduce(expr, init)`, `object.map(expr)` and `object.filter(expr)` are also special-cased: the argument is re-evaluated per element
  with extra identifiers `value`, `index` (lists) / `key` (objects) and `acc` (reduce) layered over the outer context (observed
  85822-85895). Their registered `apply` methods are stubs that exist only for autocomplete and docs (observed 82084-82125, 82168-82195).
- Everything else: method lookup walks the subject's class chain in `VK`. Arguments are type-checked against the param descriptors.
  A **null argument where a non-null type is required makes the whole call return null instead of erroring** (null propagation).
  A method called on null returns null unless null itself defines it (e.g. `isEmpty`) (observed 85815-85936).
- Raw values are converted lazily (`AK`, observed 81034-81050). Frontmatter goes through `ObjectValue.fromFrontMatter`, which **sniffs
  string content**: `[[x|y]]` gives a Link, a URL gives a Url, `YYYY-MM-DD[THH:mm[:ss]]` gives a Date (date-only vs datetime). The key `tags`
  gives a tag list (observed 80559-80582). Value types are therefore inferred from the data, not from the property-type registry.

**Value types and their fields** (`keys()` / `objectAccess`):
- String: `.length`. List: `.length`. Date: `year, month(1-12), day, hour, minute, second, millisecond, timestamp`.
- Duration: `years, months, weeks, days, hours, minutes, seconds, milliseconds` (computed as a fractional diff from now, via moment).
  Durations parse ISO-8601 `P…T…`, or `"<n> <unit>"` with `d h m s w M y` / long names (observed 80755-80784).
- File (`MK`, observed 80877-80900): `file, name, basename, fullname, path, folder, ext, ctime, mtime, size, links, embeds,
  backlinks, tags, properties`.
  - `links` come from `iterateRefsForFile`, so canvases work too.
  - `backlinks` scans all of `resolvedLinks` per file; it is cached per FileValue but still O(N).
  - `tags` are inline + frontmatter tags, de-duplicated.
- `this` is `QQ`, a File whose member access is routed to the current file's row, so `this.status` and `this.formula.x` work.
- Tags match hierarchically: `#a` matches `#a/b` (observed 80472-80480).
- Rendering: each Value renders itself (`renderTo`). Dates use moment `L`/`L LT`, numbers show ∞, booleans a disabled checkbox,
  links internal links with hover, lists a span list. Errors render as a warning chip (observed 80134-81033).

**Function library** (observed, registration at 81159-82434):

| owner | functions |
|---|---|
| global | `now()`, `today()`, `date(str)` (ISO, also `YYYYMMDDHHmm` and `YYYYMMDD`), `if(c,a,b?)`, `random()`, `min(...n)`, `max(...n)`, `list(x)`, `link(path|file, display?)`, `number(x)` (string/bool/date→number, throws on bad input), `duration(str)`, `image(x)`, `icon(name)`, `file(x)`, `html(str)`, `escapeHTML(str)` |
| any | `toString()`, `isTruthy()`, `isType("string"|"number"|… )` (walks the class chain by type name) |
| null | `isEmpty()` → true |
| string | `startsWith`, `endsWith`, `trim`, `title`, `isEmpty`, `replace(pattern: string|regex, repl)` (a string pattern replaces all), `reverse`, `lower`, `split(sep|regex, n?)`, `contains` (case-insensitive), `containsAny(...)`, `containsAll(...)`, `slice(start, end?)`, `repeat(n)` |
| number | `round(digits?)`, `ceil`, `floor`, `abs`, `toFixed(p)` (→string), `isEmpty` (false) |
| list | `isEmpty`, `earliest`, `latest`, `median`, `mean`, `max`, `min`, `sum`, `stddev` (population), `join(sep)`, `reverse`, `flat`, `unique`, `contains(v)` (looseEquals), `containsAny`, `containsAll` (accept varargs or a single list), `slice`, `sort` (numeric if both numbers, else locale compare), `map`, `filter`, `reduce` |
| object | `isEmpty`, `keys`, `values`, `map`, `filter` |
| regexp | `matches(str)` |
| date | `format(momentFmt)`, `date()` (strip time), `time()` (→string), `relative()` (→RelativeDate, "3 days ago"), `isEmpty` (false) |
| file | `asLink(display?)`, `hasLink(file|link|path)`, `inFolder(path)` (prefix match on `path + "/"`, `/` = all), `hasTag(...tags)`, `hasProperty(name)` |
| link | `linksTo(file)`, `asFile()` |
| tag | `matches(tag)` |

Functions returning booleans (`BK`) double as **visual filter operators**. The filter row offers the comparisons
`== != < <= > >=` (relational ones only for numbers/dates), plus every BK method valid for the left-hand value's type, plus its
negation (`!fn`). The labels come from `workspace.registerOperatorFuncConfigs("bases", [...])`, e.g. `hasLink` → "links to" /
"does not link to" (observed 119731, 90988-91032). An "advanced" toggle swaps the row for a CM6 formula editor (observed 90944-90959, 91036-91045).

**Autocomplete** (`NX`/`t1`, observed 84021-84170). It finds the syntax node before the cursor. For `x.` or `x[`, it *evaluates
the left expression* against a **mock context** (`m$`) whose note properties are dummy values chosen from the property-type registry
(text → "", number → 0, checkbox → true, date → now, tags → [""], multitext → [""]) (observed 86917-86981). It then offers that value's
`keys()` plus its registered methods. Otherwise it offers context identifiers plus global functions. Signatures and docstrings appear as
info. The same mock evaluation drives `getWidgetForIdent`, which picks the editor widget for a formula column (observed 93892-93904).

### B4. Query execution and incremental updates (`w1`)
1. `setQuery(query)` → `update()`. This resolves the view config, instantiates the view via its factory if the type changed, and
   builds a `GQ` context `{filter: and(global, view), formulas, local: this-file}`. It hashes `JSON.stringify({filter, formulas})`
   and **only rescans when the filter or formulas changed**. Sort, order, group, limit and summary changes just call
   `requestNotifyView()` (observed 93668-93700).
2. `runQuery(ctx)` starts a `GT` generator queue seeded with **`vault.getFiles()` (all files, not just md)** (observed 74189-74206).
   Each file: remove the old result, skip user-ignored paths, build `YQ(ctx, file)`, run `filter.test(entry)`, store the entry in
   `results: Map<TFile, YQ>`. Evaluation errors are collected into a Set and shown as Notices after the scan (observed 93803-93878,
   93739-93744). The work is time-sliced by `qI({batchSize:10, duration:50, maxDelay:16})`: every 10 files, if more than 50 ms have
   passed, it yields with a 16 ms timeout (observed 93814, 51840-51869). If the container is hidden, the scan **waits until it is
   inserted/shown** (observed 93825-93827).
3. **Incremental**: `Gj` stays subscribed. Markdown files are re-queued on `metadataCache "changed"`, non-md files on vault
   `create`/`modify`, any file on `rename`. Deletes remove the result (observed 74174-74221). Only the touched file is re-evaluated.
   Formulas that read *other* files (`file.backlinks`, `link.asFile().…`) therefore do not refresh when those other files change
   (inferred limitation).
4. **`this` dependency tracking**: reading `ctx.local` sets `localUsed`. When the queue re-processes the current file itself and
   `localUsed` is set, the whole query restarts with a fresh context (observed 86143-86150, 93832-93838). Changing the current file
   always rescans (observed 93662-93667).
5. `notifyView` (debounced 50 ms, observed 93434, 93736-93771):
   - drop entries hidden by `groupOrder` (`zJ`);
   - apply the toolbar quick-search: tokens must all appear in the display strings of the ordered properties;
   - sort by path for determinism;
   - collect "relevant properties" (union of frontmatter keys of the results);
   - build `UJ(app, config, allProperties, entries)`, which applies sort and then limit;
   - set `view.data` and call `view.onDataUpdated()`;
   - refresh every toolbar menu (filter, properties, new item, sort, group, result count).
   - `allProperties` = the 14 `file.*` fields + `note.<prop>` for relevant props + `formula.<name>` (observed 93790-93802).
6. **Sorting** (`UJ.applySort`, observed 91898-91936): multi-key. Null vs null is equal; booleans sort by truthiness; otherwise null
   always sorts **last**. Numbers, dates and durations compare numerically, everything else by locale compare of the display string.
   Sort keys not in `allProperties` are ignored, and an empty sort falls back to `file.name ASC`.
7. **Grouping** (`groupedData`, observed 91852-91876, 91803-91834):
   - group keys are Values bucketed by `toString()` then `looseEquals`;
   - groups sort by key (numbers numerically, else string compare); groups with a null key sort last;
   - with `groupOrder`, the listed raw keys are converted through `fromFrontMatter`, so they get the same type sniffing, and define
     the order;
   - entries whose key is not listed are hidden; positions are cached per entry in a WeakMap keyed by the groupOrder array (observed 91772-91801).
8. **Summaries** (`getSummaryValue`, observed 91941-91964; `HQ` 86088-86096):
   - the summary type is the class of the **first non-null value** in the column;
   - a custom name from the top-level `summaries` wins; otherwise built-ins are looked up through the class chain:
     - Number: `Average`, `Min`, `Max`, `Sum`, `Range`, `Median`, `Stddev`;
     - Date: `Earliest`, `Latest`, `Range`;
     - Boolean: `Checked`, `Unchecked`;
     - Any: `Empty`, `Filled`, `Unique`;
   - each built-in is *itself a formula over `values`*, e.g. `values.mean().round(2)`;
   - results are cached per (entries array, property, summary) in a WeakMap.

### B5. Editing from views and undo
- `BasesView.updateProperty(file, key, value)` wraps `fileManager.processFrontMatter` in a **transaction**. It records `{file,
  start: deepcopy(frontmatter), end: frontmatter}` and the view's ephemeral state (scroll), and pushes onto the view's undo stack only if
  something changed. Undo restores `start` **only if the file's frontmatter still equals `end`** (optimistic concurrency); redo does the
  reverse (observed 92001-92166). Table and kanban bind Mod+Z / Mod+Shift+Z to these transactions in their own keydown
  handlers (observed 118590, 116926). The undo stack lives per view instance and is not persisted (inferred).
- Table cells for `note.*` use the **same property widgets as the Properties panel** (`metadataTypeManager.getTypeInfo(key,
  value).inferred.render(...)`). Non-md files are disabled (observed 92236-92261). `file.name` renders a file link. Formulas and other
  fields render the Value; errors open a formula editor on double-click (observed 92263-92329).
- **New item** (`i1`, `L$`, observed 87361-87427, 92720-92775). It derives frontmatter that will *satisfy the active filters*:
  - for each non-negated leaf rule it pattern-matches the AST: `!x.isEmpty()` → `x: ""`; `note.x == / >= / <= value` → `x: value`;
    `file.folder == "f"` → folder; `x.contains/startsWith/endsWith/containsAll(v)` → `x: v` (wrapped in a list if multitext);
    `containsAny` → first value; `file.hasTag(t)` → append to `tags`; `file.inFolder(f)` → folder; `file.hasProperty(p)` → `p: null`;
  - every `note.*` column in `order` gets `null`.
  - Values are converted back to YAML: Links/Files become `[[linktext]]` relative to the new file (`R$`).
  - The folder comes from `newItemFolder`, then the template's folder, then the filter-derived folder, then the default new-file
    location. The note opens in a hover popover with title focus (desktop) or a new tab (phone).
- Kanban (`m7`) drag-and-drop between columns rewrites the groupBy property, coerced to a list for multitext, or **moves the file**
  when grouped by `file.folder`. It is read-only when grouped by a formula or another `file.*` field. Column reorder/hide writes `groupOrder`
  (observed 116951-117065).
- Drag files, bookmarks or OS files onto any view: applies the same filter-derived frontmatter to those files, moves them into
  the derived folder, and imports OS files as attachments first (observed 93469-93551).
- Copy table: TSV + Markdown + HTML + `obsidian/table` clipboard formats (observed 92167-92218).

### B6. Views and rendering (all virtualized, recycled DOM)
- **Table** (`q7`, observed 119040-119260):
  - div-based rows (`bases-tr`/`bases-td`), not `<table>`;
  - fixed row height = CSS `--bases-table-row-height` (30) × {1,2,4,8};
  - **row and column virtualization**: rows outside the viewport plus overscan (up to 10 rows or half a screen, growing toward the
    scroll direction) are not rendered, and columns outside the horizontal window are skipped by `virtualize(widths, left, right)`;
  - recycled row objects, with a spare pool of at most 10;
  - auto column width: the longest `toString()` value per column is rendered into an offscreen `contain:strict` measuring row, then
    clamped by CSS min/max (40/300);
  - custom widths are persisted as view key `columnSize`, and the last column stretches to fill;
  - spreadsheet-like active-cell and range-selection overlays; footer summary row; scroll is persisted as a fraction in ephemeral state.
- **Cards** (`a7`, observed 116567-116701): hidden "tester" elements are measured once from CSS (paddings, gaps, title/prop line
  heights). From these it computes `cardsPerRow = floor(width / cardSize)` and a **fixed card height** (cover + title + n×property lines).
  It renders only cards whose row intersects the overscanned viewport, positions them absolutely, and recycles card objects (spare
  pool ≤ max(10, 2×perRow)). Image covers come from the `image` property, with a thumbnailer `J8`.
- **List** (`D7`): variable-height rows. It measures rendered rows and estimates the rest with a running average
  (`addMeasuredRow`/`getAverageRowHeight`, observed 117628-117785).
- **Kanban** (`m7`): one column per group, fixed `columnWidth`, per-column virtual card lists, placeholder column, and card/column drag state.
- A map view is **not** in core (observed: only these four `registerView` calls, 119739-119770).
- Group headings are collapsible. Fold state lives in localStorage `<appId>-bases-group-fold-<basePath>` (per view name). Keys of deleted bases
  are cleaned up at layout-ready (observed 93623-93652, 119711-119717, 92024-92056).

### B7. Plugin API
- `Plugin.registerBasesView(id, {name, icon, factory(controller, containerEl) → BasesView, options(config) → option defs})`.
  It returns false if Bases is disabled and is unregistered on plugin unload (observed 109035-109040, 120015-120029). Option definition
  shapes in use: `{type: slider|dropdown|property|toggle|text, key, displayName, min, max, step, default, options, filter,
  placeholder, shouldHide}`.
- `Plugin.registerGlobalFunc(fn)` / `registerInstanceFunc(ValueClass, fn)` put functions into the `VK` registry. A function object
  has `name`, `params: [{name, type: [ValueClass...], optional?, variadic?, customWidget?}]`, an optional `docString`, and
  `apply(...args)`. Inside `apply`, `this.ctx` is the evaluation context (observed 109041-109054, 81052-81092).
- Hover-link source `"bases"` is registered for page previews (observed 119729).

---

## Data formats & on-disk files

### `.canvas` (JSON Canvas 1.0 + Obsidian behaviour)
```
{ "nodes": [ <node>, ... ], "edges": [ <edge>, ... ], ...unknown top-level keys preserved }
```
Node (all types): `id` (16 hex chars when Obsidian generates it), `type`, `x`, `y`, `width`, `height` (integers, rounded on
load), optional `color`, plus any unknown keys (round-tripped).

| type | extra fields | notes |
|---|---|---|
| `text` | `text` (Markdown) | always written |
| `file` | `file` (vault path), `subpath` (`#Heading`, `#^block`, `#page=N`, `#ViewName` for .base) | `subpath` omitted when empty |
| `link` | `url` | |
| `group` | `label`, `background` (vault path), `backgroundStyle` (`cover` default and omitted, `ratio`, `repeat`) | `label`/`background` omitted when empty |

Edge: `id`, `fromNode`, `fromSide`, `toNode`, `toSide` (sides are **always written**, auto-computed if absent), `fromEnd` (written
only if not `"none"`), `toEnd` (written only if not `"arrow"`), optional `color`, optional `label`, plus unknown keys.

Colors: `"1"`-`"6"` map to CSS `--canvas-color-1..6` = red, orange, yellow, green, cyan, purple (app.css). Any other string is parsed as a CSS
color and set on `--canvas-color` with class `mod-canvas-color-custom`. Legacy `"r, g, b"` strings are converted to hex on load and
saved as hex (observed 121555-121574).

Differences from the spec (observed): unknown node types are dropped; edges to missing nodes are dropped; coordinates are forced to
integers; sides are always materialized; array order is rewritten to z-order (groups by area, others by recency of interaction).
Formatting: tabs, one primitive-only object per line (`Yb`).

Other storage: plugin settings `.obsidian/canvas.json` (via `loadData`) with keys `newFileLocation` (`root|current|folder`),
`newFileFolderPath`, `defaultWheelBehavior` (`pan|zoom`), `defaultModDragBehavior` (`menu|card|note|media|webpage|group`),
`cardLabelVisibility` (`always|hover|never`), `snapToGrid`, `snapToObjects`, `zoomBreakpoint` (number). localStorage
`<appId>-canvas-<path>` = `{readonly:true}`. Workspace leaf state `viewState: {x, y, zoom}`. Fold state for text cards under
`<canvas>#^<nodeId>`.

### `.base` (YAML; emitted by the eemeli `yaml` library, `PF`/`IF` at 58292-58300)
Illustrative shape (my own example of the keys documented in B2):
```yaml
filters:
  and:
    - file.hasTag("book")
    - 'status != "dropped"'
formulas:
  age_days: (now() - file.ctime).days
summaries:
  total_pages: values.sum()
properties:
  note.status: { displayName: Status }
views:
  - type: table
    name: Reading
    filters: { or: [ 'rating >= 4', 'file.inFolder("Favorites")' ] }
    order: [ file.name, status, formula.age_days ]
    sort: [ { property: formula.age_days, direction: DESC } ]
    groupBy: { property: status, direction: ASC }
    summaries: { formula.age_days: Average }
    limit: 50
    rowHeight: medium
```
Group fold state: localStorage `<appId>-bases-group-fold-<path>`, holding `{viewName: [groupId...]}`, where groupId = `"<ValueClass>:<key>"`.

---

## Rebuild notes

**Canvas — essentials**
1. **Use the DOM for nodes and one transformed container.** Keep `zoom` as log2(scale) for perceptually even zooming, ease toward targets with
   frame-rate-independent exponential smoothing, and zoom about the cursor. The `--zoom-multiplier = sqrt(1/scale)` trick for chrome
   size is cheap and effective. This fits a Tauri/WebView app well: it keeps text crisp and selectable, and lets real editors live in cards.
   For a *graph* view of thousands of nodes, use canvas/WebGL instead. Canvas-style DOM tops out at a few hundred visible nodes.
2. **Mount through a spatial index.** An R-tree (or a uniform grid) of node and edge bboxes, viewport queries per frame, a budget of
   N new mounts per frame, and a content level of detail (placeholder below a zoom threshold). Give edges a bbox that includes control
   points (Obsidian's endpoint-only bbox culls curves too early).
3. **Use one dirty-set frame loop** (`moved` → reindex, `dirty` → render, selection diff) instead of rendering immediately. It makes
   multi-select drags and undo cheap.
4. **Snapshot undo with id-diffing import** is simple and robust for documents of a few MB. Debounce pushes (250 ms) so a gesture is one
   step, and add "override current" for automatic corrections.
5. **Preserve unknown fields** at node, edge and top level for spec forward-compatibility. Unlike Obsidian, keep unknown node types as
   inert placeholders instead of deleting them.
6. **Index canvases like notes.** Text nodes → Markdown metadata, file nodes → embed refs, reverse map ref → node id for
   rename rewriting. This one decision gives backlinks, graph edges, search hits and rename safety for free.
7. Edge routing: side-midpoint anchors, a cubic Bezier with normal-offset control points `clamp(d/2, 70, 150)`, auto-side by angle,
   arrowheads as a separately rotated marker. Snapping: corner+center points, per-axis nearest-delta, grid fallback.

**Canvas — incidental**: Electron webview for link cards, tile-stitching PNG export via `capturePage` (in Tauri, render with an
offscreen approach or export SVG instead), YouTube special-casing, mobile long-press handling.

**Bases — essentials**
1. **A typed Value model with polymorphic `objectAccess` + per-type method registry** is the core abstraction. It makes the language,
   rendering, sorting, summaries and autocomplete all fall out of the same objects. Keep `looseEquals` explicit and documented,
   because it is what makes filters like `status == "done"` or `link == this` work across types.
2. **Parse to an AST once and evaluate per row.** Cache formula results per row, detect cycles, and special-case lazy constructs
   (`if`, `map/filter/reduce` with `value/index/acc`). Prefer **null propagation** over errors for missing data, but note the
   `!null == null` gotcha and decide deliberately.
3. **Query = full scan once, then per-file re-evaluation** on metadata-change events, with the scan time-sliced. Separate the
   "membership" hash (filters + formulas) from presentation (sort/group/limit/summaries), so UI tweaks never rescan. For the
   user's app (SQLite + embeddings), filter membership can be a SQL prefilter plus an in-memory expression pass. Track cross-file
   dependencies (backlinks, `this`) explicitly if formulas may reference them.
4. **The file is the source of truth and is human-editable YAML**; the UI round-trips it while preserving unknown keys. Keep a
   legacy-key migration layer (`display` → `properties.displayName`, `column` → `property`).
5. **Summaries as formulas over `values`** is an elegant reuse. **Filter-derived defaults for new items** is a delightful,
   cheap feature worth copying.
6. **Virtualize every view** with fixed or estimated heights measured from CSS testers, and recycle row components.

**Bases — incidental**: lezer and CM6 autocomplete (any Pratt parser plus a simple completion list would do), kanban folder-move
semantics, CLI handlers, multi-format clipboard export.

---

## Open questions
- ~~`&&` vs `||` precedence~~ **Answered at runtime:** `&&` binds tighter. `!note.missing` is `null`, confirmed.
- Whether `registerGlobalFunc` / `registerInstanceFunc` are in public `obsidian.d.ts`, and how plugins are expected to create function
  objects, since the `RK`/`BK` bases are not exported. Check github.com/obsidianmd/obsidian-api.
- `Gj` sorts the initial file list by `dom.sortOrder` (observed 74202), but `w1` never sets `sortOrder`; is it ever used for Bases? Probe at runtime.
- How the TextFileView save debounce interacts with canvas `requestSave` (latency to disk). (Sync merging is settled: only `.md`
  is 3-way merged; `.canvas` and `.base` keep the last uploader's version, see 10.)
- ~~Invalid canvas JSON~~ **Answered at runtime:** opening a malformed `.canvas` fails safely. The tab falls back to an empty view and
  the file is untouched, so no overwrite. The notice reads `Failed to open “”` (the file name is missing).
- Whether the list and cards views offer undo at all: only table and kanban bind it (observed 118590, 116926).
- Whether `newItemTemplate` copies the template body: from 92728-92745 only frontmatter is merged into a file created empty
  (inferred). Confirm at runtime.
