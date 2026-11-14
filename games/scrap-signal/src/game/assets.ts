import { buildCatalog } from "@jgengine/assets/catalogs/build";
import {
  quaterniusAnimatedLowpolyRobot,
  quaterniusLowPolyDesertAssets,
  quaterniusModularScifi,
  quaterniusStylizedNature,
  quaterniusToonShooter,
} from "@jgengine/assets/generated/packs";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

const MODEL_PACKS = [
  quaterniusModularScifi,
  quaterniusStylizedNature,
  quaterniusToonShooter,
  quaterniusAnimatedLowpolyRobot,
  quaterniusLowPolyDesertAssets,
];

const MATERIAL_SOURCES = {
  /** Ground grain under the lawns and dirt paths, so the yards stop reading as flat vertex colour. */
  ground: "ambientcg-ground031",
  /** Rock for the landscaping boulders and retaining walls. */
  cliff: "ambientcg-rock035",
  /** Scratched plate for junk piles and improvised barricades. */
  scrapMetal: "ambientcg-metal007",
  /** Riveted panel for utility boxes and garage props. */
  panel: "ambientcg-metalplates001",
} as const;

/** Every pack this game ships — credits are generated from it, so it cannot drift. */
export const ASSET_SOURCE_IDS: readonly string[] = [
  ...MODEL_PACKS.map((pack) => pack.id),
  ...Object.values(MATERIAL_SOURCES),
];

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  packs: MODEL_PACKS,
});

const materials = buildMaterialCatalog({ basePath: "/materials" });

function maps(sourceId: string) {
  const material = materials.resolve(sourceId);
  if (material === null) throw new Error(`scrap-signal: missing PBR material "${sourceId}" — run assets pull`);
  return material.maps;
}

/** The shared material catalog includes only maps supplied by each source. */
export const GROUND_MAPS = maps(MATERIAL_SOURCES.ground);

/** Models accept surface maps; terrain displacement remains a terrain-only input. */
function modelMaps(sourceId: string) {
  const source = maps(sourceId);
  return Object.fromEntries(Object.entries(source).filter(([role]) =>
    role === "color" || role === "normal" || role === "roughness" || role === "ao"));
}

export const CLIFF_MAPS = modelMaps(MATERIAL_SOURCES.cliff);
export const SCRAP_METAL_MAPS = modelMaps(MATERIAL_SOURCES.scrapMetal);
export const PANEL_MAPS = modelMaps(MATERIAL_SOURCES.panel);
