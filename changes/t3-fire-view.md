fire/ fuel from plants and terrain, a fire view with flames, smoke and scorch, and a fire demo

Closes #2741

### Added

- fire/ fuel from the world: crown fuel read from grown plants, canopy stands rasterized onto the fire grid, ground fuel and elevation sampled from terrain, and per-cell sun exposure for fuel moisture
- FireLandscapeView draws a fire landscape: scorch, char and ash overlay, flame billboards sized by flame length, and smoke drifting downwind
- a fire demo in apps/dev (?game=fire, ?t= pins the time)
- `FireLandscapeView` (`@jgengine/core/fire/FireLandscape.draw`): Draw a {@link FireLandscape}: a ground overlay of flaming, smouldering, charred and ashen cells, flame billboards as tall as each cell's flame length, and smoke puffs rising from burning cells and drifting downwind. Also `FireLandscapeViewProps`.
- `plantCanopyFuel` (`@jgengine/core/fire/fuelSources`): Read a grown plant's crown fuel without changing it: foliage mass is its leaf area (from `PlantGrowth.stats().leafAreaM2`) over the species' specific leaf area; fine branchwood is the skeleton segments thinner than `fineWoodRadiusM` times the species' wood density. Also `FireGridFrame`, `PlantCanopyFuel`, `rasterizeCanopyFuel`, `sampleFireGround`, `sunExposure`.
- `FireLandscape.originX` and `originZ` expose where the grid sits.
