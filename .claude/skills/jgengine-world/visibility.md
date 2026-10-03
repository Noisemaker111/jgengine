# Visibility & Streaming

Automatic camera-frustum culling, distance culling, spatial partitioning, and asset streaming
for every game — no per-game setup. A normal object with a position and a version counter is
culled automatically; you only touch this system to *override* the defaults.

This package (`@jgengine/core/visibility/*`) is headless and zero-dependency. The shell wires it
into the R3F render path (`packages/shell/src/visibility/CullingProvider.tsx`), which reads the
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
| `occlusionCulling` | `false` | Off until proven reliable for the renderer |
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
}
```

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
