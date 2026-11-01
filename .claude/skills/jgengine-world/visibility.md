# Visibility & Streaming

Automatic camera-frustum culling, distance culling, spatial partitioning, and asset streaming
for every game — no per-game setup. A normal object with a position and a version counter is
culled automatically; you only touch this system to *override* the defaults.

This package (`@jgengine/core/visibility/*`) is headless and zero-dependency. The shell wires it
into the R3F render path (`packages/core/src/visibility/CullingProvider.draw.tsx`), which reads the
live camera each frame and toggles `group.visible` so off-screen objects are never submitted to
the renderer.

## What happens automatically

- **Frustum culling** — objects fully outside the active camera's view are not rendered. Uses
  object bounds (sphere + AABB), not origins. Works for 3D perspective and 2D orthographic cameras.
- **Distance culling** — objects past a max render distance are dropped (square-root-free). The
  default max is `Infinity`, so nothing is culled by distance until a game opts in.
- **Spatial partitioning** — a uniform 3D hash (`SpatialIndex`); the renderer queries potentially
  visible objects near the frustum instead of scanning the whole scene. Moving objects rewrite only
  the cells that changed; static objects are inserted once.
- **Bounds caching** — bounds recompute only when an object's `version` advances (transform,
  geometry, or override change), reusing the cached object so steady-state frames allocate nothing.
  The shell tracks each live entity/object separately, invalidates placed-object bounds when visual
  scale changes, and drops tracking entries after removal. `alwaysVisible` overrides stay attached
  to their own rows even when several rows bypass culling in one frame.

Every game improves immediately after upgrading, because defaults favor visual stability: a preload
margin larger than the view, hysteresis so objects don't flicker at the boundary, and a large
default render distance.

## Defaults

| Setting | Default | Why |
| --- | --- | --- |
| `preloadMargin` (culling) | 24 world units | Preload/consider region beyond the visible frustum |
| `hysteresis` | 2 world units | Re-test band for already-visible objects (no flicker) |
| `defaultMaxRenderDistance` | `Infinity` | Never distance-cull unless a game opts in |
| `occlusionCulling` | `false` | Off: the stage is fed no occluders yet, so it cannot hide anything |
| `hlod` | unset | Far static cells keep drawing their props unless a game sets `{ distance, hysteresis, cluster }` |
| `meshLods` | unset | Props and scatter draw their source mesh unless a game sets `{ screenSizes, hysteresis?, impostorDistance? }` |
| streaming `preloadMargin` | 32 | Assets load ahead of visibility |
| `unloadGraceSeconds` | 10 | Grace period before an idle asset is unloaded |
| `maxLoadsPerFrame` / `maxUnloadsPerFrame` | 4 / 2 | Per-frame budgets to avoid spikes |
| `maxConcurrentLoads` | 4 | Unresolved loads, including cancelled work |
| `maxResidentBytes` | `Infinity` | Optional known resident-byte target |
| `residentEvictionOrder` | `oldest` | Budget-pressure eviction; `largest` releases largest assets first |
| `keepResidentBytes` | 64 KiB | Small shared assets survive idle eviction; byte pressure overrides this |

## How to opt out / override

Set `PlayableGame.visibility`:

```ts
visibility: {
  enabled: false,                          // disable render culling entirely
  culling: { defaultMaxRenderDistance: 200 },
  scene: { preloadMargin: 60 },            // scene-wide override
  entities: { boss: { alwaysVisible: true } },   // by entity kind
  objects:  { beacon: { neverUnload: true } },   // by object catalog id
  hlod: { distance: 350, hysteresis: 40, cluster: 1.5 }, // far 128 m cells draw one merged proxy
  meshLods: { screenSizes: [0.2, 0.07], hysteresis: 0.1, impostorDistance: 120 }, // built levels by size on screen
}
```

## Built mesh levels and impostors

