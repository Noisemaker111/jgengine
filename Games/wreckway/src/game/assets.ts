import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: ["kaykit-city-builder", "kaykit-dungeon"],
});

const materials = buildMaterialCatalog({ basePath: "/materials" });
export const YARD_FLOOR_MATERIAL = materials.resolve("ambientcg-metalplates001")!.maps;
