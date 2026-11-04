plant and tree tests that compared species to published forestry tables (Carmean height, FIA diameter, Tallo, Ek and Bechtold crown width, BAAD leaf per sapwood, Jenkins foliage mass, Reineke's thinning slope, USDA PLANTS heights, per-species fork and crown-shape bands); the species records from #2919 and #2921 are unchanged

### Changed

- every library species is checked for a valid record that grows finite, non-negative sizes and builds a mesh, open and in a stand

### Fixed

- the shrub fit reads its 3 to 30 stem limits from SHRUB_STEMS instead of its own copy

### Removed

- plant and tree tests that compared species to published forestry tables (Carmean height, FIA diameter, Tallo, Ek and Bechtold crown width, BAAD leaf per sapwood, Jenkins foliage mass, Reineke's thinning slope, USDA PLANTS heights, per-species fork and crown-shape bands); the species records from #2919 and #2921 are unchanged
- forestGrownCrownWidthM (@jgengine/core/plants/validation/crownAllometry), whose only user was a removed test
- `@jgengine/core/plants/validation/crownAllometry` no longer exports `forestGrownCrownWidthM`.
