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
  decor_mushroom_pink: { model: `${NATURE}/Mushroom_Common`, fallbackModel: `${NATURE}/Mushroom_Laetiporus` },
  decor_mushroom_mint: { model: `${NATURE}/Mushroom_Laetiporus`, fallbackModel: `${NATURE}/Mushroom_Common` },
  decor_bush_mint: { model: `${NATURE}/Bush_Common`, fallbackModel: `${NATURE}/Plant_1_Big` },
  decor_bloom_pink: { model: `${NATURE}/Flower_4_Group`, fallbackModel: `${NATURE}/Flower_3_Group` },
  decor_tuft_mint: { model: `${NATURE}/Grass_Wispy_Tall`, fallbackModel: `${NATURE}/Clover_1` },
  decor_pebble_lilac: { model: `${NATURE}/Pebble_Round_3`, fallbackModel: `${NATURE}/Pebble_Round_1` },
  decor_rug_butter: { model: `${FURN}/rug_rectangle_A`, fallbackModel: `${FURN}/rug_rectangle_B` },
  decor_rug_pink: { model: `${FURN}/rug_oval_A`, fallbackModel: `${FURN}/rug_oval_B` },
  decor_rug_mint: { model: `${FURN}/rug_oval_B`, fallbackModel: `${FURN}/rug_oval_A` },
  decor_lamp: { model: `${FURN}/lamp_standing`, fallbackModel: `${FURN}/lamp_table` },
  decor_lamp_table: { model: `${FURN}/lamp_table`, fallbackModel: `${FURN}/lamp_standing` },
  decor_shelf: { model: `${FURN}/shelf_B_large_decorated`, fallbackModel: `${FURN}/shelf_A_big` },
  decor_cabinet: { model: `${FURN}/cabinet_small_decorated`, fallbackModel: `${FURN}/cabinet_small` },
  decor_armchair: { model: `${FURN}/armchair_pillows`, fallbackModel: `${FURN}/armchair` },
  decor_picture: { model: `${FURN}/pictureframe_standing_A`, fallbackModel: `${FURN}/pictureframe_standing_B` },
  decor_cactus: { model: `${FURN}/cactus_small_A`, fallbackModel: `${FURN}/cactus_small_B` },
  decor_stool: { model: `${FURN}/chair_stool`, fallbackModel: `${FURN}/chair_stool_wood` },
  decor_books: { model: `${FURN}/book_set`, fallbackModel: `${FURN}/book_single` },
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
  wall_window: { scale: 1.5, color: "#ffeab0" },
  corner: { scale: 1.45, color: "#ffd0e6" },
  gate: { scale: 1.5, color: "#ffd0e6" },
};

/** Enamel-pale tints on the KayKit textures, so each station reads in the palette instead of multiplying into saturated orange or blue. */
const FURNITURE_TINT: Record<string, string> = {
  nutrient_font: "#ffeab0",
  sleep_pod: "#ffd0e6",
  chat_ring: "#cff3e2",
  holo_arcade: "#e3d6ff",
  bloom_planter: "#cff3e2",
  work_console: "#fff0d6",
};

function furniturePick(def: FurnitureDef): ModelPick | null {
  const base = FURNITURE_PLAN[def.id];
  if (base === undefined) return null;
  return {
    ...base,
    style: {
      targetHeight: def.height,
      material: { color: FURNITURE_TINT[def.id] ?? "#fff0d6", metalness: 0.05, roughness: 0.75 },
    },
  };
}

function decorPick(def: DecorDef): ModelPick | null {
  const base = DECOR_PLAN[def.id];
  if (base === undefined) return null;
  const glow = def.glow ?? 0.02;
  return {
    ...base,
    style: {
      ...(def.scale === undefined ? { targetHeight: def.height } : { scale: def.scale }),
      material: { color: def.color, roughness: 0.85, emissive: def.color, emissiveIntensity: glow },
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
