### Added

- `road({ materials: { road, sidewalk, curb } })` takes scanned PBR surfaces per layer, e.g. `{ road: librarySurfaceScan("asphalt/dry"), sidewalk: librarySurfaceScan("concrete/smooth", { tint: 0 }) }`. The carriageway and its welded junctions tile one world-XZ scan with a second rotated sample against visible repeats; sidewalks and gutters tile along the kerb. Colour (or, at `tint` 0, grain over the authored colour), roughness around the authored value, the scan's normal map and AO all land; the tyre wear, patching and edge grime still layer on top. A map that fails to load, or the `low` tier, keeps the procedural surface.
- `material.scan` on any model override (`ModelMaterialOverride.scan`): a scanned surface projected triplanar from the model's own geometry in metres, so a kit model whose UVs only address a palette atlas takes real plaster, concrete or wood grain. `tint` 0 keeps the model's colours. Works on entity models, scattered and static-batched props; off on the `low` tier and until the maps load.
- `librarySurfaceScan(name, options)` (`@jgengine/assets/catalogs/materialLibrary`) names a library scan for terrain, roads or models; `libraryTerrainMaterial` is now this.
- Library finishes `paint/gloss` (lacquered car paint: clearcoat 1 over a soft base) and `paint/satin`, response-only: `material: { ...librarySurfaceParameters("paint/gloss"), color }`.
- `road({ sidewalk: { slabs } })`: paving slab length in metres (default 1.5), `false` for none.
- The dev runner ships ambientCG `Asphalt003` and `Concrete006` (CC0) beside the existing packs.

### Changed

- Every `road()` sidewalk is now raised on a real 14 cm kerb with a vertical kerb face and an outer skirt (it was a 4 cm lip that read as paint on the road), and is laid in slabs whose joints run square to the kerb, each slab its own tone. Matches the generated city's kerb step.
- The gutter strip is poured concrete between kerb and asphalt (a dusty shoulder with no sidewalk), 35–60 cm wide, never darker than the road. It was a half-metre band at 45% of the road's brightness: a cartoon outline along every street.
- Lane dashes, stop lines and crosswalks are worn paint: 15–30 cm wide (dashes were 3.5% of the road width, half a metre on an avenue), taking the asphalt's grain and wearing through to it in polished patches.
- The procedural pavement's crack network is sparse hairlines that wander, instead of a 3 m Voronoi grid of 9 cm lines drawn over every road and sidewalk.
