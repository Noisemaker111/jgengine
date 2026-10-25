import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import { model } from "./modelRef";

export { scatterModels } from "./modelRef";

/** Entity catalog id -> the model it draws. */
export const entityModels: Record<string, ModelConfig> = {
  car: model(idea.car),
  ...Object.fromEntries(idea.rivals.map((ref, index) => [`rival${index + 1}`, model(ref)])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = {
  trackside: model(idea.trackside),
  ...Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)])),
};
