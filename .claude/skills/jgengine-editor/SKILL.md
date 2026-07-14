---
name: jgengine-editor
description: Open the scene editor to place spawns, zones, and ranges visually.
---

# JGengine Editor

## When to use

Authoring or inspecting spatial game data: terrain context, player/mob/boss spawns, zone disks, aggro/leash/discover radii, corridor paths. Prefer this over guessing `x,y,z` in TS tables.

## Open (human / agent browser)

```
bun run dev:runner
# http://localhost:<port>/?game=borderlands2&mode=editor
# http://localhost:<port>/?game=vice-isle&mode=editor
```

The editor ships everywhere as a **lazy chunk** — production `/play` (and the public `/games/<id>` pages) download it only when summoned with F2+E or `?mode=editor`. In the dev runner, **Save (Ctrl+S)** writes the scene straight to `Games/<id>/src/editor.scene.json` through the dev server's `/__jgengine/save` endpoint; the file auto-loads on the next editor open as an overlay (same-id objects win over the game's derived `editorLayers`, new objects append) and is plain JSON a game can import as runtime data. Fold long-lived edits back into source tables when they stabilize. Outside the dev server (production pages) the Save button hides and Export JSON remains the only exit. The F2+D Tune tab has the same seam: **Save to source** rewrites changed tunable literals directly in `Games/<id>/src/*.ts`.

## Standalone games ship the editor too

`npx jgengine create` scaffolds all of this outside the monorepo: the game's `main.tsx` summons the editor on F2+E or `?mode=editor` as a lazy `@jgengine/editor` chunk, and `vite.config.ts` mounts the published save middleware so Save (Ctrl+S) writes `src/editor.scene.json` and Tune's Save-to-source rewrites literals:

```ts
import { standaloneSavePlugin } from "@jgengine/node/devSavePlugin";
export default defineConfig({ plugins: [react(), tailwindcss(), standaloneSavePlugin()] });
```

Monorepo-shaped hosts use the general form — `devSavePlugin((gameId) => srcDirFor(gameId))` — and `handleSaveRequest` is the transport-free core for a non-Vite dev server.

## Modes: edit · walk · play

- **edit** — frozen sim, orbit inspection camera, gizmos and chrome.
- **walk** — frozen sim, the game's own camera/movement; roam the world with markers drawn in place.
- **play** — the real game (loop, HUD, camera) with a floating exit chip.

Toolbar buttons, `F2+E` (edit ↔ play, same chord family as F2+D devtools), chip/F2+E returns to edit, or RPC: `{ method: "set_mode", mode: "play" }`. The editor session (document, undo, selection) survives mode switches. **F2+E summons the editor from any running `mode=play` game** — dev runner or the website's `/games/<id>` pages, dev and production alike, no URL change needed.

## Perf: the editor measures itself

- Toolbar shows a live `fps · draws · tris` pill (red under 30fps).
- `F2+D` opens the engine devtools panel (debug mode) — sim phase bars name the exact lag culprit.
- Agents: `{ method: "editor_status" }` includes a `perf` sample and current `mode`; `{ method: "perf_report" }` returns the devtools snapshot (fps, sim phases, culprit hints). Never guess at lag — pull the report.

## Game opt-in (optional, thin)

```ts
// Games/<id>/src/index.tsx
export { game } from "./game.config";
export { editorLayers } from "./editorLayers";
```

`editorLayers` returns an `EditorDocument` (markers, volumes, paths). Live entities from `onInit` still render without it.

## The F2 chord family — three modes, all agent-usable headless

- **F2+D — debug mode**: engine devtools overlay (Perf/Tune/Logs/Net/Keys/Col). A plain F2 tap does nothing; F2 is only the chord holder.
- **F2+C — canvas mode**: HUD layout editing — drag `HudPanel`s live (`HudCanvas` `editChord`).
- **F2+E — editor mode**: this scene editor.

Agents never need a user-launched server: `bun run drive` boots the dev server **and** headless Chromium itself, and every `GamePlayerShell` page installs `window.__jgengineAgent` — one RPC surface covering all three modes (`--rpc` prefers it, falls back to the raw editor host). Unknown verbs delegate to the live editor host, so all editor verbs below work through it too.

```
bun run drive <id> --rpc '{"method":"agent_status"}'                    # which modes are live
bun run drive <id> --rpc '{"method":"debug_snapshot"}'                  # lean perf/logs/tunables report
bun run drive <id> --rpc '{"method":"debug_report"}'                    # full devtools snapshot
bun run drive <id> --rpc '{"method":"canvas_state"}'                    # HUD panels + placements
bun run drive <id> --rpc '{"method":"canvas_move_panel","id":"minimap","anchor":"top-right"}' --shot hud
bun run drive <id> --rpc '{"method":"editor_summon"}' --wait 2000 --rpc '{"method":"scene_summary"}'
bun run drive <id> --mode editor --rpc '{"method":"set_transform","id":"boss","x":-90,"z":-650}' --rpc '{"method":"export_document"}'
```

