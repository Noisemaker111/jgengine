small scatter species (shrubs, ferns, rocks) pick a detail level per plant by its own distance instead of per 200 m chunk, and stop drawing past their draw distance one plant at a time

### Added

- generator-grown scatter species bake the generator's coarser levels and switch to them by size on screen through visibility.meshLods (Fernwild 28M to 12.5M triangles a frame)

### Fixed

- small scatter species (shrubs, ferns, rocks) pick a detail level per plant by its own distance instead of per 200 m chunk, and stop drawing past their draw distance one plant at a time
- a scatter field keeps a mesh in the scene only while it has plants to draw; Fernwild kept about 11,900 empty meshes that three walked on every render (scene 13,315 to 4,817 nodes)
- the small-shadow cull stops watching a node once it leaves the scene, so meshes added and dropped as the camera moves are not held for the whole session
- verify:fast type-checks every package, app and game whose program imports a changed engine file, as CI's types job does; it checked only the games, so an engine change the shell's stricter settings reject passed locally and failed in CI
