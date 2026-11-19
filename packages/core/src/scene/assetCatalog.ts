import type { AssetSpace } from "./assetSpace";
import type { CollisionMeshData } from "./collisionMesh";

export interface ModelDims {
  footprint: { w: number; d: number };
  center: { x: number; z: number };
  minY: number;
  maxY?: number;
}

export interface ModelAssetRef {
  url: string;
  /** Preserve a composed prefab's authored local origin instead of recentering its measured bounds. */
  anchor?: "center" | "origin";
  dims?: ModelDims;
  collisionMesh?: CollisionMeshData;
  /** Authored asset-space metadata — canonical facing (degrees), source-unit scale, footprint, anchor, bounds, and rotation policy. The upstream owner of placement corrections; see {@link "scene/assetSpace".AssetSpace}. */
  space?: AssetSpace;
  /** Animation clip names read from the GLB at asset reindex. Lets the shell auto-animate rigged catalog assets (semantic clip roles → default idle/walk/run + one-shots) with no game-side clip strings. */
  clips?: readonly string[];
}

/**
 * A catalog entry backed by a registered parts generator (`registerGenerator`, output `"parts"`) instead of a GLB URL — a
 * slider-driven parametric prop (bookcase, building). `defaults` seeds a fresh placement's params.
 * Placed instances persist `{ assetId, params, seed }` in the scene and re-resolve at runtime.
 */
export interface GeneratorAssetRef {
  kind: "generator";
  generatorId: string;
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
