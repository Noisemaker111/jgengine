/**
 * Task-first JGEngine authoring surface.
 *
 * Game code should begin here. Domain and runtime deep imports remain available for
 * advanced composition, but this module intentionally exposes the common authored
 * concepts without requiring callers to understand the repository layout.
 */

export {
  defineGame,
  type GameDefinition,
  type GameDefinitionConfig,
  type GameLoop,
  type InventoryDeclaration,
  type PhysicsConfig,
  type GameServerConfig,
} from "./game/defineGame";

export {
  lootTable,
  type LootTableDef,
  type LootEntry,
  type Drop,
} from "./game/lootTable";

export {
  world,
  biomes,
  voxel,
  plots,
  tilemap,
  flat,
  environment,
  terrain,
  rain,
  snow,
  grass,
  ocean,
  building,
  road,
  type WorldFeature,
} from "./world/features";

export { seededRng, seededStreams } from "./random/rng";

export {
  selectSpawnPoint,
  type SpawnPointSelectionOptions,
  type SpawnPointDistanceBias,
} from "./ai/spawnDirector";

export {
  contextVerb,
  type ContextVerb,
} from "./interaction/contextMenu";

export {
  type ActionCodesMap,
} from "./input/actionBindings";
