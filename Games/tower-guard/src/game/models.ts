import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { CREEP_CATALOG, type CreepDef } from "./entities/enemies/catalog";

const CASTLE = "/models/kenney-castle";
const TOWER_DEFENSE = "/models/kenney-tower-defense";
const ARENA = "/models/kenney-mini-arena";

const RAIDER_HEIGHT = 1.8;
const RAIDER_CLIPS = { idle: "idle", walk: "walk" } as const;

function raiderModel(def: CreepDef): ModelConfig {
  return {
    url: `${ARENA}/character-soldier.glb`,
    targetHeight: RAIDER_HEIGHT * def.scale,
    material: { color: def.color },
    animation: { states: { ...RAIDER_CLIPS }, oneShots: { death: "die" } },
  };
}

const TOWER_MODEL: Record<string, ModelConfig> = {
  tower_archer: { url: `${TOWER_DEFENSE}/weapon-ballista.glb`, targetHeight: 2.1 },
  tower_cannon: { url: `${TOWER_DEFENSE}/weapon-cannon.glb`, targetHeight: 1.55 },
  tower_frost: {
    url: `${TOWER_DEFENSE}/tower-round-crystals.glb`,
    targetHeight: 2,
    material: { emissive: "#3fb9d1", emissiveIntensity: 0.5 },
  },
};

export const entityModels: Record<string, ModelConfig> = {
  [BASE_CATALOG_ID]: { url: `${CASTLE}/tower-square-top-roof-high-windows.glb`, targetHeight: 6.5 },
  ...TOWER_MODEL,
  ...Object.fromEntries(Object.values(CREEP_CATALOG).map((def) => [def.id, raiderModel(def)])),
};

/** Scatter palette item id → asset catalog id; the forest/meadow regions' `pine` placements GPU-instance this real GLB instead of the stylized proxy conifer. */
export const scatterModels: Record<string, string> = {
  pine: "scatter/pine",
};
