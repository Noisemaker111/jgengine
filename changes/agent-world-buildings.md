### Migrate

- Buildings, cities and placement each live in one folder per layer. Update deep imports:
  - `@jgengine/core/world/{buildings,buildingGenerator,buildingIndex,buildingKit,buildingLots,massing}` → `@jgengine/core/buildings/…`; `@jgengine/shell/structures/{GeneratedBuilding,BuildingKitBatch,BuildingRenderBudget,buildingKitFit,buildingKitMaterials,buildingKitRegistry,buildingSpatialBatch,buildingSurface}` → `@jgengine/shell/buildings/…`. The `@jgengine/shell/structures` barrel is now `@jgengine/shell/buildings`.
  - `@jgengine/core/world/{cityBlocks,cityContent,cityGenerator,cityKind,cityLayout}` → `@jgengine/core/city/…`; `@jgengine/shell/scene/{CityRenderer,cityJunctionSurface,cityWindowMaterial}` → `@jgengine/shell/city/…`.
  - `@jgengine/core/world/{place,placeAsset,placement,placementController,placedStructureStore}` → `@jgengine/core/placement/…`; `PlacementGhost` and `TransformGizmo` → `@jgengine/shell/placement/…` (barrel `@jgengine/shell/placement`).
- Building part types have one definition, in `@jgengine/core/buildings/buildings`: the shell no longer exports its own `BuildingFacade`, `BuildingPartKind` or `BuildingPartPlacement`. Removed the shell `GeneratedBuilding` component, which nothing used (render buildings with `InstancedBuildings`); `GeneratedBuilding` now names only the core data.
- `CityLot` / `CityDriveway` in `cityLayout` are now `CityLayoutLot` / `CityLayoutDriveway`; `CityLot` and `CityDriveway` name the `city` scene kind's types.
