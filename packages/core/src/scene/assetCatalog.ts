export interface ModelAssetRef {
  url: string;
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
