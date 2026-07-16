import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";
import { DECOR, FURNITURE, STRUCTURE, type DecorDef, type FurnitureDef, type StructureDef } from "./objects/catalog";

export const HAB_WALL_SCALE = 3;

const SCIFI = "quaternius-modular-scifi";
const NATURE = "quaternius-stylized-nature";
const PROPS = "quaternius-fantasy-props";
const CHAR = "kaykit-adventurers";
const CHAR_FB = "quaternius-base-characters";

/** Art plan: preferred catalog ids. Soft-resolve; missing → shell primitives. */
const FURNITURE_PLAN: Record<string, ModelPick> = {
  nutrient_font: { model: `${PROPS}/Table`, fallbackModel: `${SCIFI}/crate` },
  sleep_pod: { model: `${PROPS}/Bed`, fallbackModel: `${SCIFI}/crate` },
  chat_ring: { model: `${PROPS}/Sofa`, fallbackModel: `${SCIFI}/crate` },
  holo_arcade: { model: `${SCIFI}/desk_computer`, fallbackModel: `${SCIFI}/astronautA` },
  bloom_planter: { model: `${NATURE}/plant_bush`, fallbackModel: `${NATURE}/tree_pineDefaultA` },
  work_console: { model: `${SCIFI}/desk_computer`, fallbackModel: `${SCIFI}/astronautA` },
};

const DECOR_PLAN: Record<string, ModelPick> = {
  decor_spire: { model: `${SCIFI}/satelliteDish_large`, fallbackModel: `${SCIFI}/astronautA` },
  decor_boulder: { model: `${SCIFI}/rock_crystalsLargeA`, fallbackModel: `${NATURE}/tree_pineDefaultA` },
  decor_frond: { model: `${NATURE}/mushroom_redTall`, fallbackModel: `${NATURE}/tree_pineDefaultA` },
  decor_frond_tan: { model: `${NATURE}/mushroom_tanTall`, fallbackModel: `${NATURE}/tree_pineDefaultA` },
  decor_crystal: { model: `${SCIFI}/rock_crystalsLargeB`, fallbackModel: `${NATURE}/tree_pineDefaultA` },
};

const STRUCTURE_PLAN: Record<string, ModelPick> = {
  hab_wall: { model: `${SCIFI}/corridor_windowClosed`, fallbackModel: `${SCIFI}/astronautA` },
  hab_wall_window: { model: `${SCIFI}/corridor_window`, fallbackModel: `${SCIFI}/astronautA` },
  hab_corner: { model: `${SCIFI}/corridor_wallCorner`, fallbackModel: `${SCIFI}/astronautA` },
  hab_gate: { model: `${SCIFI}/gate_complex`, fallbackModel: `${SCIFI}/astronautA` },
};

function furniturePick(def: FurnitureDef): ModelPick | null {
  const base = FURNITURE_PLAN[def.id];
  if (base === undefined) return null;
  return {
    ...base,
    style: {
      targetHeight: def.height,
      material: { color: def.color, metalness: 0.2, roughness: 0.5, emissive: def.color, emissiveIntensity: 0.12 },
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
      material: { color: def.color, emissive: def.color, emissiveIntensity: 0.22 },
    },
  };
}

function structurePick(def: StructureDef): ModelPick | null {
  const base = STRUCTURE_PLAN[def.id];
  if (base === undefined) return null;
  return {
    ...base,
    style: {
      scale: HAB_WALL_SCALE,
      material: { color: "#9d93bd", metalness: 0.35, roughness: 0.45 },
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
  `${CHAR}/Rogue`,
  `${CHAR}/Mage`,
  `${CHAR}/Knight`,
  `${CHAR_FB}/Character_Male_1`,
  `${CHAR_FB}/Character_Female_1`,
  `${SCIFI}/astronautA`,
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