Canvas verbs: `canvas_state`, `canvas_set_editing {editing}`, `canvas_move_panel {id, anchor, dx?, dy?}`, `canvas_reset {id?}`. Debug verbs: `debug_open {open?}`, `debug_snapshot`, `debug_report`. Editor extras: `save_scene` writes the live document to `Games/<id>/src/editor.scene.json` through the dev-server save endpoint — the headless Ctrl+S. Menu-gated games: `--click`/`--key` steps first, then RPC. For pure document edits without WebGL, use the headless CLI below.

## Agent RPC (same verbs as UI)

Browser console / injected host:

```js
window.__jgengineEditorHost.handle({ method: "scene_summary" })
window.__jgengineEditorHost.handle({ method: "camera_goto", id: "boss_warrior" })
window.__jgengineEditorHost.handle({ method: "set_transform", id: "boss_warrior", x: -90, z: -650 })
window.__jgengineEditorHost.handle({ method: "export_document" })
```

Headless against the live rendered editor (screenshots + RPC in one run):

```
bun run drive borderlands2 --mode editor --wait 3000 --rpc '{"method":"editor_status"}' --shot check
bun run drive borderlands2 --mode editor --rpc '{"method":"set_mode","mode":"play"}' --wait 2000 --shot playing
```

Headless document tools (no WebGL — document verbs only, no camera/perf):

```
bun packages/editor/src/mcp/cli.ts --game borderlands2 --rpc '{"method":"list_layers"}'
bun packages/editor/src/mcp/cli.ts --game borderlands2 --serve   # POST localhost:17373/rpc
bun packages/editor/src/mcp/cli.ts --game borderlands2 --stdio   # MCP JSON-RPC on stdin/stdout
```

Viewport: click anything to select — editor gizmos hit directly, world geometry snaps to the nearest marker/volume/path/note, repeat-click cycles stacked candidates, shift/ctrl-click multi-selects — then TransformControls (W move / E rotate marker / R scale volume: radius, cylinder height, or box half-extents). Multi-selection drags move every selected object. Snap button cycles ground / grid / off (grid also snaps rotation to 15°); `G` toggles the reference grid. Outliner groups by kind (notes included) with ×N dedup rows; `N` cycles instances of the selected row; ctrl-click adds to selection.

Authoring: **+ Add** menu places markers, volumes (sphere/box/cylinder), notes, and draws paths (click points, Enter finish, Esc cancel; shift-click keeps placing). Select a path, click a vertex sphere to move/insert/delete points. `Ctrl+D` duplicates, `Ctrl+C/X/V` copy/cut/paste (system clipboard gets the JSON fragment too), `Ctrl+A` selects all visible, Delete removes, arrows/PgUp/PgDn nudge by grid step (Shift ×5), `F` frames the selection, `?` opens the shortcut sheet. Inspector edits labels, kind, display color, note text, radius/height/half-extents, and coalesces typed edits into single undo steps. **Import** loads an exported JSON back in (success/error toasts); Export downloads, `⧉` copies the JSON. Edits autosave to a per-game localStorage draft — reopening the editor offers Restore/Discard; the header shows an amber ● while the document differs from the game's authored layers. Layer visibility and snap prefs persist per game in localStorage.

## Vegetation volumes — density is one slider

**+ Add → Vegetation (box/circle)** places a fill area; its inspector section has an **item** field (`grass`, or any render-catalog id like a tree/bush model) and a **density /m² slider** (plus exact number, scale range, spacing, reroll seed) with a live `≈ N placements over M m²` readout. Data rides `volume.meta` in the saved scene — no new schema.

Consume in the game (`@jgengine/core/world/vegetation`):

```ts
import { grassPatchesFromVegetation, resolveVegetation } from "@jgengine/core/world/vegetation";

grass: grassPatchesFromVegetation(sceneDoc),          // item "grass" → shell blade patches, density = blades/m²
for (const p of resolveVegetation(sceneDoc))          // everything else → deterministic placements
  ctx.world.object.place(p.item, p.x, 0, p.z, { rotation: p.rotation, visual: { scale: p.scale } });
```

Same volume, same seed → same field every run; drag the slider, save, done.

## Terrain sculpting — brushes on the live heightfield

Toolbar **Terrain** (or press `T`) enters the sculpt tool. **Create terrain** lays an editable
heightfield over the scene; brushes then reshape it with live feedback:

- **Raise / Lower** — push ground up or dig it down · **Smooth** — average toward neighbours ·
  **Flatten** — level to a sampled or numeric height · **Noise** — fractal roughening (seeded, repeatable) ·
  **Ramp** — drag low→high to grade a straight slope.
- Live controls: radius, strength, falloff (smooth/linear/none), shape (circle/square), spacing,
  invert modifier, flatten height, noise seed. A preview ring tracks the cursor.
- A whole drag commits as **one** undoable stroke (compact vertex delta — the terrain document is
  never copied per move). `Ctrl+Z` / `Ctrl+Y` undo/redo strokes like any edit; strokes serialize with
  the scene under `document.terrain`.

