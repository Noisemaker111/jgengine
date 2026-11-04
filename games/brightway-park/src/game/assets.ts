import { buildCatalog } from "@jgengine/assets/catalogs/build";
import {
  kaykitCityBuilder,
  quaterniusAnimatedCharactersPack,
  quaterniusLowPolyFoodPack,
  quaterniusLowpolyBuildingsPack,
  quaterniusLowpolyModularStreetPack,
  quaterniusStylizedNature,
} from "@jgengine/assets/generated/packs";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  packs: [kaykitCityBuilder, quaterniusStylizedNature, quaterniusAnimatedCharactersPack, quaterniusLowpolyModularStreetPack, quaterniusLowPolyFoodPack, quaterniusLowpolyBuildingsPack],
});

export const materials = buildMaterialCatalog({ basePath: "/materials" });

export const groundMaterial = materials.resolve("ambientcg-grass001")!;
