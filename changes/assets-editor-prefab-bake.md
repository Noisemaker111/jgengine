### Added

- Editor prefabs retain validated static bake settings with local collision solids and named clearance volumes; `set_prefab_static_bake` supports atomic authoring, persistence and undo/redo.
- `@jgengine/assets/staticPrefabBake` exports pinned static prefab source models with preserved transforms, materials, reachable textures and provenance, plus deterministic budgets and collision metadata.
- Catalog models and extras support `anchor: "origin"`, preserving composed asset coordinates through shared rendering and collider resolution. Unmapped objects use the same catalog lookup in both paths, allowing origin-only game rendering maps to be removed.
