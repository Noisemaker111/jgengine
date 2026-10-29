palms and ferns grow from the plant simulator: coconut, cabbage palm, Hawaiian tree fern, bracken and western sword fern, fitted to USDA PLANTS heights.

Engine seam: packages/core/src/nature/natureGenerators.ts, packages/core/src/nature/natureMesh.draw.ts, packages/core/src/nature/natureMesh.ts, packages/core/src/plants/cache/plantCodec.ts, packages/core/src/plants/growth/pipeModel.ts, packages/core/src/plants/growth/plantGrowth.ts, packages/core/src/plants/mesh/plantLeafAtlas.ts, packages/core/src/plants/mesh/plantMesh.ts and 15 more

### Added

- palms and ferns grow from the plant simulator: coconut, cabbage palm, Hawaiian tree fern, bracken and western sword fern, fitted to USDA PLANTS heights.
- frond and fan leaf shapes draw one arched, folded leaf per node; fronds rise when young and droop as they age.
- growth.frondEstablishmentYears grows a young palm's fronds to full size over its first years.
- `CIBOTIUM_GLAUCUM` (`@jgengine/core/plants/species/data/cibotiumGlaucum`): Hawaiian tree fern.
- `COCOS_NUCIFERA` (`@jgengine/core/plants/species/data/cocosNucifera`): Coconut palm.
- `POLYSTICHUM_MUNITUM` (`@jgengine/core/plants/species/data/polystichumMunitum`): Western sword fern.
- `PTERIDIUM_AQUILINUM` (`@jgengine/core/plants/species/data/pteridiumAquilinum`): Bracken.
- `SABAL_PALMETTO` (`@jgengine/core/plants/species/data/sabalPalmetto`): Cabbage palm.
- `habitHeightAt20M` (`@jgengine/core/plants/species/habitReference`): Height a habit species should reach by 20 years: PLANTS' 20-year height, or its mature height for a fern or herb that is full grown within a few years. Also `habitHeightCeilingM`.
- `isFrondShape` (`@jgengine/core/plants/structure/frondPose`): Whether a leaf shape is a frond (pinnate palm and fern leaves) or a fan (palmate palm leaves): one large leaf per metamer, drawn as an arched blade rather than a card. Also `FrondPose`.

### Changed

- Part of #2699

### Fixed

- palm and fern stems no longer widen after they form, since they have no cambium; a palm keeps its crown to old age.

### Removed

- the procedural palm and fern nature generators; Fernwild now places the grown species.
- `@jgengine/core/nature/natureGenerators` no longer exports `FERN_GENERATOR`, `FERN_SCHEMA`, `PALM_GENERATOR`, `PALM_SCHEMA`.
- `@jgengine/core/nature/natureMesh` no longer exports `FrondOptions`, `addFrond`.
- `@jgengine/core/world` no longer exports `FERN_GENERATOR`, `FERN_SCHEMA`, `FrondOptions`, `PALM_GENERATOR`, `PALM_SCHEMA`, `addFrond`.
