import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import { model } from "./modelRef";

export { scatterModels } from "./modelRef";

/** Entity catalog id -> the model it draws. */
export const entityModels: Record<string, ModelConfig> = {
  player: model(idea.hero),
  home: model(idea.home.model),
  ...Object.fromEntries(idea.structures.map((structure) => [structure.id, model(structure.prop)])),
  ...Object.fromEntries(idea.threats.map((threat) => [threat.id, model(threat.model)])),
  ...Object.fromEntries(idea.allies.map((ally) => [ally.id, model(ally.model)])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = {
  ...Object.fromEntries(idea.nodes.map((node) => [node.id, model(node.prop)])),
  ...Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)])),
};
