### Migrate

- World health bars and nameplates now hide behind blocking world geometry by default. Use `occlude: false` for intentional reveal overlays; distance is measured from the render camera. Nameplates suppress machine identifiers unless an explicit `resolveName` supplies a display label.

### Fixed

- World overlays use camera-to-anchor visibility through the shared object/wall/terrain query, hide depleted health and invisible entities, and bound nearby sampling and occlusion rays per refresh.
