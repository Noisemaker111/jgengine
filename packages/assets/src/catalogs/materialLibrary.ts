import {
  MATERIAL_TEXTURE_SEMANTICS,
  materialCapabilitiesForAsset,
  validateMaterialAsset,
  type MaterialAsset,
  type MaterialSurfaceParameters,
  type MaterialTextureMetadata,
  type MaterialTextureRole,
} from "@jgengine/core/material/materialAsset";

import { MATERIAL_MAP_FILES } from "../materialMapFiles";
import { sourceById } from "../sources";

/** How a library surface renders: an ordinary PBR surface, cut-out foliage, glass or water. */
export type LibrarySurface = "opaque" | "foliage" | "glass" | "water";

/** Browse groups the library browser and `assets list` share. */
export type LibraryGroup =
  | "asphalt"
  | "concrete"
  | "stucco"
  | "brick"
  | "tile"
  | "metal"
  | "wood"
  | "foliage"
  | "ground"
  | "fabric"
  | "stone"
  | "glass"
  | "water";

/**
 * One named material a game or the editor selects by name. `source` names the ambientCG catalog
 * entry whose pulled maps it uses; glass and water carry response parameters only, because
 * ambientCG publishes no scanned glass or water material and both are shader surfaces.
 */
export interface LibraryMaterial {
  /** Stable name, e.g. `asphalt/wet`. Names are the data contract; source ids and URLs are not. */
  name: string;
  /** Human label for pickers and contact sheets. */
  title: string;
  group: LibraryGroup;
  /** ambientCG source id in the material catalog, whose maps `assets pull <id>` writes. */
  source?: string;
  surface: LibrarySurface;
  /** Metres one texture tile covers on world geometry. */
  tileMetres: number;
  /** Sparse physical response merged over the imported or authored slot. */
  response: MaterialSurfaceParameters;
}

const MATTE = { metalness: 0, roughness: 0.85 } as const;

/**
 * The shared library: 40+ ambientCG PBR materials plus the glass and water surfaces that need a
 * shader rather than a scan. `satisfies` keeps every entry complete, so a missing tile size or
 * response is a type error instead of a silently grey surface.
 */
