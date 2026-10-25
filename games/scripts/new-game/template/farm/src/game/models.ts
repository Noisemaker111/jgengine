import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import { model } from "./modelRef";

export { scatterModels } from "./modelRef";

/** Entity catalog id -> the model it draws. */
export const entityModels: Record<string, ModelConfig> = {
  player: model(idea.hero),
  ...Object.fromEntries(idea.villagers.map((villager) => [villager.id, model(villager.model)])),
  ...Object.fromEntries(idea.animals.map((animal, index) => [`animal${index + 1}`, model(animal)])),
  ...Object.fromEntries(idea.crops.flatMap((crop) => [[`sprout_${crop.id}`, model(crop.sprout)], [`ripe_${crop.id}`, model(crop.ripe)]])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = {
  cottage: model(idea.home.model),
  stall: model(idea.stall.model),
  market: model(idea.market.model),
  ...Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)])),
};
