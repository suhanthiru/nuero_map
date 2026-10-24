# Obsidian graph view — teardown (REA, 2026-10-20)

Static analysis of the installed Obsidian desktop app to learn how its graph
view is built, so Neural Map can borrow the *ideas*. Nothing here is Obsidian
code; it is a description of behaviour and parameters. Do not paste code from
Obsidian's bundle into this repo.

## Target

| | |
|---|---|
| App | Obsidian 1.14.4 (`package.json` name `obsidian-dev`), Windows |
| Artifact | `%LOCALAPPDATA%\Programs\Obsidian\resources\obsidian.asar`, sha256 `146ef847…2b92f` |
| Graph physics | `sim.js` (17.7 KB), sha256 `549be2f6…eee25d` |
| Graph renderer + UI | `app.js` (3.9 MB), sha256 `958ce57f…a2df9`, renderer around char offset 2,379,700–2,406,600, settings UI around 2,733,000–2,749,100 |
| Renderer library | `lib/pixi.min.js` (PixiJS 7.2.4, WebGL) |

REA evidence (session-scoped): focused app analysis `ev_ae0bb237…d487`;
worker trace `ev_44d7c58e…4b37` shows `app.js` creating
`new Worker("/sim.js", {name: "Graph Worker"})`.

## Architecture

```
main thread                                   Graph Worker (sim.js)
┌──────────────────────────────┐   nodes/links/forces/drag   ┌─────────────────────────────┐
│ data → setData()             │ ─────────────────────────▶  │ WASM Barnes-Hut + collide   │
│ PixiJS scene (retained)      │                             │ (JS d3-force fallback)      │
│ rAF render loop, stops idle  │ ◀─────────────────────────  │ setTimeout tick @ 60 Hz     │
│ hover/zoom/pan/drag          │   Float32 x,y per tick      │ stops when alpha < 0.001    │
└──────────────────────────────┘   (SharedArrayBuffer, else  └─────────────────────────────┘
                                    transferable ArrayBuffer)
```

* **Physics never runs on the UI thread.** The worker owns positions and posts
  a packed `Float32Array` of `x,y` pairs plus an id list each tick. With
  `SharedArrayBuffer` it reuses one buffer with a version counter in the last
  4 bytes; the renderer skips the copy when the version is unchanged.
* **Primary solver is WebAssembly** (base64 module embedded in `sim.js`,
  exports `init`, `simulate`, `manyBody`, `visitCharge`, `visitCollide`,
  `complete`). If WASM fails it logs "Using fallback d3 simulator" and runs
  plain d3-force.
* **Rendering is a retained PixiJS scene**, not redraw-from-React. Each node
  owns a circle `Graphics` + a `Text`; each link is a 1×1 white texture
  sprite stretched and rotated (cheap), plus an optional arrow.
* **The render loop sleeps.** Every input calls `changed()`, which resets an
  idle counter and requests a frame; after 60 frames with nothing new, the
  loop stops scheduling itself.

## Physics parameters (observed in `sim.js`)

| Parameter | Value |
|---|---|
| Alpha start / decay | 1, decay `1 − 0.001^(1/300)` (≈300 ticks to cool), stop below 0.001 |
| Velocity decay | `v *= 0.6` per tick |
| Center | `forceX(0)` + `forceY(0)`, strength 0.1 (UI default 0.1) |
| Link | distance 250, strength = d3 default (`1 / min(degree)`) × linkStrength (UI default 1) |
| Many-body | strength −1000 in fallback, `distanceMin` 30, θ 0.9; UI "repel" default 10 |
| Collide | radius 60, strength 0.5 |
| Reheat on data/force change | `alpha 0.3` |
| Drag | pin `fx/fy`, `alpha 0.3, alphaTarget 0.3`; release → `alphaTarget 0`, unpin |

Unknown: how the UI repel value (10) is scaled inside the WASM `manyBody`
(WASM not decompiled — no WABT on this machine).

