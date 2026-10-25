### Added

- `buildRouteCourse` (`@jgengine/core/world/routeCourse`) lays a purpose-built course from `straight` and `turn` pieces with branches that leave and rejoin the main line, tagged hazard spans with timers, a leg-aware `clamp` wall, `checkpoints` for `raceTrack`, racing `line`s through chosen shortcuts, wall `edges` with junction openings and terrain `groundHeight`/`terrainProfiles` that ride the course's climb.
- `ocean({ palette: { deep, crest, foam, fresnel } })` recolors the whole water surface, not just the shallows, for liquids that are not sea water.

### Fixed

- Terrain `biomeBands` `sky` and `fog` now cross-fade in a game that also declares `lighting` with a directional sun; the shell dropped the bands whenever it derived the sun bearing from that light.
- A static sky's banded fog color now follows the band instead of being pinned to `sky.fog.color`.
