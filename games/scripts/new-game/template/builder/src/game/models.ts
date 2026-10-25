import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import { model } from "./modelRef";

export { scatterModels } from "./modelRef";

/** Entity catalog id -> the model it draws: the seat, every building, the people on the streets. */
export const entityModels: Record<string, ModelConfig> = {
  seat: model(idea.seat.model),
  ...Object.fromEntries(idea.buildings.map((building) => [building.id, model(building.model)])),
  ...Object.fromEntries(idea.people.walkers.map((walker, index) => [`walker${index + 1}`, model(walker)])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)]));
