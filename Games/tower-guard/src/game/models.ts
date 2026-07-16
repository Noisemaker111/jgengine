import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";
import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { CREEP_CATALOG, type CreepDef } from "./entities/enemies/catalog";

const VILLAGE = "quaternius-medieval-village";
const NATURE = "quaternius-stylized-nature";
const DUNGEON = "kaykit-dungeon";
const CHAR = "kaykit-adventurers";
const SKEL = "kaykit-skeletons";

const RAIDER_HEIGHT = 1.8;
const RAIDER_CLIPS = { idle: "idle", walk: "walk" } as const;

function raiderPick(def: CreepDef): ModelPick {
  return {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${SKEL}/Skeleton_Rogue`,
    style: {
      targetHeight: RAIDER_HEIGHT * def.scale,
      material: { color: def.color },
      animation: { states: { ...RAIDER_CLIPS }, oneShots: { death: "die" } },
    },
  };
}

const TOWER_PLAN: Record<string, ModelPick> = {
  tower_archer: {
    model: `${DUNGEON}/wall_archedwindow_gated`,
    fallbackModel: `${DUNGEON}/wall_pillar`,
    style: { targetHeight: 2.1 },
  },
  tower_cannon: {
    model: `${DUNGEON}/wall_scaffold`,
    fallbackModel: `${DUNGEON}/wall_arched`,
    style: { targetHeight: 1.55 },
  },
  tower_frost: {
    model: `${DUNGEON}/wall_corner_gated`,
    fallbackModel: `${DUNGEON}/pillar_decorated`,
    style: {
      targetHeight: 2,
      material: { emissive: "#3fb9d1", emissiveIntensity: 0.5 },
    },
  },
};

const KEEP_PLAN: ModelPick = {
  model: `${DUNGEON}/wall_arched`,
  fallbackModel: `${VILLAGE}/Wall_UnevenBrick_Straight`,
  style: { scale: 1.6 },
};

function buildEntityModels(): Record<string, ModelConfig> {
  const plan: Record<string, ModelPick> = {
    [BASE_CATALOG_ID]: KEEP_PLAN,
    ...TOWER_PLAN,
  };
  for (const def of Object.values(CREEP_CATALOG)) {
    plan[def.id] = raiderPick(def);
  }
  return resolveModelPlan(assets, plan);
}

export const entityModels: Record<string, ModelConfig> = buildEntityModels();

/** Scatter palette item → catalog id when live; else InstancedScatter stylized proxy. */
export const scatterModels: Record<string, string> = {};
for (const id of [`${NATURE}/Pine_1`, `${NATURE}/Pine_2`, "nature/tree_pine"] as const) {
  if (assets.resolve(id) !== null) {
    scatterModels.pine = id;
    break;
  }
}
