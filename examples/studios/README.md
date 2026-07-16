# @jgengine-examples/studios — build your own editor studio

Copyable proof that the jgengine editor is an **extension seam**, not a fixed tool. Each module here
turns the editor into a bespoke "studio" — a pole/wire tool, a bookcase generator — using **only
public APIs and one register call, with zero edits to any engine file**. Copy a module, swap the
schema and resolver, and you have a fence / streetlight / zipline / lamppost / crate studio.

There are two seams, matching the two ways content lives in a scene:

## 1. A scene kind — geometry authored as a path / volume / marker (`registerSceneKind`)

`poleLineStudio.ts` owns the `pole_line` path kind: poles sampled along the line, sagging cables
between them. The whole studio is:

```ts
import { registerSceneKind } from "@jgengine/core/scene/sceneKinds";
import { placeAlongPath } from "@jgengine/core/world/pathInstances"; // generic engine primitive
import { sagCurve } from "@jgengine/core/world/catenary";            // generic engine primitive

registerSceneKind({
  kind: "pole_line",
  target: "path",          // "path" | "volume" | "marker"
  label: "Pole line / cables",
  pathShape: "line",
  addCategory: "Studios",  // shows under "+ Add → Studios"
  schema: { fields: [       // the editor auto-generates the whole slider inspector from this
    { type: "range", key: "spacing", label: "spacing", min: 2, max: 40, step: 0.5, default: 8, unit: "m" },
    { type: "range", key: "wireCount", label: "wires", min: 0, max: 8, step: 1, default: 3 },
    { type: "seed", key: "seed", label: "seed", default: "" },
    // range | number | bool | select | color | text | seed | weightedList
  ] },
  resolve: (object, params, ctx) => {/* pure data → the renderer draws it */},
  note: (object, params) => `${/* live readout under the sliders */}`,
});
```

The paired runtime renderer (`poleLineRenderer.tsx`) registers with the shell seam — `AuthoredScene`
mounts it for every `pole_line` path automatically:

```ts
import { registerSceneKindRenderer } from "@jgengine/shell/scene/sceneKindRenderers";
registerSceneKindRenderer("pole_line", ({ objects, context }) => /* three.js render tree */);
```

Generic engine primitives you compose (never re-implement): `placeAlongPath` (instances-along-path),
`sagCurve` / `catenaryCurve` (cables), `readNamedSockets` (GLB attachment points).

## 2. A generator asset — a slider-driven prop placed as a marker (`registerAssetGenerator`)

`bookcaseStudio.ts` registers a bookcase generator: dimensions, shelves, book density, seed. A placed
instance stores only `{ assetId, ...params, seed }` in the scene; the geometry is re-resolved at
runtime, never baked.

```ts
import { registerAssetGenerator, partsBounds } from "@jgengine/core/scene/assetGenerator";
import { DEFAULT_FORWARD } from "@jgengine/core/scene/facing";
registerAssetGenerator({
  id: "bookcase",
  label: "Bookcase",
  schema: { fields: [/* same field types */] },
  generate: (params, seed) => ({ parts: [/* boxes */], bounds: partsBounds(parts), forward: DEFAULT_FORWARD }),
});
```

`AuthoredScene` renders any marker whose `meta.assetId` names a registered generator, and the editor
shows its slider inspector automatically. The engine registers the **building** generator the same
way (`packages/core/src/world/buildingGenerator.ts`) — proof the seam serves engine and third parties
identically.

`forward` (optional, default `[0, 0, 1]`) declares which way the generated parts face — build the
front toward +Z, or set a different axis when they don't. `StudioStage`'s `faceCamera` prop reads it
to auto-orient a product shot with zero hand-tuned `rotationY` — see `bookcaseStageDemo.tsx`.

## Wire it into a game

```ts
import { registerExampleStudios } from "@jgengine-examples/studios";
registerExampleStudios(); // once at startup — now "+ Add → Studios" lists them in the editor
```

## The rule

If adding a studio ever needs an engine-file edit, the seam is missing something — **fix the seam,
not the adopter** (`scripts/studioSeam.test.ts` enforces zero engine references to these modules).