export const MATERIAL_LIBRARY: readonly LibraryMaterial[] = [
  // Asphalt and road — wet asphalt is the same scan with a low roughness, not a second download.
  { name: "asphalt/wet", title: "Wet asphalt", group: "asphalt", source: "ambientcg-asphalt025c", surface: "opaque", tileMetres: 4, response: { metalness: 0, roughness: 0.34, color: "#8f9498" } },
  { name: "asphalt/dry", title: "Dry asphalt", group: "asphalt", source: "ambientcg-asphalt003", surface: "opaque", tileMetres: 4, response: { metalness: 0, roughness: 0.82 } },
  { name: "asphalt/patch", title: "Patched asphalt", group: "asphalt", source: "ambientcg-asphalt021", surface: "opaque", tileMetres: 3.2, response: { metalness: 0, roughness: 0.74 } },
  { name: "road/tarmac", title: "Tarmac road", group: "asphalt", source: "ambientcg-road001", surface: "opaque", tileMetres: 6, response: { metalness: 0, roughness: 0.7 } },
  { name: "road/marked", title: "Marked road", group: "asphalt", source: "ambientcg-road008a", surface: "opaque", tileMetres: 8, response: { metalness: 0, roughness: 0.62 } },

  // Concrete.
  { name: "concrete/smooth", title: "Smooth concrete", group: "concrete", source: "ambientcg-concrete006", surface: "opaque", tileMetres: 3, response: { metalness: 0, roughness: 0.78 } },
  { name: "concrete/poured", title: "Poured concrete", group: "concrete", source: "ambientcg-concrete013", surface: "opaque", tileMetres: 3.5, response: { metalness: 0, roughness: 0.88 } },
  { name: "concrete/rough", title: "Rough concrete", group: "concrete", source: "ambientcg-concrete025", surface: "opaque", tileMetres: 2.6, response: { metalness: 0, roughness: 0.94 } },

  // Stucco and plaster.
  { name: "stucco/painted", title: "Painted stucco", group: "stucco", source: "ambientcg-paintedplaster006", surface: "opaque", tileMetres: 2.2, response: { metalness: 0, roughness: 0.9 } },
  { name: "stucco/warm", title: "Warm stucco", group: "stucco", source: "ambientcg-paintedplaster010", surface: "opaque", tileMetres: 2.2, response: { metalness: 0, roughness: 0.88 } },
  { name: "plaster/interior", title: "Interior plaster", group: "stucco", source: "ambientcg-plaster001", surface: "opaque", tileMetres: 2, response: { metalness: 0, roughness: 0.92 } },

  // Brick.
  { name: "brick/red", title: "Red brick", group: "brick", source: "ambientcg-bricks004", surface: "opaque", tileMetres: 1.6, response: { metalness: 0, roughness: 0.86 } },
  { name: "brick/painted", title: "Painted brick", group: "brick", source: "ambientcg-paintedbricks002", surface: "opaque", tileMetres: 1.6, response: { metalness: 0, roughness: 0.8 } },
  { name: "brick/whitewash", title: "Whitewashed brick", group: "brick", source: "ambientcg-paintedbricks005", surface: "opaque", tileMetres: 1.6, response: { metalness: 0, roughness: 0.84 } },

  // Tile, paving and roof.
  { name: "tile/ceramic", title: "Ceramic tile", group: "tile", source: "ambientcg-tiles007", surface: "opaque", tileMetres: 1.2, response: { metalness: 0, roughness: 0.32 } },
  { name: "paving/stone", title: "Stone paving", group: "tile", source: "ambientcg-pavingstones002", surface: "opaque", tileMetres: 2.4, response: { metalness: 0, roughness: 0.83 } },
  { name: "paving/sett", title: "Setts", group: "tile", source: "ambientcg-pavingstones020", surface: "opaque", tileMetres: 1.8, response: { metalness: 0, roughness: 0.8 } },
  { name: "roof/tiles", title: "Roof tiles", group: "tile", source: "ambientcg-roofingtiles006", surface: "opaque", tileMetres: 1.4, response: { metalness: 0, roughness: 0.78 } },

  // Metal.
  { name: "metal/painted", title: "Painted metal", group: "metal", source: "ambientcg-paintedmetal006", surface: "opaque", tileMetres: 1.2, response: { metalness: 0.75, roughness: 0.44 } },
  { name: "metal/chipped", title: "Chipped paint", group: "metal", source: "ambientcg-paintedmetal002", surface: "opaque", tileMetres: 1, response: { metalness: 0.8, roughness: 0.5 } },
  { name: "metal/steel", title: "Bare steel", group: "metal", source: "ambientcg-metal007", surface: "opaque", tileMetres: 1, response: { metalness: 0.95, roughness: 0.42 } },
  { name: "metal/brushed", title: "Brushed metal", group: "metal", source: "ambientcg-metal032", surface: "opaque", tileMetres: 1, response: { metalness: 1, roughness: 0.3 } },
  { name: "metal/corrugated", title: "Corrugated steel", group: "metal", source: "ambientcg-corrugatedsteel009", surface: "opaque", tileMetres: 2, response: { metalness: 0.9, roughness: 0.55 } },
  { name: "metal/diamond-plate", title: "Diamond plate", group: "metal", source: "ambientcg-diamondplate005a", surface: "opaque", tileMetres: 1.2, response: { metalness: 0.92, roughness: 0.38 } },
  { name: "metal/rust", title: "Rusted metal", group: "metal", source: "ambientcg-rust007", surface: "opaque", tileMetres: 1.4, response: { metalness: 0.35, roughness: 0.88 } },
  { name: "metal/plate", title: "Steel plate", group: "metal", source: "ambientcg-metalplates001", surface: "opaque", tileMetres: 1.6, response: { metalness: 0.85, roughness: 0.5 } },

  // Wood.
  { name: "wood/oak", title: "Oak", group: "wood", source: "ambientcg-wood026", surface: "opaque", tileMetres: 1.4, response: { metalness: 0, roughness: 0.66 } },
  { name: "wood/floor", title: "Wood floor", group: "wood", source: "ambientcg-woodfloor009", surface: "opaque", tileMetres: 1.8, response: { metalness: 0, roughness: 0.46 } },
  { name: "wood/deck", title: "Deck planks", group: "wood", source: "ambientcg-planks003", surface: "opaque", tileMetres: 1.6, response: { metalness: 0, roughness: 0.75 } },
  { name: "wood/painted", title: "Painted wood", group: "wood", source: "ambientcg-paintedwood006a", surface: "opaque", tileMetres: 1.2, response: { metalness: 0, roughness: 0.6 } },
  { name: "wood/siding", title: "Wood siding", group: "wood", source: "ambientcg-woodsiding005", surface: "opaque", tileMetres: 1.4, response: { metalness: 0, roughness: 0.72 } },
  { name: "wood/bark", title: "Tree bark", group: "wood", source: "ambientcg-bark002", surface: "opaque", tileMetres: 1, response: { metalness: 0, roughness: 0.92 } },

  // Foliage — cut-out cards over a warm, backlit response.
  { name: "foliage/leaf", title: "Leaf card", group: "foliage", source: "ambientcg-leaf001", surface: "foliage", tileMetres: 0.8, response: { metalness: 0, roughness: 0.55, alphaMode: "mask", alphaCutoff: 0.45, doubleSided: true, sheen: 0.6, sheenColor: "#c8d18a", sheenRoughness: 0.7 } },
  { name: "foliage/leaf-dense", title: "Dense leaf card", group: "foliage", source: "ambientcg-leaf003", surface: "foliage", tileMetres: 1, response: { metalness: 0, roughness: 0.6, alphaMode: "mask", alphaCutoff: 0.45, doubleSided: true, sheen: 0.55, sheenColor: "#b9cc7d", sheenRoughness: 0.75 } },
  { name: "foliage/grass", title: "Grass ground", group: "foliage", source: "ambientcg-grass001", surface: "opaque", tileMetres: 2, response: { metalness: 0, roughness: 0.9 } },
  { name: "foliage/grass-dry", title: "Dry grass", group: "foliage", source: "ambientcg-grass004", surface: "opaque", tileMetres: 2, response: { metalness: 0, roughness: 0.92 } },
  { name: "foliage/moss", title: "Moss", group: "foliage", source: "ambientcg-moss001", surface: "opaque", tileMetres: 1.2, response: { metalness: 0, roughness: 0.95 } },
  { name: "foliage/leaf-litter", title: "Leaf litter", group: "foliage", source: "ambientcg-scatteredleaves008", surface: "opaque", tileMetres: 2.4, response: { metalness: 0, roughness: 0.88 } },

  // Ground and nature.
  { name: "ground/dirt", title: "Forest floor", group: "ground", source: "ambientcg-ground037", surface: "opaque", tileMetres: 2.4, response: { metalness: 0, roughness: 0.9 } },
  { name: "ground/sand", title: "Beach sand", group: "ground", source: "ambientcg-ground055s", surface: "opaque", tileMetres: 2, response: { metalness: 0, roughness: 0.88 } },
  { name: "ground/sand-dark", title: "Dark sand", group: "ground", source: "ambientcg-ground080", surface: "opaque", tileMetres: 2, response: { metalness: 0, roughness: 0.86 } },
  { name: "ground/mud", title: "Wet mud", group: "ground", source: "ambientcg-ground095b", surface: "opaque", tileMetres: 2, response: { metalness: 0, roughness: 0.52 } },
  { name: "ground/gravel", title: "Gravel", group: "ground", source: "ambientcg-gravel002", surface: "opaque", tileMetres: 1.6, response: { metalness: 0, roughness: 0.88 } },
  { name: "ground/rock", title: "Rock face", group: "ground", source: "ambientcg-rock022", surface: "opaque", tileMetres: 3, response: { metalness: 0, roughness: 0.86 } },
  { name: "ground/ice", title: "Ice", group: "ground", source: "ambientcg-ice001", surface: "opaque", tileMetres: 1.8, response: { metalness: 0, roughness: 0.18 } },
  { name: "ground/snow", title: "Snow", group: "ground", source: "ambientcg-snow006", surface: "opaque", tileMetres: 2.4, response: { metalness: 0, roughness: 0.72 } },

  // Fabric, plastic and stone fittings.
  { name: "fabric/canvas", title: "Canvas", group: "fabric", source: "ambientcg-fabric007", surface: "opaque", tileMetres: 1, response: { ...MATTE } },
  { name: "fabric/weave", title: "Woven fabric", group: "fabric", source: "ambientcg-fabric009", surface: "opaque", tileMetres: 0.8, response: { metalness: 0, roughness: 0.82, sheen: 0.3, sheenColor: "#ffffff", sheenRoughness: 0.8 } },
  { name: "plastic/matte", title: "Matte plastic", group: "fabric", source: "ambientcg-plastic006", surface: "opaque", tileMetres: 0.8, response: { metalness: 0, roughness: 0.5 } },
  { name: "stone/marble", title: "Marble", group: "stone", source: "ambientcg-marble001", surface: "opaque", tileMetres: 1.8, response: { metalness: 0, roughness: 0.22 } },
  { name: "stone/terrazzo", title: "Terrazzo", group: "stone", source: "ambientcg-terrazzo005", surface: "opaque", tileMetres: 1.6, response: { metalness: 0, roughness: 0.3 } },

  // Glass: transmission and roughness carry the look. The smudged variant adds a scanned
  // fingerprint normal so glass is not a mathematically clean sheet.
  { name: "glass/clear", title: "Clear glass", group: "glass", surface: "glass", tileMetres: 2, response: { metalness: 0, roughness: 0.03, transmission: 1, ior: 1.52, thickness: 0.01, alphaMode: "opaque" } },
  { name: "glass/frosted", title: "Frosted glass", group: "glass", surface: "glass", tileMetres: 2, response: { metalness: 0, roughness: 0.42, transmission: 1, ior: 1.52, thickness: 0.01, alphaMode: "opaque" } },
  { name: "glass/smudged", title: "Smudged glass", group: "glass", source: "ambientcg-fingerprints001", surface: "glass", tileMetres: 0.7, response: { metalness: 0, roughness: 0.12, transmission: 1, ior: 1.52, thickness: 0.01, alphaMode: "opaque" } },

  // Water: the shell's ocean/puddle shader owns ripples; these entries carry the response and the
  // depth tint so a game selects water by name like any other surface.
  { name: "water/ocean", title: "Ocean water", group: "water", surface: "water", tileMetres: 8, response: { metalness: 0.02, roughness: 0.05, alphaMode: "opaque" } },
  { name: "water/puddle", title: "Puddle", group: "water", surface: "water", tileMetres: 3, response: { metalness: 0, roughness: 0.06, alphaMode: "opaque" } },
];

