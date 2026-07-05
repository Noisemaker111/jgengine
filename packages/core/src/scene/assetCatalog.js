export function createAssetCatalog() {
    const assets = new Map();
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
