import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** CC0 packs present in the runner's `/models`: KayKit adventurers for the warriors, KayKit
 * city-builder blocks for the keeps, Quaternius nature for cover. Missing ids soft-fall-back to
 * primitives, so the skirmish stays legible even before a pack is pulled. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: ["kaykit-adventurers", "kaykit-city-builder", "quaternius-stylized-nature", "kaykit-dungeon"],
});
