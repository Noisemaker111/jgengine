import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import { model } from "./modelRef";

export { scatterModels } from "./modelRef";

/** Entity catalog id -> the model it draws: the core, every tower, everything that marches. */
export const entityModels: Record<string, ModelConfig> = {
  core: model(idea.core.model),
  ...Object.fromEntries(idea.towers.map((tower) => [tower.id, model(tower.model)])),
  ...Object.fromEntries(idea.creeps.map((creep) => [creep.id, model(creep.model)])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = {
  pad: model(idea.pad),
  ...Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)])),
};
