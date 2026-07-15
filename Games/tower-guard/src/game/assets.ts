import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({ basePath: "/models", sources: ["kenney-castle"] });
assets.register("scatter/pine", { url: "/models/kenney-castle/tree-small.glb" });
