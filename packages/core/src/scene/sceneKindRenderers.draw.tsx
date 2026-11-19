/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactElement } from "@jgengine/core/ui/jsx";

import type { EditorDocument } from "@jgengine/core/editor/index";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import type { TerrainField } from "@jgengine/core/terrain/terrain";

export interface SceneKindRenderContext {
  document: EditorDocument;
  field: TerrainField;
  assets?: AssetCatalog;
  groundColorAt?: (x: number, z: number) => string;
}

export type SceneKindRenderer = (props: { objects: readonly SceneKindObject[]; context: SceneKindRenderContext }) => ReactElement | null;

const renderers = new Map<string, SceneKindRenderer>();

/**
 * Register the runtime renderer for a scene kind — the shell half of the #809 seam. `AuthoredScene`
 * groups a document's objects by kind and mounts the registered renderer for each, so a new studio
 * renders from the document with no fork of `AuthoredScene`. Idempotent per kind (last wins).
 */
export function registerSceneKindRenderer(kind: string, renderer: SceneKindRenderer): void {
  renderers.set(kind, renderer);
}

/** @internal — `AuthoredScene` uses it internally. */
export function getSceneKindRenderer(kind: string): SceneKindRenderer | undefined {
  return renderers.get(kind);
}

/** @internal */
export function renderedSceneKinds(): string[] {
  return [...renderers.keys()];
}