const byName = new Map(MATERIAL_LIBRARY.map((entry) => [entry.name, entry]));

/** Map roles a library scan can carry: the PBR set plus cut-out coverage. */
export type LibraryMapRole = "color" | "normal" | "roughness" | "ao" | "opacity";

/** Every readable map role a library material can carry, in load order. */
const LIBRARY_ROLES: readonly LibraryMapRole[] = ["color", "normal", "roughness", "ao", "opacity"];

/** Resolve a library name; unknown names return `null` so a caller can report them by name. */
export function findLibraryMaterial(name: string): LibraryMaterial | null {
  return byName.get(name) ?? null;
}

/** Every library name, in authored order. */
export function libraryMaterialNames(): readonly string[] {
  return MATERIAL_LIBRARY.map((entry) => entry.name);
}

/** Map roles the pinned archive of `entry` actually ships, from its catalog source declaration. */
export function libraryMaterialRoles(entry: LibraryMaterial): readonly LibraryMapRole[] {
  if (entry.source === undefined) return [];
  const source = sourceById.get(entry.source);
  if (source === undefined) return [];
  return LIBRARY_ROLES.filter((role) => source.materialMaps?.includes(role) === true);
}

/** Options for {@link libraryMaterialMaps} and {@link libraryMaterialAsset}. */
export interface LibraryMaterialOptions {
  /** URL prefix `assets pull` writes under; defaults to `/materials`. */
  basePath?: string;
  /** How one texture tile is projected: authored UVs, or world-space triplanar for geometry without UVs. */
  projection?: "uv" | "triplanar";
}

