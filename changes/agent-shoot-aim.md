### Fixed

- Shots in chase, orbit, top-down, RTS and side-view games now aim at what is under the cursor (tested against the collision world, 0.5-2 ms per shot instead of a 40 ms full-scene raycast); first-person, shoulder and pointer-locked play keep the crosshair. `pointer.aim` still overrides.
- Tracers start at the shooter's gun hand (or a `muzzle` node) instead of the body centre, and at the first-person gun in first person. Tracers last 200 ms and are thicker so they read.

### Added

- `registerEntityMuzzle` / `readEntityMuzzle` (`@jgengine/shell` render): say where an entity's shots visibly leave from; rigged characters register their right hand automatically.
