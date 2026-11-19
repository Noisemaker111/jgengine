import type { ModelConfig } from "../game/playableGame";
import type { EditorMarker } from "./types";

export function parseModelHiddenNodes(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError("hiddenNodes must be an array of nonblank node names");
  }
  for (const name of value) {
    if (typeof name !== "string" || name.trim().length === 0) throw new TypeError("hiddenNodes must be an array of nonblank node names");
  }
  return [...value];
}

/** @capability model-node-visibility read authored per-placement model subtree selections */
export function authoredHiddenNodes(meta: Record<string, unknown> | undefined): readonly string[] | undefined {
  return parseModelHiddenNodes(meta?.["hiddenNodes"]);
}

export function modelWithAuthoredNodeVisibility(model: ModelConfig | undefined, marker: Pick<EditorMarker, "meta"> | undefined): ModelConfig | undefined {
  if (model === undefined) return undefined;
  const hiddenNodes = authoredHiddenNodes(marker?.meta);
  if (hiddenNodes === undefined || (model.hiddenNodes?.length === hiddenNodes.length && hiddenNodes.every((name, index) => model.hiddenNodes![index] === name))) return model;
  return { ...model, hiddenNodes };
}
