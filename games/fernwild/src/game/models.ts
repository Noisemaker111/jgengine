import { librarySurfaceScan } from "@jgengine/assets/catalogs/materialLibrary";
import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { WornLayer } from "@jgengine/core/anim/wearable/wornRegion";
import type { ModelAttachment, ModelConfig } from "@jgengine/core/game/playableGame";
import type { ScatterGeneratorItem } from "@jgengine/core/scatter/scatterGenerator";
import type { ScatterSolidSpec } from "@jgengine/core/scatter/scatterSolids";

import { BODIES } from "./character";
import { SPECIES_MODELS } from "./data/creatureModels";
import { HARVESTABLES } from "./data/harvestables";
import { itemDef } from "./data/items";

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

/** Rough plant-fibre weave: ambientCG's CC0 canvas scan ("ambientcg-fabric007") for the grain, each piece keeping its own dye. */
const FIBRE = librarySurfaceScan("fabric/canvas", { tint: 0, repeat: 0.35 });

/** ARK's cloth set in undyed tans and browns, each drawn over the body area its slot covers. */
const CLOTH_DYES: Record<string, string> = {
  cloth_hat: "#8a6a43",
  cloth_shirt: "#a3845a",
  cloth_pants: "#6c5034",
  cloth_gloves: "#5c432c",
  cloth_boots: "#4b3622",
};

const WORN: Record<string, WornLayer> = Object.fromEntries(
  Object.entries(CLOTH_DYES).flatMap(([item, color]) => {
    const slot = itemDef(item)?.wear?.slot;
    return slot === undefined ? [] : [[item, { region: slot, material: { color, roughness: 0.97, scan: FIBRE } }]];
  }),
);

/** The model-library names the survivor, its creator bodies and its tools draw, for the credits. */
export const SURVIVOR_MODELS: readonly string[] = [...new Set([SURVIVOR, ...BODIES.map((body) => body.model), ...Object.values(TOOLS).map((tool) => tool.model)])];

/**
 * The survivor and every species: free animal models (data/creatureModels.ts), each drawn at the
 * species' standing height and tinted where a relative stands in for it.
 */
