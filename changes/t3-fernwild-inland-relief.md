survey terrain reads hills outlines (rolling hills with plains between them), cliff lines (one side raised across a steep face) and an erosion meta on peaks and ridges that cuts gullies into them

Root cause: the grass mat called the island's full height function six times per vertex, about 450k calls across eight fields in one frame

Refs #2687

Engine seam: packages/core/src/grass/GrassCover.draw.tsx, packages/core/src/grass/GrassFieldRenderer.draw.tsx, packages/core/src/grass/grassBake.draw.ts, packages/core/src/grass/grassCoverGeometry.draw.ts, packages/core/src/terrain/surveyTerrain.ts, packages/core/src/world/geometry.ts

### Added

- survey terrain reads hills outlines (rolling hills with plains between them), cliff lines (one side raised across a steep face) and an erosion meta on peaks and ridges that cuts gullies into them
- `SurveyCliff` (`@jgengine/core/terrain/surveyTerrain`): A cliff along a line: one side stands `height` higher, across a face `face` metres wide. Also `SurveyHills`.

### Changed

- Fernwild's inland rolls: hills through the jungle, plains, eastern forest, redwoods and highlands, five cliff lines, and gullied mountains instead of smooth cones
- Fernwild has waist-high grass inland: green grass with straw tips and broad leaves through the jungle and plains, as in ARK

### Fixed

- a grass field's ground mat samples the ground once per vertex instead of six times, and tests only the clearance masks that reach it, so large grass fields no longer freeze the click into play
