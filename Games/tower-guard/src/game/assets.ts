import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({ basePath: "/models" });
