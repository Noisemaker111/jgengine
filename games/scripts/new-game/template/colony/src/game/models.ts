import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import { model } from "./modelRef";

export { scatterModels } from "./modelRef";

/** Entity catalog id -> the model it draws: the headquarters, every structure, colonists, nodes and raiders. */
export const entityModels: Record<string, ModelConfig> = {
  hq: model(idea.hq.model),
  ...Object.fromEntries(idea.structures.map((structure) => [structure.id, model(structure.model)])),
  ...Object.fromEntries(idea.colonists.models.map((ref, index) => [`colonist${index + 1}`, model(ref)])),
  ...Object.fromEntries(idea.nodes.map((node) => [node.id, model(node.model)])),
  ...Object.fromEntries(idea.raiders.kinds.map((raider) => [raider.id, model(raider.model)])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)]));
