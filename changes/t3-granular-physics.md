a discrete element reference for sand and gravel (physics/reference/discreteElements.ts): spheres and clumps, Hertz–Mindlin contacts, rolling resistance and capillary cohesion; deterministic, with snapshot and restore

### Added

- a discrete element reference for sand and gravel (physics/reference/discreteElements.ts): spheres and clumps, Hertz–Mindlin contacts, rolling resistance and capillary cohesion; deterministic, with snapshot and restore
- experiments that check it against published values: restitution, dry and damp angle of repose, Janssen silo saturation, Beverloo hopper discharge and the Brazil-nut effect
- `DEM_GLASS_BEADS` (`@jgengine/core/physics/reference/discreteElementExperiments`): Soda-lime glass beads: restitution 0.97 and friction 0.092 measured by Foerster, Louge, Chang & Allia (1994). Also `DEM_SAND`, `DEM_STEEL`, `HopperOptions`, `HopperResult`, `JanssenFit`, `PouredConeOptions`, `PouredConeResult`, `ShakerOptions` and 13 more.
- `bridgeRuptureDistance` (`@jgengine/core/physics/reference/discreteElements`): Gap at which a bridge breaks (Lian et al. Also `DemBodySpec`, `DemInteraction`, `DemLiquid`, `DemMaterial`, `DemSnapshot`, `DemSphereSpec`, `DemStepReport`, `DemWallMotion` and 8 more.

### Changed

- Part of #2768
