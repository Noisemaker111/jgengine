import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";
import { DECOR, FURNITURE, STRUCTURE, type DecorDef, type FurnitureDef, type StructureDef } from "./objects/catalog";

export const HAB_WALL_HEIGHT = 2.25;

const SCIFI = "quaternius-modular-scifi";
const NATURE = "quaternius-stylized-nature";
const FURN = "kaykit-furniture";
const SPACE = "kaykit-space-base";

/** Art plan: preferred catalog ids. Soft-resolve; missing → shell primitives. */
const FURNITURE_PLAN: Record<string, ModelPick> = {
  nutrient_font: { model: `${FURN}/table_medium`, fallbackModel: `${FURN}/table_small` },
  sleep_pod: { model: `${FURN}/bed_double_A`, fallbackModel: `${FURN}/bed_single_A` },
  chat_ring: { model: `${FURN}/couch`, fallbackModel: `${FURN}/armchair` },
  holo_arcade: { model: `${SCIFI}/Prop_AccessPoint`, fallbackModel: `${SCIFI}/Prop_Computer` },
  bloom_planter: { model: `${FURN}/cactus_medium_A`, fallbackModel: `${NATURE}/Plant_1` },
  work_console: { model: `${SCIFI}/Prop_Computer`, fallbackModel: `${SCIFI}/Prop_ItemHolder` },
};

const DECOR_PLAN: Record<string, ModelPick> = {
  decor_spire: { model: `${SPACE}/windturbine_tall`, fallbackModel: `${SCIFI}/Column_Large_Straight` },
  decor_boulder: { model: `${NATURE}/Rock_Medium_1`, fallbackModel: `${SPACE}/rock_A` },
  decor_frond: { model: `${NATURE}/Mushroom_Common`, fallbackModel: `${NATURE}/Plant_1` },
  decor_frond_tan: { model: `${NATURE}/Mushroom_Laetiporus`, fallbackModel: `${NATURE}/Fern_1` },
  decor_crystal: { model: `${NATURE}/Rock_Medium_2`, fallbackModel: `${SPACE}/rock_B` },
};

const STRUCTURE_PLAN: Record<string, ModelPick> = {
  hab_wall: { model: `${SCIFI}/WallAstra_Straight`, fallbackModel: `${SCIFI}/WallBand_Straight` },
  hab_wall_window: { model: `${SCIFI}/WallAstra_Straight_Window`, fallbackModel: `${SCIFI}/WallWindow_Straight` },
  hab_corner: { model: `${SCIFI}/WallAstra_Corner_Square_Outer`, fallbackModel: `${SCIFI}/WallBand_Corner_Square_Outer` },
  hab_gate: { model: `${SCIFI}/Door_Metal`, fallbackModel: `${SCIFI}/Door_Frame_Square` },
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
  return {
    ...base,
    style: {
      targetHeight: def.kind === "gate" ? 3 : HAB_WALL_HEIGHT,
      material: { color: "#b8c5c8", metalness: 0.15, roughness: 0.82 },
    },
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

/** Preferred character meshes for aliens — first live id wins at runtime. */
export const ALIEN_MESH_IDS: readonly string[] = [
  `${SCIFI}/Alien_Cyclop`,
  `${SCIFI}/Alien_Oculichrysalis`,
  `${SCIFI}/Alien_Scolitex`,
];

export function alienMeshUrl(id: string): string | null {
  return assets.resolve(id)?.url ?? null;
}

export function resolveAlienMeshUrl(seed: number): string | null {
  for (let i = 0; i < ALIEN_MESH_IDS.length; i++) {
    const id = ALIEN_MESH_IDS[(seed + i) % ALIEN_MESH_IDS.length]!;
    const url = alienMeshUrl(id);
    if (url !== null) return url;
  }
  return null;
}
