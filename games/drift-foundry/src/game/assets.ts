import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

const MODEL_SOURCES = ["kaykit-city-builder", "kaykit-space-base", "quaternius-5-low-poly-animals"] as const;
/** Packed dirt on the yard and dark cracked asphalt on the racing line, named by the shared material library. */
const GROUND_SOURCES = ["ambientcg-ground025", "ambientcg-asphalt012"] as const;
/**
 * Scans behind the shared library's corridor facades (`metal/rust`, `concrete/rough`,
 * `metal/corrugated`). Declared here so `bun run provision` pulls them and the credits screen names
 * their authors; the zones select them by library name, never by these ids.
 */
const FACADE_MATERIAL_SOURCES = [
  "ambientcg-rust007",
  "ambientcg-concrete025",
  "ambientcg-corrugatedsteel009",
] as const;

/** Every pack this game ships — the credits screen is generated from it, so it cannot drift. */
export const ASSET_SOURCE_IDS: readonly string[] = [
  ...MODEL_SOURCES,
  ...GROUND_SOURCES,
  ...FACADE_MATERIAL_SOURCES,
];

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [...MODEL_SOURCES],
});