The sculpt engine is the reusable `@jgengine/core/world/terraform` seam — build, edit, and consume it
outside the editor too:

```ts
import {
  createTerrainSnapshot,          // fresh flat heightfield over an Aabb
  editableTerrainFromSnapshot,    // rebuild a live EditableTerrain over the game's ground
  beginTerraformStroke,           // batch many stamps into one compact TerraformDelta
  applyDeltaToSnapshot,           // redo a stroke onto a snapshot (copy-on-write)
  revertDeltaFromSnapshot,        // undo a stroke onto a snapshot (copy-on-write)
} from "@jgengine/core/world/terraform";

const snapshot = createTerrainSnapshot({ bounds: { minX: -100, minZ: -100, maxX: 100, maxZ: 100 }, cellSize: 2 });
const terrain = editableTerrainFromSnapshot(snapshot, ctx.world.ground);
const stroke = beginTerraformStroke(terrain);
stroke.stamp({ mode: "raise", center: [0, 0], radius: 12, strength: 1 });
const delta = stroke.delta();                       // one undoable step
const next = applyDeltaToSnapshot(snapshot, delta); // serializable, back to document.terrain
```

### Material painting

The terrain tool's **Paint** sub-mode paints material layers (grass/dirt/rock/sand/mud/snow/road/gravel)
onto the same heightfield — the surface id is stored per cell in `document.terrain.surfaces` and colors the
mesh. Click/drag paints the selected material; **Alt-click** samples (eyedropper); **Fill all** / **Clear
paint** blanket the terrain; **Auto rules** paint by slope ("on steep slopes") or height ("on high ground").
Each stroke/fill is one undoable `paintTerrain` command (compact `SurfaceDelta`). Consume with
`beginSurfaceStroke`, `fillSurfaceDelta`, `autoPaintDelta`, and `surfaceAt` from `@jgengine/core/world/terraform`.

## Foliage / scatter regions

**+ Add → Foliage region (lasso)** draws a closed polygon on the terrain (click points, Enter to finish) —
a scatter path of `kind: "scatter"`. Its inspector drives deterministic, **GPU-instanced** scatter that
previews live in the viewport as you drag: **density /m²**, spacing, a weighted **species palette**
(add/remove rows of item id + weight), scale range, **max slope** and **height** masks, **edge fade**
(feather the border), align-to-slope, and a seed with a reroll button. Same seed → same field. Rules ride
`path.meta`; consume in a game with `resolveScatter(doc, terrain)` from `@jgengine/core/world/scatterRegion`,
instancing each placement's `item` from the render catalog (never one node per plant).

Headless: `create_terrain`, `sculpt_terrain {mode,x,z,radius,strength,…}`, `paint_terrain {surface,x,z,radius}`,
`fill_terrain {surface}`, `auto_paint {surface,minSlope,minHeight,…}`, `terrain_materials`, `terrain_summary`,
`add_foliage {points,density,item}`, and `scatter_summary` RPC verbs drive and assert terrain + foliage
authoring without WebGL (`bun packages/editor/src/mcp/cli.ts`).

## Scene hierarchy — parent / child

The outliner has a **By kind** and a **Hierarchy** view (nested tree, expand/collapse). Any object can be
**parented** under another via the inspector's *parent* dropdown (or the `set_parent` RPC) — moving or
translating a parent carries its whole subtree by the same delta, and cycles are refused. Parenting rides
`parentId` on the object itself, so it serializes, undoes, and translates through the existing commands.
Helpers in `@jgengine/core/editor/index`: `editorRoots`, `editorChildren`, `editorParentOf`,
`collectDescendants`, `wouldCreateCycle`. Headless: `set_parent {ids, parentId}` and `hierarchy`.

## Responsiveness — selector subscriptions + virtualization

The editor stays smooth on large scenes via two seams (`@jgengine/editor`):
- `useStoreSelector(store, selector, isEqual?)` subscribes a component to a **slice** of the session/UI
  store through `useSyncExternalStore`, so it rerenders only when that slice changes — UI-only churn
  (gizmo mode, snapping, active tool) no longer rerenders the outliner/inspector. `shallowArrayEqual`
  is the selection-list comparator.
- `virtualWindow(scrollTop, viewportHeight, rowHeight, rowCount, overscan?)` is the pure windowing math
  behind the outliner's fixed-height virtual list — a scene with thousands of objects only mounts the
  visible handful of rows. The status bar shows live object + foliage-instance counts next to the fps pill.

## Core APIs (`editor/`)

- `@jgengine/core/editor/index` — document, session, commands, undo
- `@jgengine/core/editor/types` — markers, volumes, paths
- `@jgengine/core/editor/document` — normalize/merge/export
- `@jgengine/core/editor/commands` — `createEditorSession`
- `@jgengine/editor` — `EditorApp`, host RPC, bridge server (dev-only package)

## Do not

- Statically import `@jgengine/editor` from `GameHost` or game entry code — summon it only as a lazy chunk (`await import("@jgengine/editor")`), the pattern the scaffolded `main.tsx` ships
- Treat mesh modeling as in-scope (placement/world tools only)
