import type { RecipeDef } from "@jgengine/core/crafting/recipe";

import { FIRMWARE_RECIPES } from "./firmware";
import { SPECIES } from "./species";
import { STRUCTURES } from "./structures";

/**
 * One engram as ARK's Island has it: the level it opens at, its engram-point cost, and the recipe it
 * teaches. Levels and costs are ARK's; recipes are ARK's where known (see README "Gap to target").
 */
export interface EngramDef {
  id: string;
  level: number;
  points: number;
  recipe: RecipeDef;
}

type Inputs = Record<string, number>;

function engram(id: string, level: number, points: number, inputs: Inputs, seconds: number, options: { count?: number; station?: string; output?: string } = {}): EngramDef {
  return {
    id,
    level,
    points,
    recipe: {
      id,
      inputs: Object.entries(inputs).map(([itemId, count]) => ({ itemId, count })),
      outputs: [{ itemId: options.output ?? id, count: options.count ?? 1 }],
      seconds,
      requires: [id],
      ...(options.station === undefined ? {} : { station: options.station, stationRange: 4 }),
      category: options.station ?? "inventory",
    },
  };
}

const ITEM_ENGRAMS: readonly EngramDef[] = [
  engram("stone_pick", 1, 0, { stone: 1, wood: 1, thatch: 10 }, 5),
  engram("torch", 1, 0, { flint: 1, stone: 1, wood: 5 }, 5),
  engram("spear", 2, 3, { wood: 8, flint: 2, fiber: 12 }, 5),
  engram("stone_hatchet", 2, 3, { flint: 1, wood: 1, thatch: 10 }, 5),
  engram("cloth_boots", 3, 3, { fiber: 25, salvage: 6 }, 5),
  engram("cloth_gloves", 3, 3, { fiber: 10, salvage: 2 }, 5),
  engram("cloth_hat", 3, 3, { fiber: 10, salvage: 2 }, 5),
  engram("cloth_pants", 3, 3, { fiber: 40 }, 5),
  engram("cloth_shirt", 3, 3, { fiber: 40 }, 5),
  engram("waterskin", 3, 6, { salvage: 4, fiber: 12 }, 5),
  engram("slingshot", 5, 6, { salvage: 1, wood: 2, fiber: 20 }, 5),
  engram("sparkpowder", 6, 3, { flint: 2, stone: 1 }, 2, { station: "mortar_and_pestle" }),
  engram("drain_spike", 6, 6, { narcoberry: 5, soured_gel: 1 }, 3, { station: "mortar_and_pestle" }),
  engram("wooden_club", 8, 4, { wood: 4, fiber: 15 }, 5),
  // ARK's bola (level and cost approx).
  engram("bola", 9, 6, { fiber: 10, salvage: 3, stone: 5 }, 3),
  // ARK: bow and stone arrows at 10, tranquilizer arrows at 21. Costs approx.
  engram("bow", 10, 9, { wood: 15, fiber: 50, salvage: 8 }, 5),
  engram("stone_arrow", 10, 3, { thatch: 2, flint: 1, fiber: 2 }, 1, { count: 2 }),
  engram("emp_arrow", 21, 12, { stone_arrow: 1, drain_spike: 1 }, 1),
  engram("fertilizer", 15, 3, { soured_gel: 3, thatch: 10 }, 5, { station: "mortar_and_pestle" }),
  engram("stimulant", 11, 6, { stimberry: 5, sparkpowder: 2 }, 3, { station: "mortar_and_pestle" }),
  // ARK's metal tools: a pick is one ingot, a hatchet eight (levels and points approx).
  engram("metal_pick", 19, 12, { metal_ingot: 1, wood: 1, salvage: 10 }, 5),
  engram("metal_hatchet", 19, 12, { metal_ingot: 8, wood: 1, salvage: 10 }, 5),
  // The climb from 60 to the cap (ours, levels and points approx): the far corners' obsidian, crystal and oil, then
  // what the Hivemind leaves, one piece of hive gear per difficulty beaten.
  engram("obsidian_arrow", 62, 20, { obsidian: 1, wood: 1, fiber: 3 }, 1, { count: 2 }),
  engram("snow_mask", 70, 24, { crystal: 3, salvage: 15, fiber: 10 }, 5),
  engram("oilskin_coat", 78, 30, { oil: 8, salvage: 25, fiber: 30 }, 5),
  engram("element_pick", 86, 35, { element: 10, metal_ingot: 20, crystal: 10, obsidian: 10 }, 10),
  engram("hive_greaves", 95, 40, { hivemind_trophy_gamma: 1, hive_flag: 1, artifact_pack: 1, artifact_strong: 1, element: 20, salvage: 40 }, 10),
  engram("hive_gauntlets", 100, 45, { hivemind_trophy_beta: 1, artifact_skylord: 1, artifact_immune: 1, element: 50, salvage: 20 }, 10),
  engram("hive_treads", 105, 50, { hivemind_trophy_alpha: 1, artifact_devourer: 1, element: 100, salvage: 30 }, 10),
];

/** Every engram in ARK's level order: items above, building pieces from their own table. Level 1 engrams cost nothing and are known from the start. */
export const ENGRAMS: readonly EngramDef[] = [
  ...ITEM_ENGRAMS,
  ...Object.values(SPECIES).flatMap((def) => (def.saddle === null || def.saddleEngram === null ? [] : [engram(def.saddle, def.saddleEngram.level, def.saddleEngram.points, def.saddleEngram.cost, 10)])),
  ...STRUCTURES.map((entry) => engram(entry.id, entry.level, entry.points, entry.cost, entry.shape === "foundation" || entry.tier === "station" ? 5 : 2)),
].sort((a, b) => a.level - b.level);

/** Station recipes that need no engram: cooking on a campfire, firmware in a cooking pot, and smelting in a forge. */
export const COOKING: readonly RecipeDef[] = [
  ...FIRMWARE_RECIPES,
  // ARK's forge: two ore make one ingot (seconds approx).
  { id: "smelt_metal", inputs: [{ itemId: "metal", count: 2 }], outputs: [{ itemId: "metal_ingot", count: 1 }], seconds: 20, station: "refining_forge", stationRange: 4, category: "refining_forge" },
  { id: "cook_meat", inputs: [{ itemId: "biogel", count: 1 }], outputs: [{ itemId: "gel_ration", count: 1 }], seconds: 20, station: "campfire", stationRange: 4, category: "campfire" },
];

const BY_ID = new Map(ENGRAMS.map((entry) => [entry.id, entry]));

export function engramDef(id: string): EngramDef | null {
  return BY_ID.get(id) ?? null;
}

/** Every recipe the survivor can ever craft: engram recipes plus cooking. */
export const CRAFTING_RECIPES: readonly RecipeDef[] = [...ENGRAMS.map((entry) => entry.recipe), ...COOKING];

export function recipeDef(id: string): RecipeDef | null {
  return CRAFTING_RECIPES.find((recipe) => recipe.id === id) ?? null;
}
