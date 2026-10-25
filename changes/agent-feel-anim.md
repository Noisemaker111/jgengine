### Added

- Rigged characters placed with `instanceId` now plant their feet on the ground (`ik: "auto"`) and turn their head toward the local player when they come within 7 m, from any angle in front of them (`@jgengine/shell/render/characterGlance`). Both skip characters more than 20 m from the camera, dead characters and the low graphics tier. `ik: "none"` turns both off for a model. Debug snapshots show `feet planted N · glancing N` under `render/characters`.
- Entity models with no `animation` set default to `"auto"`, so a catalog rig picks up its idle, walk and run clips without extra declaration.
