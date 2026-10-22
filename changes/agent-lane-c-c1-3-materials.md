### Added

- `MATERIAL_LIBRARY` (`@jgengine/assets/catalogs/materialLibrary`) names 56 PBR surfaces — wet asphalt, painted metal, stucco, brick, wood, foliage with cut-out coverage and sheen, glass, water, sand, concrete and more — each mapping a name to an ambientCG source, a world tile size in metres and a physical response. `libraryMaterialAsset("asphalt/wet")` returns the editable `MaterialAsset` those names resolve to, and `filterLibraryMaterials` backs pickers. `assets pull library` pulls every pinned map set.
- `TriplanarAssetMaterial` / `useTriplanarAssetMaterial` / `applyTriplanarProjection` (`@jgengine/shell/render/triplanarMaterial`) render a material asset from world position, so world geometry without a `uv` attribute still gets colour, normal, roughness and AO maps. Tile size is world metres; instanced meshes project in instanced space.
- The editor's Materials workspace browses the library by name and writes the chosen entry into the document's material assets.

### Fixed

- `extractMaterialMaps` and `buildMaterialCatalog` now recognise ambientCG's `_Opacity` map, so cut-out foliage and decal scans keep their coverage instead of rendering as solid cards.
