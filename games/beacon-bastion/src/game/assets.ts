import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** One KayKit family: adventurer raiders and their weapons, the skeleton host, hexagon buildings, forest. */
export const ASSET_SOURCE_IDS = [
  "kaykit-adventurers",
  "kaykit-skeletons",
  "kaykit-medieval-hexagon",
  "kaykit-forest",
] as const;

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [...ASSET_SOURCE_IDS],
});