/**
 * Serialized runtime map URLs for a library material, matching what `assets pull <source>` writes
 * into `<basePath>/<source-id>/`. Roles the archive does not ship are omitted, never invented.
 */
export function libraryMaterialMaps(entry: LibraryMaterial, options: LibraryMaterialOptions = {}): Partial<Record<MaterialTextureRole, MaterialTextureMetadata>> {
  const base = `${(options.basePath ?? "/materials").replace(/\/+$/, "")}/${entry.source ?? ""}`;
  const source = entry.source === undefined ? undefined : sourceById.get(entry.source);
  const textures: Partial<Record<MaterialTextureRole, MaterialTextureMetadata>> = {};
  for (const role of libraryMaterialRoles(entry)) {
    const target: MaterialTextureRole = role === "opacity" ? "alpha" : role;
    textures[target] = {
      url: `${base}/${MATERIAL_MAP_FILES[role]}`,
      colorSpace: MATERIAL_TEXTURE_SEMANTICS[target].colorSpace,
      channel: MATERIAL_TEXTURE_SEMANTICS[target].channel,
      physicalSize: [entry.tileMetres, entry.tileMetres],
      ...(role === "normal" ? { normalConvention: "opengl" as const } : {}),
      sampler: { anisotropy: 8 },
      ...(source === undefined
        ? {}
        : { provenance: { author: source.author, license: source.license, ...(source.homepage === undefined ? {} : { sourceUrl: source.homepage }) } }),
    };
  }
  return textures;
}

