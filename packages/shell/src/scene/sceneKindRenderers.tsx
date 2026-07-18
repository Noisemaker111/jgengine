import type { ReactElement } from "react";

import type { EditorDocument } from "@jgengine/core/editor/index";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import type { TerrainField } from "@jgengine/core/world/terrain";

/** Context a scene-kind renderer receives alongside the matching document objects. */
export interface SceneKindRenderContext {
  document: EditorDocument;
  /** Ground field to drape/ground kind geometry on. */
  field: TerrainField;
  /** Catalog for kinds that instance real GLBs (pole assets, etc.). */
  assets?: AssetCatalog;
  /** Terrain surface color at a world XZ — lets kind geometry (grass roots, soil borders) blend into the ground it sits on. */
  groundColorAt?: (x: number, z: number) => string;
}

/** A registered renderer: given every document object of its kind, returns the render tree for them. */
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

/** The renderer registered for a kind, or undefined. @internal — `AuthoredScene` uses it internally. */
export function getSceneKindRenderer(kind: string): SceneKindRenderer | undefined {
  return renderers.get(kind);
}

/** Every kind that has a registered renderer. @internal */
export function renderedSceneKinds(): string[] {
  return [...renderers.keys()];
}
