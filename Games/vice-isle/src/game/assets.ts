import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** Preferred CC0 packs — KayKit city-builder has buildings + cars. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [
    "kaykit-city-builder",
    "kaykit-space-base",
    "kaykit-adventurers",
    "quaternius-stylized-nature",
    "kaykit-furniture",
    "kaykit-dungeon",
  ],
});
