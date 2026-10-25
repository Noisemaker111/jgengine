import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import type { ModelRef } from "./ideaShape";

/** A model from `idea.ts`: a path is a file the game serves; a bare name is from the realistic model library. */
export function model(ref: ModelRef): ModelConfig {
  const drawn: ModelConfig = ref.model.startsWith("/")
    ? { url: ref.model, animation: "auto", ...(ref.height === undefined ? {} : { targetHeight: ref.height }) }
    : libraryModel(ref.model, ref.height === undefined ? {} : { targetHeight: ref.height });
  return ref.tint === undefined ? drawn : { ...drawn, material: { ...drawn.material, color: ref.tint } };
}

/** Scatter palette item (forests, rocks, flowers in `editor.scene.json`) -> the model it draws. */
export const scatterModels: Record<string, ModelConfig> = Object.fromEntries(
  Object.entries(idea.world.scatter).map(([item, ref]) => [item, model(ref)]),
);
