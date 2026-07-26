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
  if (material === null) throw new Error(`the-robots: missing PBR material "${sourceId}" — run assets pull`);
  return material.maps;
}

/**
 * `MaterialMaps` types every role as a required URL, but ambientCG's whole `Metal` family ships
 * without an ambient-occlusion map — so spreading a resolved material wholesale requests a file that
 * is not there and the 404 takes the game down on boot. `ModelMaterialMaps` roles are all optional,
 * so a model-side material names only the roles its pack actually pulled.
 */
function modelMaps(sourceId: string, roles: readonly ("color" | "normal" | "roughness" | "ao")[]) {
  const resolved = maps(sourceId);
  const out: { color?: string; normal?: string; roughness?: string; ao?: string } = {};
  for (const role of roles) out[role] = resolved[role];
  return out;
}

/** Terrain requires the full map set, so only complete materials may drive it. */
export const GROUND_MAPS = maps(MATERIAL_SOURCES.ground);
export const CLIFF_MAPS = modelMaps(MATERIAL_SOURCES.cliff, ["color", "normal", "roughness", "ao"]);
export const SCRAP_METAL_MAPS = modelMaps(MATERIAL_SOURCES.scrapMetal, ["color", "normal", "roughness"]);
export const PANEL_MAPS = modelMaps(MATERIAL_SOURCES.panel, ["color", "normal", "roughness", "ao"]);

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
  psycho: { plate: MACHINE.scrap, accent: MACHINE.rust, optic: MACHINE.opticElite },
  marauder: { plate: MACHINE.steel, accent: MACHINE.hazard, optic: MACHINE.optic },
  nomad: { plate: MACHINE.iron, accent: MACHINE.rust, optic: MACHINE.optic },
  badass_psycho: { plate: MACHINE.iron, accent: MACHINE.opticElite, optic: MACHINE.opticElite },
  skag_pup: { plate: MACHINE.scrap, accent: MACHINE.rust, optic: MACHINE.optic },
  skag: { plate: MACHINE.scrap, accent: MACHINE.hazard, optic: MACHINE.optic },
  badass_skag: { plate: MACHINE.iron, accent: MACHINE.opticElite, optic: MACHINE.opticElite },
  bullymong_brat: { plate: MACHINE.steel, accent: MACHINE.joint, optic: MACHINE.optic },
  bullymong: { plate: MACHINE.scrap, accent: MACHINE.joint, optic: MACHINE.optic },
  spiderant: { plate: MACHINE.steel, accent: MACHINE.rust, optic: MACHINE.optic },
  spiderant_soldier: { plate: MACHINE.iron, accent: MACHINE.hazard, optic: MACHINE.opticElite },
  loader: { plate: MACHINE.steel, accent: MACHINE.hazard, optic: MACHINE.optic },
  loader_war: { plate: MACHINE.iron, accent: MACHINE.hazard, optic: MACHINE.opticElite },
  badass_loader: { plate: MACHINE.iron, accent: MACHINE.opticElite, optic: MACHINE.opticElite },
  bad_maw: { plate: MACHINE.scrap, accent: MACHINE.rust, optic: MACHINE.opticElite },
  captain_rusk: { plate: MACHINE.iron, accent: MACHINE.hazard, optic: MACHINE.opticElite },
  the_warrior: { plate: MACHINE.joint, accent: MACHINE.opticElite, optic: MACHINE.opticElite },
};

export const NPC_STYLES: Record<string, { coat: string }> = {
  dr_sparx: { coat: "#d8d4c8" },
  rigg: { coat: "#8a6a1e" },
  gauge: { coat: "#3a4a5e" },
};
