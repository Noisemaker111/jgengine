import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: ["kenney-racing", "kenney-nature", "kenney-city-roads", "kenney-mini-characters", "kenney-survival"],
});
