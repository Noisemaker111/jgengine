import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/core/model/resolveModel";

import { assets } from "./assets";

const NATURE = "quaternius-stylized-nature";

/**
 * Every unit, chamber and food pile is a procedural body (`world/bugMeshes.ts`, routed through the
 * scene's `renderEntity`), so no entity kind maps to a catalog model.
 */
export const entityModels: Record<string, ModelConfig> = {};

/** A plant scaled to tower over the ants, swaying in the shared gust field. */
function plant(model: string, height: number, tint?: string, sway = 0.25): ModelPick {
  return {
    model: `${NATURE}/${model}`,
    style: { targetHeight: height, ...(tint === undefined ? {} : { material: { color: tint } }), ...(sway > 0 ? { wind: { strength: sway, speed: 0.9 } } : {}) },
  };
}

/**
 * Scatter palette items in editor.scene.json → the lawn at ant scale: grass blades taller than a nest,
 * clover leaves like umbrellas, ferns, towering flowers, toadstools, pebble boulders and fallen petals.
 */
export const scatterModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  blade: plant("Grass_Wispy_Tall", 8, "#5fbf2e", 0.45),
  tuft: plant("Grass_Common_Tall", 4.5, "#77cf3a", 0.3),
  sprig: plant("Grass_Wispy_Short", 3, "#8fd84a", 0.25),
  clover: plant("Clover_1", 2.6, undefined, 0.12),
  clover_tall: plant("Clover_2", 3.4, undefined, 0.14),
  fern: plant("Fern_1", 6.5, undefined, 0.3),
  daisy: plant("Flower_3_Group", 10, undefined, 0.35),
  bloom: plant("Flower_4_Group", 9, undefined, 0.35),
  toadstool: plant("Mushroom_Common", 4.2, undefined, 0),
  bracket: plant("Mushroom_Laetiporus", 2.2, undefined, 0),
  pebble: { model: `${NATURE}/Pebble_Round_2`, style: { targetHeight: 1.8 } },
  boulder: { model: `${NATURE}/Pebble_Round_4`, style: { targetHeight: 2.8 } },
  slate: { model: `${NATURE}/Pebble_Square_3`, style: { targetHeight: 1.2 } },
  petal: { model: `${NATURE}/Petal_2`, style: { targetHeight: 0.35 } },
});

/** Bees droning over the flowers: the authored habitats' species. */
export const flockModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  bee: { model: "quaternius-textured-cute-monster-pack/Bee", style: { targetHeight: 2.2 } },
});
