/**
 * Asset lookup boundary for the builder core.
 *
 * Model decor items reference assets by `modelKey`. The core never reads an
 * app catalog or a mesh cache directly — the host injects this context, which
 * keeps the builder usable outside LLMville (or in tests) with any catalog.
 */
import type { AssetFrame, MeasuredAssetExtents } from "@llmville/game/world/assetFrame";
import type { GridFootprint } from "@llmville/game/world/grid";

/** Subset of a catalog entry the builder needs to place and measure a model. */
export interface BuilderModelAsset {
  label?: string;
  modelPath?: string;
  footprint?: GridFootprint;
  frame?: AssetFrame;
  defaultScale?: number | [number, number, number];
  basePosition?: [number, number, number];
  baseRotation?: [number, number, number];
  baseScale?: number | [number, number, number];
}

export interface BuilderAssetContext {
  /** Resolve a catalog entry for a model key, or null when unknown. */
  getModelAsset(modelKey: string): BuilderModelAsset | null;
  /** Measured extents of a loaded model file, when available at runtime. */
  getMeasuredModelBounds(modelPath: string): MeasuredAssetExtents | undefined;
}

/** Context with no catalog — model items fall back to footprint-based bounds. */
export const EMPTY_BUILDER_ASSET_CONTEXT: BuilderAssetContext = {
  getModelAsset: () => null,
  getMeasuredModelBounds: () => undefined,
};
