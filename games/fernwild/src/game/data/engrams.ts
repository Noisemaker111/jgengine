import type { RecipeDef } from "@jgengine/core/crafting/recipe";

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
  engram("cloth_boots", 3, 3, { fiber: 25, hide: 6 }, 5),
  engram("cloth_gloves", 3, 3, { fiber: 10, hide: 2 }, 5),
  engram("cloth_hat", 3, 3, { fiber: 10, hide: 2 }, 5),
  engram("cloth_pants", 3, 3, { fiber: 40 }, 5),
  engram("cloth_shirt", 3, 3, { fiber: 40 }, 5),
  engram("waterskin", 3, 6, { hide: 4, fiber: 12 }, 5),
  engram("hide_sleeping_bag", 4, 3, { hide: 15, fiber: 15 }, 5),
  engram("storage_box", 4, 6, { wood: 25, thatch: 20, fiber: 10 }, 5),
  engram("phiomia_saddle", 5, 6, { hide: 20, fiber: 15, wood: 5 }, 10),
  engram("slingshot", 5, 6, { hide: 1, wood: 2, fiber: 20 }, 5),
  engram("sparkpowder", 6, 3, { flint: 2, stone: 1 }, 2, { station: "mortar_and_pestle" }),
  engram("narcotic", 6, 6, { narcoberry: 5, spoiled_meat: 1 }, 3, { station: "mortar_and_pestle" }),
  engram("wooden_club", 8, 4, { wood: 4, fiber: 15 }, 5),
  engram("stimulant", 11, 6, { stimberry: 5, sparkpowder: 2 }, 3, { station: "mortar_and_pestle" }),
  engram("raptor_saddle", 18, 9, { hide: 110, fiber: 65, wood: 20 }, 10),
];

/** Every engram in ARK's level order: items above, building pieces from their own table. Level 1 engrams cost nothing and are known from the start. */
export const ENGRAMS: readonly EngramDef[] = [
  ...ITEM_ENGRAMS,
  ...STRUCTURES.map((entry) => engram(entry.id, entry.level, entry.points, entry.cost, entry.shape === "foundation" || entry.tier === "station" ? 5 : 2)),
].sort((a, b) => a.level - b.level);

/** Station recipes that need no engram: cooking on a campfire. */
export const COOKING: readonly RecipeDef[] = [
  { id: "cook_meat", inputs: [{ itemId: "raw_meat", count: 1 }], outputs: [{ itemId: "cooked_meat", count: 1 }], seconds: 20, station: "campfire", stationRange: 4, category: "campfire" },
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
