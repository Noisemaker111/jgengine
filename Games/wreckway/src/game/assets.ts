import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

const MODEL_SOURCES = ["kaykit-city-builder", "kaykit-dungeon"] as const;
const FLOOR_MATERIAL_SOURCE = "ambientcg-metalplates001";

/** Every pack this game ships — the credits screen is generated from it, so it cannot drift. */
export const ASSET_SOURCE_IDS: readonly string[] = [...MODEL_SOURCES, FLOOR_MATERIAL_SOURCE];

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [...MODEL_SOURCES],
});

const materials = buildMaterialCatalog({ basePath: "/materials" });
export const YARD_FLOOR_MATERIAL = materials.resolve(FLOOR_MATERIAL_SOURCE)!.maps;
