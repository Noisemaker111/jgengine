### Added

- `planInteriorDressing` (`@jgengine/core/world/interiorDressing`) plans more of a lived-in interior: `density` scales clutter, decals, debris and cables together; `panels` breaks long walls with wainscot plates and access hatches (`plan.panels`); `debris` places small-prop slots along walls, in inside corners and in the open (`plan.debris`, `InteriorDebrisSlot`); `cables.floor` drops some cables from the ceiling to run along the foot of the wall; `fixtures.dead` and `fixtures.flicker` give lamps a `state`; `decals.paper` and `decals.scorch` add dropped paperwork and soot; a `keepClear` entry with `mark: true` gets hazard stripes on the floor. Existing pipes, trims, fittings, clutter and lamps are unchanged for the same seed.
- `DECAL_STYLES` gains `paper`, `scorch` and `hazard`, with procedural textures.
- `InteriorDressing` draws panels and hatches and gives dead lamps an unlit lens (`lensOff`, `panel` and `hatch` surfaces); `PracticalLights` skips dead lamps and flickers flickering ones.
- `AtmosphereConfig.beams` (0..1, default 0): a spot light's haze glow reaches down its cone as a visible beam.
- Twenty Poly Haven CC0 industrial and office props in the model library (`industrial/tool-cart`, `industrial/cardboard-box`, `office/metal-desk`, `office/crt-television` and others).

### Fixed

- Instanced scatter draws a model exported with morph targets at its rest shape instead of throwing in three's renderer.
- The haze lamp glow rescans at once when a lamp leaves the scene, so a swapped light pool glows on its first frame instead of up to 90 frames later.
