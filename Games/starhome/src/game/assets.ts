import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: ["kenney-furniture", "kenney-space", "kenney-nature", "kenney-mini-characters"],
});

const materials = buildMaterialCatalog({ basePath: "/materials" });
export const HABITAT_FLOOR_MATERIAL = materials.resolve("ambientcg-metalplates001")!.maps;
