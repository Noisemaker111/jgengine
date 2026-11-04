import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { kaykitAdventurers, kaykitForest, kaykitMedievalHexagon, kaykitSkeletons } from "@jgengine/assets/generated/packs";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** One KayKit family: adventurer raiders and their weapons, the skeleton host, hexagon buildings, forest. */
const MODEL_PACKS = [kaykitAdventurers, kaykitSkeletons, kaykitMedievalHexagon, kaykitForest];

export const ASSET_SOURCE_IDS: readonly string[] = MODEL_PACKS.map((pack) => pack.id);

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  packs: MODEL_PACKS,
});
