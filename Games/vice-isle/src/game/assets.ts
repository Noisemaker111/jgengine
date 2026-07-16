import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** Preferred CC0 packs — pull + reindex to light up MODEL_PLAN ids. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [
    "quaternius-stylized-nature",
    "quaternius-medieval-village",
    "kaykit-adventurers",
    "kaykit-furniture",
    "kaykit-dungeon",
    "kaykit-space-base",
  ],
});
