import { buildCatalog } from "@jgengine/assets/catalogs/build";
import { buildMaterialCatalog } from "@jgengine/assets/materials";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { MACHINE } from "./palette";

const MODEL_SOURCES = [
  "quaternius-modular-scifi",
  "quaternius-stylized-nature",
  "kaykit-adventurers",
  "kaykit-space-base",
] as const;

const MATERIAL_SOURCES = {
  /** Ferralon's dirt floor — real grain so the flats stop reading as flat vertex colour. */
  ground: "ambientcg-ground025",
  /** Stratified sedimentary cliff — the layered banding that sells badlands relief. */
  cliff: "ambientcg-rock022",
  /** Warm scratched plate for scavenger chassis and improvised structures. */
  scrapMetal: "ambientcg-metal007",
  /** Riveted panel for manufactured loader armour and industrial props. */
  panel: "ambientcg-metalplates001",
} as const;

/** Every pack this game ships — credits are generated from it, so it cannot drift. */
export const ASSET_SOURCE_IDS: readonly string[] = [
  ...MODEL_SOURCES,
  ...Object.values(MATERIAL_SOURCES),
];

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [...MODEL_SOURCES],
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

/**
 * Chassis finish per enemy family. Every entry is a machine hue (see {@link MACHINE}) —
 * deliberately never a terrain hue, so an enemy is never the same colour as the dirt it stands on.
 * `plate` is the body; `accent` and `optic` are reserved for trim on models that expose a separate
 * optic mesh (a whole-model emissive override lights the entire body, so single-mesh casts use
 * `plate` alone and mark elites by taking the darkest, coldest values).
 */
export interface ChassisStyle {
  plate: string;
  accent: string;
  optic: string;
}

export const CHASSIS: Record<string, ChassisStyle> = {
  husk: { plate: MACHINE.scrap, accent: MACHINE.rust, optic: MACHINE.opticElite },
  marauder: { plate: MACHINE.steel, accent: MACHINE.hazard, optic: MACHINE.optic },
  nomad: { plate: MACHINE.iron, accent: MACHINE.rust, optic: MACHINE.optic },
  elite_husk: { plate: MACHINE.iron, accent: MACHINE.opticElite, optic: MACHINE.opticElite },
  ripper_pup: { plate: MACHINE.scrap, accent: MACHINE.rust, optic: MACHINE.optic },
  ripper: { plate: MACHINE.scrap, accent: MACHINE.hazard, optic: MACHINE.optic },
  elite_ripper: { plate: MACHINE.iron, accent: MACHINE.opticElite, optic: MACHINE.opticElite },
  bruiser_brat: { plate: MACHINE.steel, accent: MACHINE.joint, optic: MACHINE.optic },
  bruiser: { plate: MACHINE.scrap, accent: MACHINE.joint, optic: MACHINE.optic },
  crawler: { plate: MACHINE.steel, accent: MACHINE.rust, optic: MACHINE.optic },
  crawler_soldier: { plate: MACHINE.iron, accent: MACHINE.hazard, optic: MACHINE.opticElite },
  loader: { plate: MACHINE.steel, accent: MACHINE.hazard, optic: MACHINE.optic },
  loader_war: { plate: MACHINE.iron, accent: MACHINE.hazard, optic: MACHINE.opticElite },
  elite_loader: { plate: MACHINE.iron, accent: MACHINE.opticElite, optic: MACHINE.opticElite },
  wreck_maw: { plate: MACHINE.scrap, accent: MACHINE.rust, optic: MACHINE.opticElite },
  foreman_maw: { plate: MACHINE.iron, accent: MACHINE.hazard, optic: MACHINE.opticElite },
  captain_rusk: { plate: MACHINE.iron, accent: MACHINE.hazard, optic: MACHINE.opticElite },
  foundry_heart: { plate: MACHINE.joint, accent: MACHINE.opticElite, optic: MACHINE.opticElite },
};

export const NPC_STYLES: Record<string, { coat: string }> = {
  dr_sparx: { coat: "#d8d4c8" },
  rigg: { coat: "#8a6a1e" },
  gauge: { coat: "#3a4a5e" },
};
