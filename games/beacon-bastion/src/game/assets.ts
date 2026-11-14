import { buildCatalog } from "@jgengine/assets/catalogs/build";
import {
  kaykitCityBuilder,
  kaykitForest,
  quaterniusAnimatedCharactersPack,
  quaterniusLowpolyBuildings,
} from "@jgengine/assets/generated/packs";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/**
 * One cartoony small-town palette: Quaternius characters in work clothes for the workers, Quaternius
 * houses and the town hall, KayKit City Builder shops and street furniture, KayKit Forest yard trees.
 * The technology has no models at all: it is drawn procedurally (`render/techMesh.ts`).
 */
const MODEL_PACKS = [quaterniusAnimatedCharactersPack, quaterniusLowpolyBuildings, kaykitCityBuilder, kaykitForest];

export const ASSET_SOURCE_IDS: readonly string[] = MODEL_PACKS.map((pack) => pack.id);

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  packs: MODEL_PACKS,
});
