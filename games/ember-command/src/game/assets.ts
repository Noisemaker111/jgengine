import { buildCatalog } from "@jgengine/assets/catalogs/build";
import {
  quaternius5LowPolyAnimals,
  quaterniusFantasyProps,
  quaterniusLowpolyCropsPack,
  quaterniusLowpolyMedievalBuildings,
  quaterniusLowpolyMedievalVillagePack,
  quaterniusLowpolyRpgCharacters,
  quaterniusStylizedNature,
} from "@jgengine/assets/generated/packs";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

const MODEL_PACKS = [
  quaterniusLowpolyRpgCharacters,
  quaterniusLowpolyMedievalVillagePack,
  quaterniusLowpolyMedievalBuildings,
  quaterniusFantasyProps,
  quaterniusStylizedNature,
  quaterniusLowpolyCropsPack,
  quaternius5LowPolyAnimals,
];

export const ASSET_SOURCE_IDS: readonly string[] = MODEL_PACKS.map((pack) => pack.id);

/** One studio, one proportion: Quaternius characters, village, buildings, props and stylized nature. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  packs: MODEL_PACKS,
});
