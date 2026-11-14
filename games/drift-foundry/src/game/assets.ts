import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { kaykitCityBuilder, kaykitForest, kaykitSpaceBase, quaternius5LowPolyAnimals, quaterniusToonShooter } from "@jgengine/assets/generated/packs";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/**
 * Catalog packs the store borrows from: the garden centre's trees and shrubs and lamp posts, the
 * conveyor slabs, stockroom cardboard and cones, and the pigeons under the roof. Everything else
 * (carts, shoppers, shelving, products) is original geometry from `scripts/author-models.mjs`.
 */
const MODEL_PACKS = [kaykitCityBuilder, kaykitSpaceBase, kaykitForest, quaterniusToonShooter, quaternius5LowPolyAnimals];
/** Terrazzo under the store and ceramic tile down the aisles, named by the shared material library. */
const GROUND_SOURCES = ["ambientcg-terrazzo005", "ambientcg-tiles007"] as const;
/**
 * Scans behind the shared library's in-store kiosk facades (`plastic/matte`, `concrete/rough`,
 * `metal/corrugated`). Declared here so `bun run provision` pulls them and the credits screen names
 * their authors; the zones select them by library name, never by these ids.
 */
const FACADE_MATERIAL_SOURCES = [
  "ambientcg-plastic006",
  "ambientcg-concrete025",
  "ambientcg-corrugatedsteel009",
] as const;

/** Every pack this game ships — the credits screen is generated from it, so it cannot drift. */
export const ASSET_SOURCE_IDS: readonly string[] = [
  ...MODEL_PACKS.map((pack) => pack.id),
  ...GROUND_SOURCES,
  ...FACADE_MATERIAL_SOURCES,
];

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  packs: MODEL_PACKS,
});
