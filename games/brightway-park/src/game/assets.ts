import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: ["kaykit-city-builder", "quaternius-stylized-nature", "kaykit-adventurers"],
});

export const materials = buildMaterialCatalog({ basePath: "/materials" });

export const groundMaterial = materials.resolve("ambientcg-grass001")!;
