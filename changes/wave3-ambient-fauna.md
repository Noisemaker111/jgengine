ambient fauna groups for fish schools, insects and motes, and large flyers, built from flock, motion and spawn parts, instanced, authored as editor zones; Fernwild adopts them

Engine seam: packages/core/src/ai/flock.ts, packages/core/src/ambientFauna/AmbientFauna.draw.tsx, packages/core/src/ambientFauna/ambientFauna.ts, packages/core/src/ambientFauna/ambientFaunaConfig.ts, packages/core/src/ambientFauna/ambientFaunaKind.ts, packages/core/src/ambientFauna/faunaCull.ts, packages/core/src/render/ambientLife.ts, packages/core/src/scene/builtinSceneKinds.ts and 1 more

### Added

- ambient fauna groups for fish schools, insects and motes, and large flyers, built from flock, motion and spawn parts, instanced, authored as editor zones; Fernwild adopts them
- `FLOCK_MAX_NEIGHBORS` (`@jgengine/core/ai/flock`): Flockmates one agent considers per step in {@link createFlockStepper} unless `maxNeighbors` says otherwise. Also `FlockBuffers`, `FlockStepper`, `FlockStepperState`.
- `FAUNA_GLOBAL_CAP` (`@jgengine/core/ambientFauna/ambientFauna`): Default of {@link AmbientFaunaOptions.globalCap}. Also `AmbientFaunaOptions`, `AmbientFaunaState`, `FAUNA_GROUP_LIMIT`, `FaunaArea`, `FaunaFrame`, `FaunaGroup`, `FaunaGroupState`, `FaunaMotion` and 5 more.
- `AmbientFauna` (`@jgengine/core/ambientFauna/AmbientFauna.draw`): Ambient fauna: fish schools, insect swarms, drifting motes and soaring flyers, one instanced draw per species part. Also `AmbientFaunaProps`.
- `AmbientFaunaConfig` (`@jgengine/core/ambientFauna/ambientFaunaConfig`): Turn ambient fauna on: the species table plus how groups see the world. Also `FaunaSpecies`.
- `AMBIENT_FAUNA_KIND` (`@jgengine/core/ambientFauna/ambientFaunaKind`): The editor volume kind that places an ambient group: its footprint is the area, or it borrows the footprint of another volume (a water volume for a school, a grass field for a swarm). Also `AMBIENT_FAUNA_SCHEMA`, `faunaGroupsFromVolumes`.
- `FaunaSelection` (`@jgengine/core/ambientFauna/faunaCull`): How many agents {@link selectVisible} put in each LOD list. Also `FaunaView`.

### Changed

- Part of #2837
