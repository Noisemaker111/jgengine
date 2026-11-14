import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { kaykitFurniture, quaterniusFantasyProps, quaterniusLowPolyFoodPack, quaterniusToonShooter } from "@jgengine/assets/generated/packs";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/**
 * The household props the giant house borrows: KayKit's furniture (couch, armchair, beds, rugs,
 * lamps), Quaternius' food pack (bread, jars, cutlery, plates), fantasy props (mugs, books, chests,
 * candlesticks) and toon-shooter clutter (boxes, cans, tyres). All CC0, all scaled up to an
 * inch-high Little's view. Everything else in the house is original procedural geometry.
 */
const MODEL_PACKS = [kaykitFurniture, quaterniusLowPolyFoodPack, quaterniusFantasyProps, quaterniusToonShooter];
export const houseAssets: AssetCatalog = buildCatalog({ basePath: "/models", packs: MODEL_PACKS });
/** Every pack this game pulls, for provisioning and credits. */
export const ASSET_SOURCE_IDS: readonly string[] = MODEL_PACKS.map(pack => pack.id);
