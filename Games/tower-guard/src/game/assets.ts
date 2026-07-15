import { createAssetCatalog, type AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = createAssetCatalog();
assets.register("scatter/pine", { url: "/models/kenney-castle/tree-small.glb" });
