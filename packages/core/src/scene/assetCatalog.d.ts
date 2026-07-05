export interface ModelAssetRef {
    url: string;
}
export interface AssetCatalog<TMeta extends ModelAssetRef = ModelAssetRef> {
    register(id: string, asset: TMeta): void;
    resolve(id: string): TMeta | null;
    has(id: string): boolean;
    ids(): readonly string[];
}
export declare function createAssetCatalog<TMeta extends ModelAssetRef = ModelAssetRef>(): AssetCatalog<TMeta>;
