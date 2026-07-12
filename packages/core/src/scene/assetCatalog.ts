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
