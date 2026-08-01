import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** Preferred CC0 packs — KayKit city-builder has buildings + cars. */
const MODEL_SOURCES = [
  "kaykit-city-builder",
  "kaykit-space-base",
  "kaykit-adventurers",
  "quaternius-stylized-nature",
  "kaykit-furniture",
  "kaykit-dungeon",
] as const;

/**
 * Ground grain under the isle's authored sand/scrub palette. Blended at a low `tint` so the beach,
 * the pavement washes, and the dry inland scrub keep their colours and take only the map's light
 * and shade — the isle is hand-tinted, so a stock albedo painting over it would flatten every
 * region to one tan.
 */
const GROUND_MATERIAL = "ambientcg-ground025";

/** Every pack this game ships — credits are generated from it, so it cannot drift. */
export const ASSET_SOURCE_IDS: readonly string[] = [...MODEL_SOURCES, GROUND_MATERIAL];

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [...MODEL_SOURCES],
});

const materials = buildMaterialCatalog({ basePath: "/materials" });

export const GROUND_MAPS = (() => {
  const material = materials.resolve(GROUND_MATERIAL);
  if (material === null) throw new Error(`vice-isle: missing PBR material "${GROUND_MATERIAL}" — run assets pull`);
  return material.maps;
})();
