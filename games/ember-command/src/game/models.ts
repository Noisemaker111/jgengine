import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { authoredModels } from "./authoredModels";

// Ember Command's own stone-and-copper miniature set; bundled through Vite so both
// the standalone game and consuming engine hosts load the same reviewed models.
const heights: Record<keyof typeof authoredModels, number> = {
  peasant: 2, footman: 2.3, rifleman: 2.2, hero: 2.65,
  grunt: 2.3, reaver: 2.65, keep_player: 7, keep_enemy: 7, warcamp: 5.5,
  barracks: 5, farm: 3.6, guard_tower: 6.5,
  banner_blue: 2.6, banner_red: 2.6, torch: 1.8, barrel: 1.2,
  goldmine: 2.6, woods: 4.6,
};
const warriors = new Set(["peasant", "footman", "rifleman", "hero", "grunt", "reaver"]);
// Rank-and-file troops share one model per kind and play only idle/walk, so a batch reproduces them
// at any distance: a full battle draws a handful of instanced batches instead of ~17 draws a unit.
// The hero keeps its own rig - one unique character is not worth a batch. The engine's default
// capacity (128 a kind) keeps any overflow on its own rig rather than dropping it.
const BATCHED_TROOPS = new Set(["peasant", "footman", "rifleman", "grunt", "reaver"]);
export const entityModels: Record<string, ModelConfig> = Object.fromEntries(
  Object.entries(authoredModels).map(([id, url]) => [id, {
    url, targetHeight: heights[id as keyof typeof heights],
    ...(warriors.has(id) ? { animation: { states: { idle: "Idle", walk: "Walking_A", walkSpeed: .1 }, clock: "game" } } : {}),
    ...(BATCHED_TROOPS.has(id) ? { lod: { crowdDistance: 0 } } : {}),
  }]),
);
// The authored forest ring uses the SDK's instanced vegetation meshes.
export const scatterModels: Record<string, string> = {};
