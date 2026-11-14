import type { ToolProfile } from "@jgengine/core/world/resourceNode";

const BERRIES = ["mejoberry", "amarberry", "azulberry", "tintoberry", "narcoberry", "stimberry"] as const;
const berries = (bias: number): Record<string, number> => Object.fromEntries(BERRIES.map((kind) => [kind, bias]));

/**
 * A tame's bite as a gathering tool, by species: ARK's gatherers, each far better at its specialty than any
 * hand tool (a Rollgrinder at stone, an Thermite Beetle at metal and flint, a Sawbeaver or Timberjack at wood, the
 * big grazers at berries). A species with no row bites for meat and hide only. Biases are approximate,
 * set so a specialist out-gathers the best hand tool on its specialty by well over two to one (a stone
 * hatchet draws stone at 2.2 every 0.9 s; a Rollgrinder at 12 every 1.4 s).
 */
export const TAME_GATHER: Readonly<Record<string, ToolProfile>> = {
  // A Mowbot trims bushes and grass for fiber and thatch: its Harvest chip's whole job.
  mowbot: { power: 1, biases: { fiber: 6, thatch: 3, mejoberry: 0.5 }, defaultBias: 0 },
  thermite: { power: 1.5, biases: { metal: 10, flint: 10, crystal: 6, obsidian: 6, stone: 0.5 }, defaultBias: 0 },
  rollgrinder: { power: 1.5, biases: { stone: 12, flint: 0.3 }, defaultBias: 0 },
  sawbeaver: { power: 1.5, biases: { wood: 10, thatch: 1 }, defaultBias: 0 },
  timberjack: { power: 1.5, biases: { wood: 8, thatch: 1 }, defaultBias: 0 },
  bulldozaur: { power: 1.5, biases: { wood: 6, stone: 6, thatch: 1 }, defaultBias: 0 },
  platebacker: { power: 1, biases: { ...berries(4), thatch: 4 }, defaultBias: 0 },
  hoover: { power: 1.5, biases: { ...berries(6), thatch: 4, wood: 2 }, defaultBias: 0 },
  highrise: { power: 1.5, biases: { ...berries(5), thatch: 4, wood: 2 }, defaultBias: 0 },
};

/** The meat-and-hide bite every species has on a body, by diet (a scavenger cuts more meat). */
export const DIET_BITE: Readonly<Record<"scavenger" | "grazer", Readonly<Record<string, number>>>> = {
  scavenger: { biogel: 2, salvage: 1 },
  grazer: { biogel: 0.5, salvage: 1.5 },
};

/** A species' whole bite: its gathering specialty, plus its diet's cut from a body. */
export function biteProfile(species: string, diet: "scavenger" | "grazer"): ToolProfile {
  const special = TAME_GATHER[species];
  return { power: special?.power ?? 1, biases: { ...DIET_BITE[diet], ...special?.biases }, defaultBias: 0 };
}

/**
 * What a specialist carries lighter: the share of an item's weight it feels, by species (ARK's weight
 * reductions; the Rollgrinder and Thermite Beetle carry their ores at a quarter, the wood gatherers wood at half,
 * the Homer meat at half). Approximate where the wiki gives no figure.
 */
export const LIGHTER_LOADS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  thermite: { metal: 0.25, metal_ingot: 0.25, flint: 0.25, crystal: 0.25, obsidian: 0.25 },
  rollgrinder: { stone: 0.25 },
  sawbeaver: { wood: 0.5, thatch: 0.5, stone: 0.5 },
  timberjack: { wood: 0.5 },
  homer: { biogel: 0.5, prime_biogel: 0.5, gel_ration: 0.5 },
};

/** The share of `itemId`'s weight a `species` feels carrying it: 1 unless it is that species' specialty. */
export const loadShare = (species: string, itemId: string): number => LIGHTER_LOADS[species]?.[itemId] ?? 1;
