every game downloaded about 3.7 MB of shared engine code, so the site build failed its size budgets. Each game now downloads 2.3 to 2.8 MB, and the code shared by every game fell from about 3.7 MB to 1.75 MB.

Root cause: one generated index held every model pack, the shell resolved UI kits by name from a table of all kits, and the city and plant generators registered eagerly, so every game bundled all of them.

Engine seam: packages/assets/src/catalogs/build.ts, packages/assets/src/catalogs/starter.ts, packages/assets/src/credits.ts, packages/assets/src/generated/index.ts, packages/assets/src/generated/pack/kaykit-adventurers.ts, packages/assets/src/generated/pack/kaykit-city-builder.ts, packages/assets/src/generated/pack/kaykit-dungeon.ts, packages/assets/src/generated/pack/kaykit-forest.ts and 79 more

### Migrate

- buildCatalog takes packs: [kaykitDungeon, ...] imported from @jgengine/assets/generated/packs instead of sources: ["kaykit-dungeon", ...].
- defineGame's uiKit takes the kit object (import { inkKit } from "@jgengine/core/ui/kit/uiKitInk.view") instead of a name; resolveUiKit is removed.
- an editor or tool that needs every scene kind without a game scene calls registerAllSceneKinds() and registerAllSceneKindRenderers().

### Added

