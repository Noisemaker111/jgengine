import type { ToolProfile } from "@jgengine/core/world/resourceNode";

const BERRIES = ["mejoberry", "amarberry", "azulberry", "tintoberry", "narcoberry", "stimberry"] as const;
const berries = (bias: number): Record<string, number> => Object.fromEntries(BERRIES.map((kind) => [kind, bias]));

/**
 * A tame's bite as a gathering tool, by species: ARK's gatherers, each far better at its specialty than any
 * hand tool (a Doedicurus at stone, an Ankylosaurus at metal and flint, a Castoroides or Mammoth at wood, the
 * big herbivores at berries). A species with no row bites for meat and hide only. Biases are approximate,
 * set so a specialist out-gathers the best hand tool on its specialty by well over two to one (a stone
 * hatchet draws stone at 2.2 every 0.9 s; a Doedicurus at 12 every 1.4 s).
 */
export const TAME_GATHER: Readonly<Record<string, ToolProfile>> = {
  ankylosaurus: { power: 1.5, biases: { metal: 10, flint: 10, crystal: 6, obsidian: 6, stone: 0.5 }, defaultBias: 0 },
  doedicurus: { power: 1.5, biases: { stone: 12, flint: 0.3 }, defaultBias: 0 },
  castoroides: { power: 1.5, biases: { wood: 10, thatch: 1 }, defaultBias: 0 },
  mammoth: { power: 1.5, biases: { wood: 8, thatch: 1 }, defaultBias: 0 },
  triceratops: { power: 1, biases: { ...berries(6), fiber: 0.5 }, defaultBias: 0 },
  stegosaurus: { power: 1, biases: { ...berries(4), thatch: 4 }, defaultBias: 0 },
  brontosaurus: { power: 1.5, biases: { ...berries(6), thatch: 4, wood: 2 }, defaultBias: 0 },
  paraceratherium: { power: 1.5, biases: { ...berries(5), thatch: 4, wood: 2 }, defaultBias: 0 },
};

/** The meat-and-hide bite every species has on a body, by diet (a carnivore cuts more meat). */
export const DIET_BITE: Readonly<Record<"carnivore" | "herbivore", Readonly<Record<string, number>>>> = {
  carnivore: { raw_meat: 2, hide: 1 },
  herbivore: { raw_meat: 0.5, hide: 1.5 },
};

/** A species' whole bite: its gathering specialty, plus its diet's cut from a body. */
export function biteProfile(species: string, diet: "carnivore" | "herbivore"): ToolProfile {
  const special = TAME_GATHER[species];
  return { power: special?.power ?? 1, biases: { ...DIET_BITE[diet], ...special?.biases }, defaultBias: 0 };
}

/**
 * What a specialist carries lighter: the share of an item's weight it feels, by species (ARK's weight
 * reductions; the Doedicurus and Ankylosaurus carry their ores at a quarter, the wood gatherers wood at half,
 * the Argentavis meat at half). Approximate where the wiki gives no figure.
 */
export const LIGHTER_LOADS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  ankylosaurus: { metal: 0.25, flint: 0.25, crystal: 0.25, obsidian: 0.25 },
  doedicurus: { stone: 0.25 },
  castoroides: { wood: 0.5, thatch: 0.5, stone: 0.5 },
  mammoth: { wood: 0.5 },
  argentavis: { raw_meat: 0.5, raw_prime_meat: 0.5, cooked_meat: 0.5 },
};

/** The share of `itemId`'s weight a `species` feels carrying it: 1 unless it is that species' specialty. */
export const loadShare = (species: string, itemId: string): number => LIGHTER_LOADS[species]?.[itemId] ?? 1;
