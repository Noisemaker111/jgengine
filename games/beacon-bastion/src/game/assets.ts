import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** Preferred CC0 packs for re-home (#807) - pull + reindex to light up MODEL_PLAN. */
export const ASSET_SOURCE_IDS = [
  "quaternius-medieval-village",
  "quaternius-stylized-nature",
  "kaykit-dungeon",
  "kaykit-adventurers",
  "kaykit-skeletons",
] as const;

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [...ASSET_SOURCE_IDS],
});
