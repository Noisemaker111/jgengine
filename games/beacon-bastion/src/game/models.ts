import type { ModelAttachment, ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/core/model/resolveModel";

import { assets } from "./assets";
import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { CREEP_CATALOG, type CreepDef } from "./entities/enemies/catalog";

const HEXAGON = "kaykit-medieval-hexagon";
const FOREST = "kaykit-forest";

/** Height of a raider at scale 1; each catalog entry's scale multiplies it. */
const RAIDER_HEIGHT = 1.8;

function gearOf(def: CreepDef): ModelAttachment[] {
  const gear: ModelAttachment[] = [];
  if (def.gear?.right !== undefined) gear.push({ slot: "handslot.r", model: def.gear.right });
  if (def.gear?.left !== undefined) gear.push({ slot: "handslot.l", model: def.gear.left });
  return gear;
}

// Preserve automatic clip roles while advancing raiders with the game's accepted clock.
function raiderPick(def: CreepDef): ModelPick {
  const gear = gearOf(def);
  return {
    model: def.model,
    ...(def.fallbackModel === undefined ? {} : { fallbackModel: def.fallbackModel }),
    style: {
      targetHeight: RAIDER_HEIGHT * def.scale,
      material: { color: def.color, rim: def.rim },
      animation: { auto: true, clock: "game" },
      ...(gear.length === 0 ? {} : { attachments: gear }),
    },
  };
}

// The keep's own blue roofs, so every building the player raises reads as one side against the red raiders.
const TOWER_PLAN: Record<string, ModelPick> = {
  tower_archer: {
    model: `${HEXAGON}/building_tower_A_blue`,
    style: { targetHeight: 2.6 },
  },
  tower_cannon: {
    model: `${HEXAGON}/building_tower_catapult_blue`,
    style: { targetHeight: 2.4 },
  },
  tower_frost: {
    model: `${HEXAGON}/building_tower_B_blue`,
    style: {
      targetHeight: 2.8,
      material: { emissive: "#3fb9d1", emissiveIntensity: 0.35 },
    },
  },
  // The sanctum: an open-topped tower lit violet from inside, so it never reads as a frost spire.
  tower_arcane: {
    model: `${HEXAGON}/building_tower_base_blue`,
    style: {
      targetHeight: 2.4,
      material: { color: "#b7a2e0", emissive: "#a35cff", emissiveIntensity: 0.55 },
    },
  },
};

const KEEP_PLAN: ModelPick = {
  model: `${HEXAGON}/building_castle_blue`,
  style: { targetHeight: 4.4 },
};

function buildEntityModels(): Record<string, ModelConfig> {
  const plan: Record<string, ModelPick> = {
    [BASE_CATALOG_ID]: KEEP_PLAN,
    ...TOWER_PLAN,
  };
  for (const def of Object.values(CREEP_CATALOG)) plan[def.id] = raiderPick(def);
  return resolveModelPlan(assets, plan);
}

export const entityModels: Record<string, ModelConfig> = buildEntityModels();

/** Each authored scatter item's KayKit Forest model: tall narrow pines, round oaks, low bushes and stones. */
const SCATTER_PLAN: Record<string, string> = {
  pine: `${FOREST}/Tree_4_A_Color1`,
  oak: `${FOREST}/Tree_1_A_Color1`,
  tree: `${FOREST}/Tree_3_A_Color1`,
  bush: `${FOREST}/Bush_2_A_Color1`,
  rock: `${FOREST}/Rock_3_A_Color1`,
  stone: `${FOREST}/Rock_1_A_Color1`,
};

/** Scatter palette item → catalog id when live; else InstancedScatter stylized proxy. */
export const scatterModels: Record<string, string> = Object.fromEntries(
  Object.entries(SCATTER_PLAN).filter(([, id]) => assets.resolve(id) !== null),
);