`bun run games:provision build <game>` reads the game's `jgengine.json` `assetBuild` and writes, beside
each named model file, `<file>.lods/`: simplified levels (`lod1.glb`, ...; geometry only, the runtime
reuses the source's materials and maps), an optional baked impostor atlas, and `meta.json`. It also
encodes the KTX2 texture twins. Every step is cached by content; at most 4 workers.

```json
"assetBuild": {
  "lods": { "include": ["models/library/nature/*/near.gltf"], "levels": [{ "ratio": 0.4, "error": 0.01 }, { "ratio": 0.12, "error": 0.03 }] },
  "impostors": { "include": ["models/library/nature/jacaranda/near.gltf"], "frames": 8, "cell": 128 }
}
```

At runtime `visibility.meshLods.screenSizes` gives one share of the viewport height per built level:
a level takes over once the model's bounding sphere spans less than it. Static props switch per
placement (per unit of placement scale), scatter switches per chunk. Past `impostorDistance` a model
with a baked atlas draws one card per placement in a shared instanced draw. A model overrides any
field with `ModelConfig.meshLods`, or turns it off with `meshLods: false`. A model with no built files
draws as before, so a checkout that never ran the build is unchanged.

Built files of a committed model (`public/models/imported/`) are committed beside it; built files of a
store-provisioned model (library scans, packs) live in the asset store and come from the build.

Far HLOD proxies hold one level per model: its coarsest mesh level. A model drawn as impostor cards
adds nothing to the proxy and keeps its cards in far cells.

Override precedence (earlier wins): **per-object → per-layer → per-scene → global**. Available
controls: `alwaysVisible`, `neverUnload`, `minRenderDistance`, `maxRenderDistance`, `preloadMargin`,
`cullingDisabled`, `streamingDisabled`, `classification` (`static`/`dynamic`), `bounds` (custom),
`customVisibility` (callback), `pinned`.

## Override object bounds

Pass a `bounds` override — `sphere`, `aabb`, `rect` (2D), or `point`, each with an optional `offset`:

```ts
entities: { tower: { bounds: { kind: "aabb", half: [2, 8, 2], offset: [0, 8, 0] } } }
```

## Pin assets

An asset is never auto-unloaded when it is `pinned`, retained (shared by an active object), or
required by the current scene. `AssetStreamingSystem.pin(id)` / `retain(id)` from game code; or set
`neverUnload` / `pinned` on the object override so its assets stay resident.

## Resident memory and history

`createAssetStreamingSystem({ settings: { maxResidentBytes: 256 * 1024 * 1024 }, load, unload })`
opts into byte-pressure eviction. Supply approximate CPU/GPU resident bytes from `load`, not file
sizes. `retune` changes the byte target and `residentEvictionOrder` during play. `oldest` evicts
least recently active assets; `largest` evicts by size, then activity; both break ties by asset id.

Each tick spends `maxUnloadsPerFrame` on pressure eviction before idle eviction. Pressure bypasses
`unloadGraceSeconds` and `keepResidentBytes`, but never pins or references. This is a convergence
target, not a hard allocation ceiling: loads complete between ticks, protected assets may exceed
the target, and missing/invalid sizes count as zero. `stats()` exposes `overBudgetBytes`,
`protectedBytes`, `unknownSizeLoaded`, and cumulative `budgetEvicted`. Retain currently used
resources; refreshing activity only affects eviction order under pressure.

Unloaded and failed records remain queryable by default. After releasing ownership and cancelling
demand, call `forget(id)` to discard inactive history. It refuses loaded, queued, unresolved,
pinned, or retained assets, including cancelled loads until settlement. Successful forgetting
makes `stateOf`/`record` return `undefined`; previously held records become detached, and future
requests create fresh records. Call it after eviction/cancellation settlement in a caller-owned
cleanup pass to bound history; `stats().records` measures it. Eviction scans resident records only.

## Multiple cameras

The `VisibilitySystem` unions visibility across every active `CameraVisibilityContext` — split-screen,
render-to-texture, editor, and minimap cameras all keep an object renderable if any of them needs it.
A camera can set `influencesStreaming: false` to stay out of asset preloading (e.g. a minimap that
only needs positions), or `cullingDisabled: true` to render everything.

## Render culling vs asset streaming vs simulation culling

- **Render culling** decides what is *drawn*. It never destroys entities or disables simulation.
- **Asset streaming** decides what is *loaded*. An object may be loaded but not rendered, or inside
  the preload region but outside the render region.
- **Simulation culling** (`createSimulationCuller`, opt-in, off by default) decides whether a
  low-priority off-screen entity *updates* this tick. It never throttles a protected entity
  (physics/network/audio/scripted/active). Gameplay correctness must not depend on visibility.

## Diagnostics

`VisibilitySystem.stats()` reports total objects, considered/rejected counts (frustum, distance,
occlusion), draw calls avoided, asset queue/loading/loaded/unloaded counts, streamed bytes, and
spatial-query / culling timings. `debugSnapshot()` returns camera frustum corners, object bounds,
spatial partitions, culled ids, and streaming state for a debug overlay to draw.

## Architecture

`BoundsCache` · `SpatialIndex` · `frustum` (view volumes) · `distance` · `OcclusionTester` ·
`CullingSettings`/`StreamingSettings` (+ layered `resolveOverrides`) · `CameraVisibilityContext` ·
`VisibilitySystem` (orchestrator + debug snapshot) · `AssetStreamingSystem` · `SimulationCuller`.

## Known limitations

- **Occlusion culling** ships as an interface plus a conservative bounding-volume tester, disabled
  by default. It is not a hierarchical-Z implementation; enable only where large blockers exist.
- **Instanced batches** in the shell (`world/Instanced*`, `SpriteBatch`) set `frustumCulled={false}`
  and are not yet per-instance culled by this system — a documented future extension.
- **Asset-streaming shell wiring**: the engine `AssetStreamingSystem` is complete and tested, but the
  shell's R3F loaders still load on mount; wiring streaming into R3F suspension is the next seam.
- The spatial index partitions on all three axes; extremely oversized objects fall back to an
  always-considered bucket by design.
