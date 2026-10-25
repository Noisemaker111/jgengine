### Added

- `createCityLayout`, `cityRoadSource`, `cityLots` and `tuneCityLayout` (`@jgengine/core/world/cityLayout`): one street and lot layout with US-city defaults (3.5 m lanes, 2.5 m sidewalks, 15 cm kerbs, zone setbacks 0-6 m, floor ranges, corner clearance, driveways). Every number is a live devtools slider; streets redraw through `environment({ roadSource })` and lots re-lay on change.
- `deriveBuildingLots({ crossClearance })` keeps lots further from roads they do not front.
- `road({ sidewalk: { kerb } })` sets the kerb height; default stays 14 cm.
- `ModelMaterialOverride.materials` limits an override to named materials.
- Scale-only `visual.scale` placements now draw the model scaled (and still batch), not only fallback boxes.
- Facade library materials `facade/brick-red|brick-grey|brick-brown|glass-blue|glass-mirror` (ambientCG Facade018A/019A/020A/001/005).
- Realistic model library (`@jgengine/assets/catalogs/modelLibrary`): 58 Poly Haven CC0 models by intent across nine genres, `findLibraryModel`, `libraryModel`, `libraryModelCredits`, known gaps, a `generated` origin for game-committed AI models, and `assets pull model:<name>` / `model-library` with md5 checks, 512 px textures, near/far LOD and meshopt compression.