/**
 * Build the editable, serializable material asset for a library name: maps, response and
 * CC0 attribution in one value the editor can save into `editor.scene.json` and the shell renders.
 * `projection` records whether those maps should sample authored UVs or world-space triplanar.
 */
export function libraryMaterialAsset(name: string, options: LibraryMaterialOptions = {}): MaterialAsset {
  const entry = findLibraryMaterial(name);
  if (entry === null) throw new TypeError(`Unknown library material "${name}"`);
  const source = entry.source === undefined ? undefined : sourceById.get(entry.source);
  if (entry.source !== undefined && source === undefined) throw new TypeError(`Library material "${name}" names unknown source "${entry.source}"`);
  const textures = libraryMaterialMaps(entry, options);
  const id = `library/${entry.name.replace(/\//g, "-")}`;
  const asset: MaterialAsset = {
    schemaVersion: 1,
    id,
    name: entry.title,
    family: entry.surface === "glass" ? "glass" : "standard",
    surface: { ...entry.response },
    capabilities: materialCapabilitiesForAsset({ surface: entry.response, textures }),
    provenance: {
      author: source?.author ?? "ambientCG",
      license: source?.license ?? "CC0-1.0",
      ...(source?.homepage === undefined ? {} : { sourceUrl: source.homepage }),
      description: `ambientCG ${source === undefined ? entry.name : source.title.replace(/ \(PBR material\)$/, "")} 1K-JPG PBR maps, selected by the shared jgengine material library.`,
    },
    ...(Object.keys(textures).length === 0 ? {} : { textures }),
  };
  const errors = validateMaterialAsset(asset).filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) throw new TypeError(`${errors[0]!.path}: ${errors[0]!.message}`);
  return asset;
}

/**
 * Filter the library for a picker: case-insensitive match on name, title, group or source.
 * Empty query returns everything, so a browser can render the full library first.
 */
export function filterLibraryMaterials(query: string, group?: LibraryGroup): readonly LibraryMaterial[] {
  const needle = query.trim().toLowerCase();
  return MATERIAL_LIBRARY.filter((entry) => {
    if (group !== undefined && entry.group !== group) return false;
    if (needle.length === 0) return true;
    return `${entry.name} ${entry.title} ${entry.group} ${entry.source ?? ""}`.toLowerCase().includes(needle);
  });
}
