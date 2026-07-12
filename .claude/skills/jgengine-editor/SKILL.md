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
# http://localhost:<port>/?game=canyon-chase&mode=editor
```

The editor ships everywhere as a **lazy chunk** — production `/play` (and the public `/games/<id>` pages) download it only when summoned with F2+E or `?mode=editor`. All edits are client-side and session-local; Export JSON is the only way anything leaves the page.

## Modes: edit · walk · play

- **edit** — frozen sim, orbit inspection camera, gizmos and chrome.
- **walk** — frozen sim, the game's own camera/movement; roam the world with markers drawn in place.
- **play** — the real game (loop, HUD, camera) with a floating exit chip.

Toolbar buttons, `F2+E` (edit ↔ play, same chord family as F2 devtools), chip/F2+E returns to edit, or RPC: `{ method: "set_mode", mode: "play" }`. The editor session (document, undo, selection) survives mode switches. **F2+E summons the editor from any running `mode=play` game** — dev runner or the website's `/games/<id>` pages, dev and production alike, no URL change needed.

## Perf: the editor measures itself

- Toolbar shows a live `fps · draws · tris` pill (red under 30fps).
- `F2` opens the engine devtools panel — sim phase bars name the exact lag culprit.
- Agents: `{ method: "editor_status" }` includes a `perf` sample and current `mode`; `{ method: "perf_report" }` returns the devtools snapshot (fps, sim phases, culprit hints). Never guess at lag — pull the report.

## Game opt-in (optional, thin)

```ts
// Games/<id>/src/index.tsx
export { game } from "./game.config";
export { editorLayers } from "./editorLayers";
```

`editorLayers` returns an `EditorDocument` (markers, volumes, paths). Live entities from `onInit` still render without it.

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

Viewport: click anything to select — editor gizmos hit directly, world geometry snaps to the nearest marker/volume — then TransformControls (W move / E rotate / R scale volume radius). Outliner groups by kind with ×N dedup rows; `N` cycles instances of the selected row. Assets tab places from game catalog.

## Core APIs (`editor/`)

- `@jgengine/core/editor/index` — document, session, commands, undo
- `@jgengine/core/editor/types` — markers, volumes, paths
- `@jgengine/core/editor/document` — normalize/merge/export
- `@jgengine/core/editor/commands` — `createEditorSession`
- `@jgengine/editor` — `EditorApp`, host RPC, bridge server (dev-only package)

## Do not

- Import `@jgengine/editor` from `GameHost` or game `main.tsx`
- Treat mesh modeling as in-scope (placement/world tools only)
