import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** Preferred CC0 packs — pull + reindex to light up MODEL_PLAN ids. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [
    "quaternius-modular-scifi",
    "quaternius-stylized-nature",
    "kaykit-adventurers",
    "kaykit-furniture",
    "kaykit-space-base",
  ],
});

const materials = buildMaterialCatalog({ basePath: "/materials" });
export const HABITAT_FLOOR_MATERIAL = materials.resolve("ambientcg-metalplates001")!.maps;
