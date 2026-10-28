import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan } from "@jgengine/core/model/resolveModel";
import type { ScatterGeneratorItem } from "@jgengine/core/scatter/scatterGenerator";

import { assets } from "./assets";
import { SPECIES_MODELS } from "./data/creatureModels";

const NATURE = "/models/imported/quaternius-stylized-nature";
const nature = (file: string, targetHeight: number): ModelConfig => ({ url: `${NATURE}/${file}.glb`, targetHeight });
/** A rock tinted to read as the ore it holds. */
const ore = (file: string, targetHeight: number, material: NonNullable<ModelConfig["material"]>): ModelConfig => ({ ...nature(file, targetHeight), material });

/**
 * The survivor and every species: free animal models (data/creatureModels.ts), each drawn at the
 * species' standing height and tinted where a relative stands in for it.
 */
export const entityModels: Record<string, ModelConfig> = {
  ...resolveModelPlan(assets, { player: { model: "asset:person_casual", style: { targetHeight: 1.8 } } }),
  ...Object.fromEntries(
    Object.entries(SPECIES_MODELS).map(([species, { file, height, tint, tintMaterials }]) => [
      species,
      { url: `/models/imported/creatures/${file}.glb`, animation: "auto", targetHeight: height, ...(tint === undefined ? {} : { material: { color: tint, ...(tintMaterials === undefined ? {} : { materials: tintMaterials }) } }) } satisfies ModelConfig,
    ]),
  ),
};

export const objectModels: Record<string, ModelConfig> = {};

/** A palette item grown by an engine nature generator: a few seeded variants of one species. */
const grown = (generator: string, preset: string, params: Record<string, unknown> = {}, variants = 6): ScatterGeneratorItem => ({ generator, preset, params, variants });

/**
 * Scatter palette item (the island's forests, rocks and bushes in editor.scene.json) → what it draws.
 * Trees, palms, bushes, ferns, rocks and pebbles grow from the engine's nature generators, so no two
 * neighbours match; grass, flowers and ore rocks stay catalog models.
 */
export const scatterModels: Record<string, ModelConfig | ScatterGeneratorItem> = {
  palm: grown("nature.palm", "coconut", { height: 9, frondLength: 3.6 }),
  tree: grown("nature.broadleaf", "oak", { height: 11, branchStart: 0.5, clusterSize: 1.5 }),
  tree2: grown("nature.broadleaf", "tropical", { height: 12, twigs: 2, clusterSize: 1.7, leafColor: "#467f33" }),
  tree3: grown("nature.broadleaf", "birch", { height: 13, twigs: 2, clusterSize: 1.4, leafColor: "#5d9a3a" }),
  pine: grown("nature.conifer", "pine", { height: 13 }),
  pine2: grown("nature.conifer", "spruce", { height: 11 }),
  redwood: grown("nature.conifer", "redwood", { height: 30 }),
  deadtree: grown("nature.broadleaf", "dead", { height: 8 }),
  rock: grown("nature.rock", "rock", { size: 2.2 }),
  boulder: grown("nature.rock", "boulder", { size: 4.6 }),
  boulder2: grown("nature.rock", "slab", { size: 4.2, flatness: 0.55, moss: 0.4 }),
  bush: grown("nature.bush", "shrub", { width: 1.6, height: 1.3 }),
  berrybush: grown("nature.bush", "berry", { width: 1.6, height: 1.3 }),
  fern: grown("nature.fern", "fern", { frondLength: 1.4 }),
  pebble: grown("nature.rock", "pebbles", { size: 0.42 }, 4),
  pebble2: grown("nature.rock", "pebbles", { size: 0.48, count: 4, color: "#a39a88" }, 4),
  grass: nature("Grass_Common_Tall", 0.7),
  flowers: nature("Flower_4_Group", 0.6),
  tallgrass: nature("Grass_Wispy_Tall", 1),
  plant: nature("Plant_1_Big", 1.2),
  mushroom: nature("Mushroom_Common", 0.5),
  // Resource rocks: metal glints on the mountains, obsidian is black glass, crystal glows, oil rock is tar-dark.
  metal_rock: ore("Rock_Medium_1", 2.6, { color: "#8a7a66", metalness: 0.75, roughness: 0.35 }),
  obsidian_rock: ore("Rock_Medium_3", 2.2, { color: "#1b1a22", metalness: 0.2, roughness: 0.08 }),
  crystal: ore("Pebble_Square_2", 1.4, { color: "#e9f4ff", metalness: 0.1, roughness: 0.05, emissive: "#9fd8ff", emissiveIntensity: 0.6 }),
  oil_rock: ore("Rock_Medium_2", 1.8, { color: "#2b2620", metalness: 0.1, roughness: 0.2 }),
};
