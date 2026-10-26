import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan } from "@jgengine/core/model/resolveModel";

import { assets } from "./assets";

const NATURE = "/models/imported/quaternius-stylized-nature";
const nature = (file: string, targetHeight: number): ModelConfig => ({ url: `${NATURE}/${file}.glb`, targetHeight });
/** A rock tinted to read as the ore it holds. */
const ore = (file: string, targetHeight: number, material: NonNullable<ModelConfig["material"]>): ModelConfig => ({ ...nature(file, targetHeight), material });

const creature = (file: string, targetHeight: number): ModelConfig => ({ url: `/models/imported/creatures/${file}.glb`, animation: "auto", targetHeight });

/**
 * The survivor and the creatures. Only the raptor is its real animal; the dodo is a duck and the
 * phiomia a boar until dinosaur models land (README "Gap to target").
 */
export const entityModels: Record<string, ModelConfig> = {
  ...resolveModelPlan(assets, { player: { model: "asset:person_casual", style: { targetHeight: 1.8 } } }),
  raptor: creature("velociraptor", 1.7),
  phiomia: creature("wild_boar", 1.9),
  dodo: libraryModel("creature/duck", { targetHeight: 0.8 }),
};

export const objectModels: Record<string, ModelConfig> = {};

/** Scatter palette item (the island's forests, rocks and bushes in editor.scene.json) → the model it draws. */
export const scatterModels: Record<string, ModelConfig> = {
  palm: nature("CommonTree_3", 9),
  tree: nature("CommonTree_1", 11),
  tree2: nature("CommonTree_2", 10),
  tree3: nature("CommonTree_5", 12),
  pine: nature("Pine_2", 13),
  pine2: nature("Pine_3", 11),
  rock: nature("Rock_Medium_2", 1.6),
  boulder: nature("Rock_Medium_1", 3.4),
  boulder2: nature("Rock_Medium_3", 3),
  bush: nature("Bush_Common", 1.3),
  berrybush: nature("Bush_Common_Flowers", 1.3),
  fern: nature("Fern_1", 1),
  pebble: nature("Pebble_Round_1", 0.35),
  pebble2: nature("Pebble_Round_3", 0.35),
  grass: nature("Grass_Common_Tall", 0.7),
  // ARK's redwoods tower over everything else on the island; at 3/8 scale they still stand ~30 m.
  redwood: nature("Pine_1", 30),
  deadtree: nature("DeadTree_1", 8),
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