## Rendering techniques worth borrowing

1. **Smooth hover focus.** Hovering a node fades every non-neighbour to
   alpha 0.2 and keeps neighbours at 1, eased per frame with an exponential
   lerp (`a = a·0.9 + target·0.1`). Link alpha and tint colours ease the same
   way. Hovered node gets a ring, its label is forced visible and slides down
   15 px.
2. **Semantic zoom.** Nodes are drawn at `size × sqrt(1/zoom)` in world units,
   so on screen they grow only with `sqrt(zoom)`: zooming in spreads the map
   without ballooning dots. Labels fade in with
   `alpha = clamp(log2(zoom) + 1 − textFade, 0, 1)`. Arrows fade in with
   `clamp(2·(zoom − 0.3), 0, 1)`. Line width is divided by zoom, so it stays
   constant on screen.
3. **Node size from degree.** `clamp(3·sqrt(degree + 1), 8, 30) × nodeSize`.
   Label font is `14 + size/4` px, word-wrapped at 300, centred under the node.
4. **Smooth zoom + inertia.** Wheel sets a *target* scale
   (`× 1.5^(−deltaY/120)`, clamped to [1/128, 8]); the actual scale eases toward
   it (factor 0.85) around the cursor. Panning keeps velocity after release.
   Arrow keys pan, Shift speeds up; touch pinch is supported.
5. **Progressive loading.** Each frame creates graphics for at most the 50
   not-yet-rendered nodes nearest the viewport centre, so huge vaults appear
   centre-out instead of freezing.
6. **Viewport culling** for circles, labels (a 600×200 box under the node) and
   links (bounding box of both ends).
7. **Incremental layout stability.** A new node starts at the centroid of its
   already-placed neighbours plus small jitter; an isolated new node is placed
   on a ring just outside the current graph. Existing nodes keep positions.
8. **Theme-driven colours.** At startup and on theme change it creates hidden
   `div.graph-view.color-*` elements and reads computed `color`/`opacity`
   (`color-fill`, `-focused`, `-tag`, `-unresolved`, `-attachment`,
   `color-line`, `color-arrow`, `color-circle`, `color-text`,
   `color-fill-highlight`, `color-line-highlight`). Themes restyle the graph
   with CSS only.
9. **Local graph sizing by distance.** Local graph runs a BFS to `localJumps`
   depth; the centre gets weight 30 and each hop gets less, so size encodes
   distance from the current note.
10. **"Animate timelapse"** settings button replays nodes appearing over time.

## Neural Map comparison (as of this teardown)

| | Obsidian | Neural Map (`src/features/graph`) |
|---|---|---|
| Physics thread | Web Worker + WASM | main thread, d3-force (`layout/useForceLayout.ts`) |
| Per-tick path | typed array → mutate Pixi objects | `setPlaced(snapshot)` → React re-render → labels + hit index recomputed → `drawScene` |
| Renderer | PixiJS WebGL, retained | Canvas 2D, full redraw (`render/draw.ts`) |
| Idle | loop stops after 60 quiet frames | redraw on every state change |
| Hover focus | eased fade | eased 200 ms fade (`model/emphasisFade.ts`), instant with reduced motion |
| Node size vs zoom | grows with √zoom | grows with √zoom above 1×, min 2 px (`drawnRadius` in `model/scales.ts`) |
| New topics | centroid of neighbours | centroid of neighbours, ring if unconnected (`layout/seedPositions.ts`) |
| Accessibility | canvas only; keyboard pan/zoom | keyboard focus, aria-live, reduced motion, tooltips — **already ahead** |

Ported on 2026-10-20: (1) eased hover fade, (2) semantic zoom for node size
(line width and label fade by zoom already existed), (7) centroid placement.
Still not adopted: physics in a worker (only pays off at stress-test scale,
`npm run dev:stress`), retained/WebGL rendering, idle render stop.
