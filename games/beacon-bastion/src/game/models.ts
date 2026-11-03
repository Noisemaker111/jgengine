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
    style: { targetHeight: 3.4 },
  },
  tower_cannon: {
    model: `${HEXAGON}/building_tower_catapult_blue`,
    style: { targetHeight: 3.1 },
  },
  tower_frost: {
    model: `${HEXAGON}/building_tower_B_blue`,
    style: {
      targetHeight: 3.6,
      material: { emissive: "#3fb9d1", emissiveIntensity: 0.35 },
    },
  },
  // The sanctum: an open-topped tower lit violet from inside, so it never reads as a frost spire.
  tower_arcane: {
    model: `${HEXAGON}/building_tower_base_blue`,
    style: {
      targetHeight: 3.1,
      material: { color: "#b7a2e0", emissive: "#a35cff", emissiveIntensity: 0.55 },
    },
  },
};

const KEEP_PLAN: ModelPick = {
  model: `${HEXAGON}/building_castle_blue`,
  style: { targetHeight: 7.5 },
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

/** The pack's spring lime pulled toward the highland's wet moss (`#5b7a3a`); trunks darken with it. */
const MOSS = { color: "#a9b48e" };

/** Each authored scatter item's KayKit Forest model: tall pines on the edge, round oaks, low bushes and stones. */
const SCATTER_PLAN: Record<string, ModelPick> = {
  pine: { model: `${FOREST}/Tree_4_A_Color1`, style: { targetHeight: 7.2, material: MOSS } },
  oak: { model: `${FOREST}/Tree_1_A_Color1`, style: { targetHeight: 5, material: MOSS } },
  tree: { model: `${FOREST}/Tree_3_A_Color1`, style: { targetHeight: 4.5, material: MOSS } },
  bush: { model: `${FOREST}/Bush_2_A_Color1`, style: { targetHeight: 0.9, material: MOSS } },
  rock: { model: `${FOREST}/Rock_3_A_Color1`, style: { targetHeight: 0.9 } },
  stone: { model: `${FOREST}/Rock_1_A_Color1`, style: { targetHeight: 0.5 } },
};

/** Scatter palette item → resolved model when its pack is live; else InstancedScatter stylized proxy. */
export const scatterModels: Record<string, ModelConfig> = resolveModelPlan(assets, SCATTER_PLAN);
