import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelAttachment, ModelConfig } from "@jgengine/core/game/playableGame";
import type { ScatterGeneratorItem } from "@jgengine/core/scatter/scatterGenerator";

import { SPECIES_MODELS } from "./data/creatureModels";

const NATURE = "/models/imported/quaternius-stylized-nature";
const nature = (file: string, targetHeight: number): ModelConfig => ({ url: `${NATURE}/${file}.glb`, targetHeight });
/** A rock tinted to read as the ore it holds. */
const ore = (file: string, targetHeight: number, material: NonNullable<ModelConfig["material"]>): ModelConfig => ({ ...nature(file, targetHeight), material });

const SURVIVOR = "human/man-casual";

/** A tool in the right fist: the haft runs down out of the grip, its head swings over and down. */
const GRIP: [number, number, number] = [2.62, 0, 0];

/** Each tool item the survivor shows in hand, and how the fist holds it; anything else leaves the fist empty. */
const TOOLS: Record<string, { model: string; rotation: [number, number, number] }> = {
  stone_pick: { model: "survival/stone-pick", rotation: GRIP },
  stone_hatchet: { model: "survival/stone-hatchet", rotation: GRIP },
  wooden_club: { model: "survival/wooden-club", rotation: GRIP },
  spear: { model: "survival/spear", rotation: [1.75, 0, 0] },
  torch: { model: "survival/torch", rotation: [0.35, 0, 0] },
};

const inHand = (tool: { model: string; rotation: [number, number, number] }): ModelAttachment => ({
  slot: "hand.r",
  model: libraryModel(tool.model),
  position: [0, -0.09, 0.02],
  rotation: tool.rotation,
});

const HELD: Record<string, ModelAttachment> = Object.fromEntries(Object.entries(TOOLS).map(([item, tool]) => [item, inHand(tool)]));

/** The model-library names the survivor and its tools draw, for the credits. */
export const SURVIVOR_MODELS: readonly string[] = [SURVIVOR, ...Object.values(TOOLS).map((tool) => tool.model)];

/**
 * The survivor and every species: free animal models (data/creatureModels.ts), each drawn at the
 * species' standing height and tinted where a relative stands in for it.
 */
export const entityModels: Record<string, ModelConfig> = {
  player: { ...libraryModel(SURVIVOR), held: HELD },
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
/** Undergrowth stands by the thousand, so it grows at the generators' lighter leaf budget. */
const undergrowth = (generator: string, preset: string, params: Record<string, unknown> = {}, variants = 6): ScatterGeneratorItem => ({ ...grown(generator, preset, params, variants), detail: 0.5 });

/** The island's tree look: rounded leaf clumps over the grown wood, lit, a touch more saturated than life. */
const TREE_LOOK = { foliage: "clumps", shading: "lit", saturation: 1.15, brightness: 1.05, barkGrain: true };

/** A tree grown by the plant simulation: a species at an age (and day of year), drawn at the clump level. */
const tree = (species: string, age: number, params: Record<string, unknown> = {}): ScatterGeneratorItem => ({
  generator: "plant.grown",
  params: { species, age, ...TREE_LOOK, ...params },
  variants: 4,
  detail: 0.25,
});

/**
 * Scatter palette item (the island's forests, rocks and bushes in editor.scene.json) → what it draws.
 * Trees are grown by the engine's plant simulation (sugar maple and white pine; bare winter maples
 * stand in for dead trees); palms, bushes, ferns, rocks and pebbles grow from its nature generators,
 * so no two neighbours match; grass, flowers and ore rocks stay catalog models.
 */
export const scatterModels: Record<string, ModelConfig | ScatterGeneratorItem> = {
  palm: grown("nature.palm", "coconut", { height: 9, frondLength: 3.6 }),
  tree: tree("acer-saccharum", 25),
  tree2: tree("acer-saccharum", 34, { leafTint: "#d2e6c0" }),
  tree3: tree("acer-saccharum", 28, { leafTint: "#eef8c4" }),
  pine: tree("pinus-strobus", 30),
  pine2: tree("pinus-strobus", 22, { leafTint: "#c4d8c8" }),
  redwood: tree("pinus-strobus", 110),
  deadtree: tree("acer-saccharum", 20, { day: 20 }),
  rock: grown("nature.rock", "rock", { size: 2.2 }),
  boulder: grown("nature.rock", "boulder", { size: 4.6 }),
  boulder2: grown("nature.rock", "slab", { size: 4.2, flatness: 0.55, moss: 0.4 }),
  bush: undergrowth("nature.bush", "shrub", { width: 1.6, height: 1.3 }),
  berrybush: undergrowth("nature.bush", "berry", { width: 1.6, height: 1.3 }),
  fern: undergrowth("nature.fern", "fern", { frondLength: 1.4 }),
  pebble: grown("nature.rock", "pebbles", { size: 0.42, color: "#b9b2a4" }, 4),
  pebble2: grown("nature.rock", "pebbles", { size: 0.48, count: 4, color: "#cfc7b6" }, 4),
  // The south beach and the jungle wall behind it.
  cycad: undergrowth("nature.palm", "cycad", { height: 1.6 }, 4),
  fanpalm: grown("nature.palm", "fan", { height: 4.5 }, 4),
  treefern: grown("nature.palm", "cycad", { height: 4.2, trunkRadius: 0.18, curve: 0.15, fronds: 14, frondLength: 2.4, frondWidth: 0.55, droop: 0.55, leaflets: 14, frondColor: "#3d7a33", tipColor: "#6f9c3c" }, 4),
  driftwood: grown("nature.driftwood", "driftwood", {}, 4),
  log: grown("nature.driftwood", "fallen-log", {}, 3),
  bracken: undergrowth("nature.fern", "bracken", {}, 4),
  shrub: undergrowth("nature.bush", "shrub", { width: 2.2, height: 1.8, leafSize: 0.22, leafColor: "#3e7430" }, 4),
  jungletree: tree("acer-saccharum", 60, { leafTint: "#b4d49c" }),
  youngtree: tree("acer-saccharum", 12, { leafTint: "#c8e4b0" }),
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