- `STARTER_MODEL_PACKS` (`@jgengine/assets`): The model packs behind the curated starter assets: the same packs, in order, as `STARTER_SOURCE_PACKS`. Also `AssetPack`, `generatedPacks`, `packExportName`.
- `STARTER_MODEL_PACKS` (`@jgengine/assets/catalogs/starter`): The model packs behind the curated starter assets: the same packs, in order, as `STARTER_SOURCE_PACKS`.
- `generatedPacks` (`@jgengine/assets/generated`): Every pulled pack.
- `kaykitAdventurers` (`@jgengine/assets/generated/pack/kaykit-adventurers`): ⚠ undocumented
- `kaykitCityBuilder` (`@jgengine/assets/generated/pack/kaykit-city-builder`): ⚠ undocumented
- `kaykitDungeon` (`@jgengine/assets/generated/pack/kaykit-dungeon`): ⚠ undocumented
- `kaykitForest` (`@jgengine/assets/generated/pack/kaykit-forest`): ⚠ undocumented
- `kaykitFurniture` (`@jgengine/assets/generated/pack/kaykit-furniture`): ⚠ undocumented
- `kaykitMedievalHexagon` (`@jgengine/assets/generated/pack/kaykit-medieval-hexagon`): ⚠ undocumented
- `kaykitSkeletons` (`@jgengine/assets/generated/pack/kaykit-skeletons`): ⚠ undocumented
- `kaykitSpaceBase` (`@jgengine/assets/generated/pack/kaykit-space-base`): ⚠ undocumented
- `quaternius5LowPolyAnimals` (`@jgengine/assets/generated/pack/quaternius-5-low-poly-animals`): ⚠ undocumented
- `quaterniusAnimatedAnimalesLowPoly` (`@jgengine/assets/generated/pack/quaternius-animated-animales-low-poly`): ⚠ undocumented
- `quaterniusAnimatedAnimals` (`@jgengine/assets/generated/pack/quaternius-animated-animals`): ⚠ undocumented
- `quaterniusAnimatedCharactersPack` (`@jgengine/assets/generated/pack/quaternius-animated-characters-pack`): ⚠ undocumented
- `quaterniusAnimatedDinosaurs` (`@jgengine/assets/generated/pack/quaternius-animated-dinosaurs`): ⚠ undocumented
- `quaterniusAnimatedFish` (`@jgengine/assets/generated/pack/quaternius-animated-fish`): ⚠ undocumented
- `quaterniusAnimatedHumanLowPoly` (`@jgengine/assets/generated/pack/quaternius-animated-human-low-poly`): ⚠ undocumented
- `quaterniusAnimatedLowpolyRobot` (`@jgengine/assets/generated/pack/quaternius-animated-lowpoly-robot`): ⚠ undocumented
- `quaterniusAnimatedMechPack` (`@jgengine/assets/generated/pack/quaternius-animated-mech-pack`): ⚠ undocumented
- `quaterniusFantasyLowPolyTreesAndBushes` (`@jgengine/assets/generated/pack/quaternius-fantasy-low-poly-trees-and-bushes`): ⚠ undocumented
- `quaterniusFantasyProps` (`@jgengine/assets/generated/pack/quaternius-fantasy-props`): ⚠ undocumented
- `quaterniusFurnitureLowPoly` (`@jgengine/assets/generated/pack/quaternius-furniture-low-poly`): ⚠ undocumented
- `quaterniusLowPolyAnimatedGuns` (`@jgengine/assets/generated/pack/quaternius-low-poly-animated-guns`): ⚠ undocumented
- `quaterniusLowPolyCars0` (`@jgengine/assets/generated/pack/quaternius-low-poly-cars-0`): ⚠ undocumented
- `quaterniusLowPolyDesertAssets` (`@jgengine/assets/generated/pack/quaternius-low-poly-desert-assets`): ⚠ undocumented
- `quaterniusLowPolyFoodPack` (`@jgengine/assets/generated/pack/quaternius-low-poly-food-pack`): ⚠ undocumented
- `quaterniusLowPolyFurniture1` (`@jgengine/assets/generated/pack/quaternius-low-poly-furniture-1`): ⚠ undocumented
- `quaterniusLowPolyGuns` (`@jgengine/assets/generated/pack/quaternius-low-poly-guns`): ⚠ undocumented
- `quaterniusLowPolyGunsPack` (`@jgengine/assets/generated/pack/quaternius-low-poly-guns-pack`): ⚠ undocumented
- `quaterniusLowPolyMedievalWeapons` (`@jgengine/assets/generated/pack/quaternius-low-poly-medieval-weapons`): ⚠ undocumented
- `quaterniusLowPolyNaturePack1` (`@jgengine/assets/generated/pack/quaternius-low-poly-nature-pack-1`): ⚠ undocumented
- `quaterniusLowPolyPiratePack` (`@jgengine/assets/generated/pack/quaternius-low-poly-pirate-pack`): ⚠ undocumented
- `quaterniusLowPolyRpgPack` (`@jgengine/assets/generated/pack/quaternius-low-poly-rpg-pack`): ⚠ undocumented
- `quaterniusLowPolySpaceAssets` (`@jgengine/assets/generated/pack/quaternius-low-poly-space-assets`): ⚠ undocumented
- `quaterniusLowpolyAnimatedFarmAnimalPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-animated-farm-animal-pack`): ⚠ undocumented
- `quaterniusLowpolyAnimatedKnight` (`@jgengine/assets/generated/pack/quaternius-lowpoly-animated-knight`): ⚠ undocumented
- `quaterniusLowpolyAnimatedMonsters` (`@jgengine/assets/generated/pack/quaternius-lowpoly-animated-monsters`): ⚠ undocumented
- `quaterniusLowpolyBuildings` (`@jgengine/assets/generated/pack/quaternius-lowpoly-buildings`): ⚠ undocumented
- `quaterniusLowpolyBuildingsPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-buildings-pack`): ⚠ undocumented
- `quaterniusLowpolyCars` (`@jgengine/assets/generated/pack/quaternius-lowpoly-cars`): ⚠ undocumented
- `quaterniusLowpolyCropsPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-crops-pack`): ⚠ undocumented
- `quaterniusLowpolyHouseInteriorPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-house-interior-pack`): ⚠ undocumented
- `quaterniusLowpolyMedievalBuildings` (`@jgengine/assets/generated/pack/quaternius-lowpoly-medieval-buildings`): ⚠ undocumented
- `quaterniusLowpolyMedievalVillagePack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-medieval-village-pack`): ⚠ undocumented
- `quaterniusLowpolyMedievalWeapons` (`@jgengine/assets/generated/pack/quaternius-lowpoly-medieval-weapons`): ⚠ undocumented
- `quaterniusLowpolyModularDungeonPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-modular-dungeon-pack`): ⚠ undocumented
- `quaterniusLowpolyModularSciFiEnvironments` (`@jgengine/assets/generated/pack/quaternius-lowpoly-modular-sci-fi-environments`): ⚠ undocumented
- `quaterniusLowpolyModularStreetPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-modular-street-pack`): ⚠ undocumented
- `quaterniusLowpolyNaturePack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-nature-pack`): ⚠ undocumented
- `quaterniusLowpolyPosedHumans` (`@jgengine/assets/generated/pack/quaternius-lowpoly-posed-humans`): ⚠ undocumented
- `quaterniusLowpolyPublicTransport` (`@jgengine/assets/generated/pack/quaternius-lowpoly-public-transport`): ⚠ undocumented
- `quaterniusLowpolyRpg` (`@jgengine/assets/generated/pack/quaternius-lowpoly-rpg`): ⚠ undocumented
- `quaterniusLowpolyRpgCharacters` (`@jgengine/assets/generated/pack/quaternius-lowpoly-rpg-characters`): ⚠ undocumented
- `quaterniusLowpolyShipPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-ship-pack`): ⚠ undocumented
- `quaterniusLowpolySpaceshipsPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-spaceships-pack`): ⚠ undocumented
- `quaterniusLowpolySteampunkTurrets` (`@jgengine/assets/generated/pack/quaternius-lowpoly-steampunk-turrets`): ⚠ undocumented
- `quaterniusLowpolySurvivalPack` (`@jgengine/assets/generated/pack/quaternius-lowpoly-survival-pack`): ⚠ undocumented
- `quaterniusLowpolyTexturedTrees` (`@jgengine/assets/generated/pack/quaternius-lowpoly-textured-trees`): ⚠ undocumented
- `quaterniusMedievalVillage` (`@jgengine/assets/generated/pack/quaternius-medieval-village`): ⚠ undocumented
- `quaterniusModularMen` (`@jgengine/assets/generated/pack/quaternius-modular-men`): ⚠ undocumented
- `quaterniusModularScifi` (`@jgengine/assets/generated/pack/quaternius-modular-scifi`): ⚠ undocumented
- `quaterniusModularWomen` (`@jgengine/assets/generated/pack/quaternius-modular-women`): ⚠ undocumented
- `quaterniusStylizedNature` (`@jgengine/assets/generated/pack/quaternius-stylized-nature`): ⚠ undocumented
- `quaterniusTexturedCuteMonsterPack` (`@jgengine/assets/generated/pack/quaternius-textured-cute-monster-pack`): ⚠ undocumented
- `quaterniusToonShooter` (`@jgengine/assets/generated/pack/quaternius-toon-shooter`): ⚠ undocumented
- `kaykitAdventurers` (`@jgengine/assets/generated/packs`): ⚠ undocumented Also `kaykitCityBuilder`, `kaykitDungeon`, `kaykitForest`, `kaykitFurniture`, `kaykitMedievalHexagon`, `kaykitSkeletons`, `kaykitSpaceBase`, `quaternius5LowPolyAnimals` and 54 more.
- `writeIndexBarrels` (`@jgengine/assets/indexGen`): Writes the generated pack modules and the barrel over every `<source>.json` already in `outDir`.
- `packExportName` (`@jgengine/assets/manifest`): The name a pack is exported under in `generated/packs`: its source id in camelCase (`kaykit-dungeon` → `kaykitDungeon`). Also `AssetPack`.
- `OnDemandSceneKindId` (`@jgengine/core/scene/onDemandSceneKinds`): A heavy built-in system a scene loads only when it uses one of its kinds or generators. Also `SceneKindNeeds`.

### Fixed

- every game downloaded about 3.7 MB of shared engine code, so the site build failed its size budgets. Each game now downloads 2.3 to 2.8 MB, and the code shared by every game fell from about 3.7 MB to 1.75 MB.
- a game bundles only the 3D model packs it names, only its own UI kit, and procedural cities and grown plants only when its scene uses them.
- download size is checked before merge (bun run check site-bundles in CI's web-build job): the shared engine once, against apps/dev/bundle-budget.json, and each game's own part against bundleKb, with the reason in bundleBaseline. The release's site check now checks only assets.

### Removed

- `@jgengine/core/ui/kit/uiKits.view` no longer exports `resolveUiKit`.
- `@jgengine/react` no longer exports `resolveUiKit`.