export const entityModels: Record<string, ModelConfig> = {
  player: { ...libraryModel(SURVIVOR), held: HELD, worn: WORN, looks: Object.fromEntries(BODIES.map((body) => [body.id, libraryModel(body.model)])) },
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

/** The island's tree look: textured leaf cards over the grown wood, lit, a touch more saturated than life. */
const TREE_LOOK = { foliage: "leaves", shading: "lit", saturation: 1.15, brightness: 1.05, barkGrain: true };

/**
 * A tree grown by the plant simulation: a species at an age (and day of year). Every tree grows from
 * its own seed; the nearest few of each kind draw as their own mesh, the rest as shared stand-ins.
 */
const tree = (species: string, age: number, params: Record<string, unknown> = {}): ScatterGeneratorItem => ({
  generator: "plant.grown",
  params: { species, age, ...TREE_LOOK, ...params },
  variants: "unique",
  heroes: 10,
  heroDistance: 35,
  detail: 0.25,
  heroDetail: 0.5,
});

/**
 * Undergrowth grown by the plant simulation (a shrub, fern or young palm): a species at an age. It
 * stands by the thousand, so it shares a few seeded variants at the lighter leaf budget.
 */
const shrub = (species: string, age: number, params: Record<string, unknown> = {}, variants = 6): ScatterGeneratorItem => ({
  generator: "plant.grown",
  params: { species, age, ...TREE_LOOK, ...params },
  variants,
  detail: 0.5,
});

/**
 * Scatter palette item (the island's forests, rocks and bushes in editor.scene.json) → what it draws.
 * Every plant is grown by the engine's plant simulation: sugar maple and white pine (dead trees are
 * maple snags left standing 8 years), highbush blueberry bushes, coconut and cabbage palms, Hawaiian
 * tree ferns, sword fern and bracken. Rocks, pebbles and driftwood grow from its nature generators,
 * so no two neighbours match; grass, flowers and ore rocks stay catalog models.
 */
export const scatterModels: Record<string, ModelConfig | ScatterGeneratorItem> = {
  palm: tree("cocos-nucifera", 9),
  tree: tree("acer-saccharum", 25),
  tree2: tree("acer-saccharum", 34, { leafTint: "#d2e6c0" }),
  tree3: tree("acer-saccharum", 28, { leafTint: "#eef8c4" }),
  pine: tree("pinus-strobus", 30),
  pine2: tree("pinus-strobus", 22, { leafTint: "#c4d8c8" }),
  redwood: tree("pinus-strobus", 110),
  deadtree: tree("acer-saccharum", 40, { deadYears: 8 }),
  rock: grown("nature.rock", "rock", { size: 2.2, erosion: 0.2, smooth: true, crag: 0.9 }),
  boulder: grown("nature.rock", "boulder", { size: 4.6, erosion: 0.2, smooth: true, crag: 0.8 }),
  boulder2: grown("nature.rock", "slab", { size: 4.2, flatness: 0.55, moss: 0.4, smooth: true, crag: 0.8 }),
  bush: shrub("vaccinium-corymbosum", 4),
  berrybush: shrub("vaccinium-corymbosum", 4, { leafScale: 3.2 }),
  fern: shrub("polystichum-munitum", 8),
  pebble: grown("nature.rock", "pebbles", { size: 0.42, color: "#b9b2a4", smooth: true }, 4),
  pebble2: grown("nature.rock", "pebbles", { size: 0.48, count: 4, color: "#cfc7b6", smooth: true }, 4),
  // The south beach and the jungle wall behind it.
  cycad: shrub("cocos-nucifera", 3, {}, 4),
  fanpalm: shrub("sabal-palmetto", 20, {}, 4),
  treefern: shrub("cibotium-glaucum", 25, {}, 4),
  // Weathered stone standing out on the sand and in the surf, pale and barely mossed.
  seaboulder: grown("nature.rock", "boulder", { size: 6.5, stretch: 1.15, flatness: 0.95, facets: 6, erosion: 0.6, sink: 0.25, moss: 0.08, color: "#a39b8d", colorVariance: 0.16, smooth: true, crag: 0.6 }),
  searock: grown("nature.rock", "boulder", { size: 2.6, stretch: 1.3, flatness: 0.7, facets: 7, erosion: 0.5, sink: 0.2, moss: 0.05, color: "#9d9586", smooth: true, crag: 0.5 }, 4),
  driftwood: grown("nature.driftwood", "driftwood", {}, 4),
  log: grown("nature.driftwood", "fallen-log", {}, 3),
  bracken: shrub("pteridium-aquilinum", 6, {}, 4),
  shrub: shrub("vaccinium-corymbosum", 6, { leafTint: "#d8ecc8" }, 4),
  jungletree: tree("cocos-nucifera", 16, { leafTint: "#cfe0b8" }),
  youngtree: shrub("sabal-palmetto", 28, {}, 4),
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

/** How tall each rock stands above the sand, in metres at scale 1: the grown shapes' and ore models' heights. */
const ROCK_HEIGHTS: Readonly<Record<string, number>> = {
  rock: 0.8,
  searock: 1,
  boulder: 1.7,
  boulder2: 1.2,
  seaboulder: 3,
  metal_rock: 2.6,
  obsidian_rock: 2.2,
  crystal: 1.4,
  oil_rock: 1.8,
};

/**
 * The rocks the survivor walks around instead of through, as in ARK: each blocks with a box as wide
 * as its harvest radius and as tall as the rock. Pebbles, plants and trees stay walk-through.
 */
export const rockSolids: Record<string, ScatterSolidSpec> = Object.fromEntries(
  Object.entries(ROCK_HEIGHTS).map(([item, height]) => [item, { radius: (HARVESTABLES[item]?.radius ?? 1) * 0.85, height }]),
);
