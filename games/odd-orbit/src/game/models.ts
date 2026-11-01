import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/core/model/resolveModel";

import { assets } from "./assets";
import type { CreatureBodyShape } from "./creatures/bodyPlan";
import { DECOR, FURNITURE, STRUCTURE, type DecorDef, type FurnitureDef, type StructureDef } from "./objects/catalog";


const MONSTERS = "quaternius-textured-cute-monster-pack";
const NATURE = "quaternius-stylized-nature";
const FURN = "kaykit-furniture";
const SPACE = "kaykit-space-base";

/** Art plan: KayKit rounded furniture, one proportion; a missing id is a provisioning bug, not a look. */
const FURNITURE_PLAN: Record<string, ModelPick> = {
  nutrient_font: { model: `${FURN}/table_medium`, fallbackModel: `${FURN}/table_small` },
  sleep_pod: { model: `${FURN}/bed_double_A`, fallbackModel: `${FURN}/bed_single_A` },
  chat_ring: { model: `${FURN}/couch`, fallbackModel: `${FURN}/armchair` },
  holo_arcade: { model: `${FURN}/cabinet_medium_decorated`, fallbackModel: `${FURN}/cabinet_medium` },
  bloom_planter: { model: `${FURN}/cactus_medium_A`, fallbackModel: `${NATURE}/Plant_1` },
  work_console: { model: `${FURN}/table_medium_long`, fallbackModel: `${FURN}/table_medium` },
};

const DECOR_PLAN: Record<string, ModelPick> = {
  decor_spire: { model: `${SPACE}/windturbine_tall`, fallbackModel: `${SPACE}/structure_tall` },
  decor_boulder: { model: `${NATURE}/Rock_Medium_1`, fallbackModel: `${SPACE}/rock_A` },
  decor_frond: { model: `${NATURE}/Mushroom_Common`, fallbackModel: `${NATURE}/Plant_1` },
  decor_frond_tan: { model: `${NATURE}/Mushroom_Laetiporus`, fallbackModel: `${NATURE}/Fern_1` },
  decor_crystal: { model: `${NATURE}/Rock_Medium_2`, fallbackModel: `${SPACE}/rock_B` },
};

const STRUCTURE_PLAN: Record<string, ModelPick> = {
  hab_wall: { model: `${SPACE}/tunnel_straight_A`, fallbackModel: `${SPACE}/tunnel_straight_B` },
  hab_wall_window: { model: `${SPACE}/tunnel_straight_B`, fallbackModel: `${SPACE}/tunnel_straight_A` },
  hab_corner: { model: `${SPACE}/basemodule_A`, fallbackModel: `${SPACE}/basemodule_B` },
  hab_gate: { model: `${SPACE}/basemodule_E`, fallbackModel: `${SPACE}/basemodule_garage` },
};

/** Uniform scale and pastel enamel per shell piece: tubes lengthen to the 3 m wall pitch, domes and the airlock stand a little taller than the tubes. */
const STRUCTURE_LOOK: Record<StructureDef["kind"], { scale: number; color: string }> = {
  wall: { scale: 1.5, color: "#fff0d6" },
  wall_window: { scale: 1.5, color: "#ffd98a" },
  corner: { scale: 1.45, color: "#f6a6cf" },
  gate: { scale: 1.5, color: "#f6a6cf" },
};

function furniturePick(def: FurnitureDef): ModelPick | null {
  const base = FURNITURE_PLAN[def.id];
  if (base === undefined) return null;
  return {
    ...base,
    style: {
      targetHeight: def.height,
      material: { color: def.color, metalness: 0.12, roughness: 0.8, emissive: def.color, emissiveIntensity: 0.04 },
    },
  };
}

function decorPick(def: DecorDef): ModelPick | null {
  const base = DECOR_PLAN[def.id];
  if (base === undefined) return null;
  return {
    ...base,
    style: {
      targetHeight: def.height,
      material: { color: def.color, roughness: 0.9, emissive: def.color, emissiveIntensity: def.id === "decor_crystal" ? 0.16 : 0.02 },
    },
  };
}

function structurePick(def: StructureDef): ModelPick | null {
  const base = STRUCTURE_PLAN[def.id];
  if (base === undefined) return null;
  const look = STRUCTURE_LOOK[def.kind];
  return {
    ...base,
    style: { scale: look.scale, material: { color: look.color, metalness: 0.05, roughness: 0.55 } },
  };
}

function buildObjectModels(): Record<string, ModelConfig> {
  const plan: Record<string, ModelPick> = {};
  for (const def of FURNITURE) {
    const pick = furniturePick(def);
    if (pick !== null) plan[def.id] = pick;
  }
  for (const def of DECOR) {
    const pick = decorPick(def);
    if (pick !== null) plan[def.id] = pick;
  }
  for (const def of STRUCTURE) {
    const pick = structurePick(def);
    if (pick !== null) plan[def.id] = pick;
  }
  return resolveModelPlan(assets, plan);
}

export const objectModels: Record<string, ModelConfig> = buildObjectModels();

/** One cute monster per body shape; each keeps its one odd feature (one eye, tall neck, claws, no legs). */
const ALIEN_MESH_BY_SHAPE: Record<CreatureBodyShape, string> = {
  tall: `${MONSTERS}/Alien_Tall`,
  round: `${MONSTERS}/Cyclops`,
  blob: `${MONSTERS}/Alien`,
  insectoid: `${MONSTERS}/Crab`,
};

export function resolveAlienMeshUrl(shape: CreatureBodyShape): string {
  const id = ALIEN_MESH_BY_SHAPE[shape];
  const url = assets.resolve(id)?.url;
  if (url === undefined) throw new Error(`odd-orbit: ${id} is not in the asset catalog; run bun run games:provision odd-orbit`);
  return url;
}
