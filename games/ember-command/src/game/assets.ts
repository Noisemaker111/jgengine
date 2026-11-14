import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { quaterniusStylizedNature, quaterniusTexturedCuteMonsterPack } from "@jgengine/assets/generated/packs";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

const MODEL_PACKS = [quaterniusStylizedNature, quaterniusTexturedCuteMonsterPack];

export const ASSET_SOURCE_IDS: readonly string[] = MODEL_PACKS.map((pack) => pack.id);

/**
 * The backyard's plants at ant scale: Quaternius stylized nature (grass, clover, ferns, flowers,
 * mushrooms, pebbles) blown up to tower over the colony, and the cute-monster bee for the bees that
 * drone over the flowers. Ants, beetles, wasps, chambers and food are procedural (`world/bugMeshes.ts`).
 */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  packs: MODEL_PACKS,
});
