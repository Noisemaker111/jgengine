import type { AssetSpace } from "./assetSpace";

/** Measured horizontal footprint, footprint center, and lowest Y of a model in model space. */
export interface ModelDims {
  footprint: { w: number; d: number };
  center: { x: number; z: number };
  minY: number;
}

export interface ModelAssetRef {
  url: string;
  /** Measured at asset reindex: horizontal footprint, footprint center, and lowest Y in model space (pre-scale). Lets the shell auto-center and ground-snap corner-pivot kit models. */
  dims?: ModelDims;
  /** Authored asset-space metadata — canonical facing (degrees), source-unit scale, footprint, anchor, bounds, and rotation policy. The upstream owner of placement corrections; see {@link "scene/assetSpace".AssetSpace}. */
  space?: AssetSpace;
}

/**
 * A catalog entry backed by a registered {@link registerAssetGenerator} instead of a GLB URL — a
 * slider-driven parametric prop (bookcase, building). `defaults` seeds a fresh placement's params.
 * Placed instances persist `{ assetId, params, seed }` in the scene and re-resolve at runtime.
 */
export interface GeneratorAssetRef {
  kind: "generator";
  /** Id of the registered generator this asset resolves through. */
  generatorId: string;
  /** Default params stamped onto a fresh placement's meta. */
  defaults?: Record<string, unknown>;
  /** Authored asset-space metadata — canonical facing (degrees), footprint, anchor, bounds, and rotation policy; see {@link "scene/assetSpace".AssetSpace}. */
  space?: AssetSpace;
}

/** A catalog entry: a static GLB model, or a parametric generator. */
export type AssetRef = ModelAssetRef | GeneratorAssetRef;

/** True when a catalog entry is a parametric generator rather than a static GLB. @internal */
export function isGeneratorAsset(ref: AssetRef): ref is GeneratorAssetRef {
  return (ref as GeneratorAssetRef).kind === "generator";
}

export interface AssetCatalog<TMeta extends ModelAssetRef = ModelAssetRef> {
  register(id: string, asset: TMeta): void;
  resolve(id: string): TMeta | null;
  has(id: string): boolean;
  ids(): readonly string[];
}

export function createAssetCatalog<TMeta extends ModelAssetRef = ModelAssetRef>(): AssetCatalog<TMeta> {
  const assets = new Map<string, TMeta>();

  return {
    register(id, asset) {
      assets.set(id, asset);
    },
    resolve(id) {
      return assets.get(id) ?? null;
    },
    has(id) {
      return assets.has(id);
    },
    ids() {
      return Array.from(assets.keys());
    },
  };
}
