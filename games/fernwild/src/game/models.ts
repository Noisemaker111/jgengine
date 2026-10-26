import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan } from "@jgengine/core/model/resolveModel";

import { assets } from "./assets";

const NATURE = "/models/imported/quaternius-stylized-nature";
const nature = (file: string, targetHeight: number): ModelConfig => ({ url: `${NATURE}/${file}.glb`, targetHeight });

/** The survivor; creatures arrive with taming. */
export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  player: { model: "asset:person_casual", style: { targetHeight: 1.8 } },
});

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
};
