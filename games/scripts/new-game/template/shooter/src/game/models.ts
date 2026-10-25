import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import { model } from "./modelRef";

export { scatterModels } from "./modelRef";

/** Entity catalog id -> the model it draws. */
export const entityModels: Record<string, ModelConfig> = {
  player: model(idea.hero),
  base: model(idea.base.model),
  ...Object.fromEntries(idea.enemies.map((enemy) => [enemy.id, model(enemy.model)])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = {
  ...Object.fromEntries(idea.cover.map((ref, index) => [`cover${index + 1}`, model(ref)])),
  ...Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)])),
};
