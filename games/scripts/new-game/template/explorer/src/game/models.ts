import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import { model } from "./modelRef";

export { scatterModels } from "./modelRef";

/** Entity catalog id -> the model it draws. */
export const entityModels: Record<string, ModelConfig> = {
  player: model(idea.hero),
  goal: model(idea.goal.model),
  ...Object.fromEntries(idea.landmarks.flatMap((landmark) => (landmark.guardian === undefined ? [] : [[landmark.guardian.id, model(landmark.guardian.model)]]))),
  ...Object.fromEntries(idea.landmarks.flatMap((landmark) => (landmark.relic === undefined ? [] : [[`relic_${landmark.id}`, model(landmark.relic.model)]]))),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = {
  pedestal: model(idea.pedestal),
  ...Object.fromEntries(idea.landmarks.map((landmark) => [`lm_${landmark.id}`, model(landmark.centerpiece)])),
  ...Object.fromEntries(idea.landmarks.flatMap((landmark) => landmark.ruins.map((ref, index) => [`ruin_${landmark.id}_${index + 1}`, model(ref)]))),
  ...Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)])),
};
