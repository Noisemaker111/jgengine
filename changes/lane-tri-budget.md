### Added

- `attributeTriangles` (`@jgengine/shell/render/triangleAttribution`) sums a scene's triangles by model and geometry with instance counts, and the devtools render probe publishes it as `probes["render/triangles"]` and the `render/triangles` system probe, so `debug_snapshot` names the object behind a heavy frame instead of only counting it. Harbor Heat read 1,021,671 triangles from 840 objects: the 640 m terrain at 300 segments (180,000), the `TwistedTree_2` foliage species (137,010 over 15 trees) and 93 instances of a 1,280-triangle NPC model.
