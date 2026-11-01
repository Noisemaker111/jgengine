import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/**
 * Quaternius' CC0 low-poly cars give traffic its bodies beyond the library's one sports car: real
 * 4 m sedans, a taxi and a coupe, resprayed into the city's palette (see `world/models.ts`).
 */
const MODEL_SOURCES = ["quaternius-lowpoly-cars"] as const;

/**
 * Ground grain under the isle's authored sand/scrub palette. Blended at a low `tint` so the beach,
 * the pavement washes, and the dry inland scrub keep their colours and take only the map's light
 * and shade — the isle is hand-tinted, so a stock albedo painting over it would flatten every
 * region to one tan.
 */
const GROUND_MATERIAL = "ambientcg-ground055s";

/**
 * The scans behind the library surfaces the streets and buildings name (`asphalt/dark-cracked`,
 * `concrete/smooth`, `paving/stone`, and the `facade/*` brick and glass walls), listed by source id so provisioning
 * pulls them.
 */
const SURFACE_MATERIALS = [
  "ambientcg-asphalt012",
  "ambientcg-concrete006",
  "ambientcg-pavingstones002",
  "ambientcg-facade018a",
  "ambientcg-facade019a",
  "ambientcg-facade020a",
  "ambientcg-facade006",
] as const;

/** Every pack this game ships — credits are generated from it, so it cannot drift. */
export const ASSET_SOURCE_IDS: readonly string[] = [...MODEL_SOURCES, GROUND_MATERIAL, ...SURFACE_MATERIALS];

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [...MODEL_SOURCES],
});

const materials = buildMaterialCatalog({ basePath: "/materials" });

export const GROUND_MAPS = (() => {
  const material = materials.resolve(GROUND_MATERIAL);
  if (material === null) throw new Error(`harbor-heat: missing PBR material "${GROUND_MATERIAL}" — run assets pull`);
  return material.maps;
})();
