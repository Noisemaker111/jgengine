### Migrate

- `useSceneObjects` (`@jgengine/react/hooks`) keeps one list identity across `move` and `rotate`, so a record's `position`/`rotationY` is what it was at the last render. Read the live placement with `ctx.scene.object.get(instanceId)` (a `useFrame` loop or a rAF-ticked HUD) when a mesh or readout must follow a moving object.

### Fixed

- `useSceneEntities` and `useSceneObjects` (`@jgengine/react/hooks`) keep one list identity while membership holds, instead of allocating a new array on every store write and comparing it with `Object.is`. A pose write no longer re-renders every HUD that reads them (30-entity roster: 0.066 ms/frame → 0; the whole loop 0.24 → 0.05 ms/frame), while a spawn, despawn, replace, place or remove still re-renders. Non-pose object writes (state, visual, animation, slots, catalog id) still re-render.
- `RevealHighlights` (`@jgengine/shell/vision`) drives its own per-frame refresh only while Dark Sight is enabled, so a disabled reveal overlay no longer re-renders (0.019 ms/frame → 0) and an enabled one still follows the origin and its targets.
