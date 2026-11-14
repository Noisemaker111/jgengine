import { buildCatalog } from "@jgengine/assets/catalogs/build";
import {
  kaykitCityBuilder,
  quaterniusAnimatedCharactersPack,
  quaterniusFantasyProps,
  quaterniusLowPolyDesertAssets,
  quaterniusLowPolyFoodPack,
  quaterniusLowpolyBuildingsPack,
  quaterniusLowpolyModularStreetPack,
  quaterniusStylizedNature,
  quaterniusTexturedCuteMonsterPack,
} from "@jgengine/assets/generated/packs";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  packs: [
    kaykitCityBuilder, quaterniusStylizedNature, quaterniusAnimatedCharactersPack, quaterniusLowpolyModularStreetPack, quaterniusLowPolyFoodPack, quaterniusLowpolyBuildingsPack,
    // The haunt's own: candles, cauldrons, crockery and barrels; bones; and the bats over the pier.
    quaterniusFantasyProps, quaterniusLowPolyDesertAssets, quaterniusTexturedCuteMonsterPack,
  ],
});

export const materials = buildMaterialCatalog({ basePath: "/materials" });

export const groundMaterial = materials.resolve("ambientcg-grass001")!;
