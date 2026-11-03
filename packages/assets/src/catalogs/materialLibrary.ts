import {
  MATERIAL_TEXTURE_SEMANTICS,
  materialCapabilitiesForAsset,
  validateMaterialAsset,
  type MaterialAsset,
  type MaterialSurfaceParameters,
  type MaterialTextureMetadata,
  type MaterialTextureRole,
} from "@jgengine/core/material/materialAsset";
import type { BuildingSurfaceMaps, BuildingSurfaceMaterial } from "@jgengine/core/buildings/buildings";
import type { TerrainDetailMaterialConfig, TerrainMaterialMaps } from "@jgengine/core/world/features";

import { MATERIAL_MAP_FILES } from "../materialMapFiles";
import { sourceById } from "../sources";
import { MATERIAL_LIBRARY } from "./materials/index";

/** How a library surface renders: an ordinary PBR surface, cut-out foliage, glass or water. */
export type LibrarySurface = "opaque" | "foliage" | "glass" | "water";

/** Browse groups the library browser and `assets list` share. */
export type LibraryGroup =
  | "asphalt"
  | "concrete"
  | "stucco"
  | "brick"
  | "facade"
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
  /**
   * How this scan blends onto terrain when the defaults are wrong for its scale. A macro ground
   * scan tiles over tens of metres, so its own albedo is a broad wash rather than the authored
   * ground colour; it wants to arrive as grain (`tint` low) instead of replacing the biome tint.
   */
  terrain?: LibraryTerrainDetail;
}

/** Blend policy for putting a library scan on terrain; only entries whose scale needs it declare one. */
export interface LibraryTerrainDetail {
  /** Blend strength over the procedural/vertex-colour ground, 0..1. Default 1. */
  strength?: number;
  /** How much of the scan's own colour replaces the authored ground colour, 0..1. Default 1. */
  tint?: number;
}

export { MATERIAL_LIBRARY };

const byName = new Map(MATERIAL_LIBRARY.map((entry) => [entry.name, entry]));

/** Map roles a library scan can carry: the PBR set plus cut-out coverage and a height map. */
export type LibraryMapRole = "color" | "normal" | "roughness" | "ao" | "opacity" | "displacement";

/** Every readable map role a library material can carry, in load order. */
const LIBRARY_ROLES: readonly LibraryMapRole[] = ["color", "normal", "roughness", "ao", "opacity", "displacement"];

/** Authoring role a library map feeds: `opacity` is an alpha map, `displacement` is a height map. */
function textureRoleFor(role: LibraryMapRole): MaterialTextureRole {
  return role === "opacity" ? "alpha" : role === "displacement" ? "height" : role;
}

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
 * `displacement` is not loaded here: no standard-path renderer samples a height map, and a decoded
 * 1K map per material would cost real GPU memory. Terrain callers get the URL through
 * {@link libraryTerrainMaterial} instead.
 */
export function libraryMaterialMaps(entry: LibraryMaterial, options: LibraryMaterialOptions = {}): Partial<Record<MaterialTextureRole, MaterialTextureMetadata>> {
  const base = `${(options.basePath ?? "/materials").replace(/\/+$/, "")}/${entry.source ?? ""}`;
  const source = entry.source === undefined ? undefined : sourceById.get(entry.source);
  const textures: Partial<Record<MaterialTextureRole, MaterialTextureMetadata>> = {};
  for (const role of libraryMaterialRoles(entry)) {
    if (role === "displacement") continue;
    const target = textureRoleFor(role);
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

function requireLibraryMaterial(name: string): LibraryMaterial {
  const entry = findLibraryMaterial(name);
  if (entry === null) throw new TypeError(`Unknown library material "${name}"`);
  return entry;
}

/** Pulled URL for one map role, or `undefined` when this entry's archive never ships it. */
function mapUrl(entry: LibraryMaterial, role: LibraryMapRole, basePath: string): string | undefined {
  if (entry.source === undefined || !libraryMaterialRoles(entry).includes(role)) return undefined;
  return `${basePath.replace(/\/+$/, "")}/${entry.source}/${MATERIAL_MAP_FILES[role]}`;
}

/** Options for {@link libraryTerrainMaterial}. */
export interface LibraryTerrainOptions {
  /** URL prefix `assets pull` writes under; defaults to `/materials`. */
  basePath?: string;
  /** World units per texture tile; defaults to the entry's authored `tileMetres`. */
  repeat?: number;
  /** Blend strength over the procedural ground, 0..1; the entry's terrain policy, else 1. */
  strength?: number;
  /** How much of the map's own colour replaces the authored ground colour, 0..1; the entry's terrain policy, else 1. */
  tint?: number;
}

/**
 * A library name as terrain detail material config: `terrain({ detail: { material: libraryTerrainMaterial("foliage/grass-macro") } })`.
 * Tiling comes from the entry's authored metres and blend from its terrain policy, so a game selects
 * a ground by name instead of assembling map URLs. A map the archive does not ship is omitted, so
 * `displacement` is never a URL the caller had to invent.
 * @capability library-terrain-material put a named library material on terrain without faking optional maps
 */
export function libraryTerrainMaterial(name: string, options: LibraryTerrainOptions = {}): TerrainDetailMaterialConfig {
  return librarySurfaceScan(name, options);
}

/**
 * A library name as a scanned surface for any renderer that tiles one over authored colour: terrain
 * detail, a `road({ materials })` layer, or a model's `material.scan`. Tiling comes from the entry's
 * authored metres and blend from its terrain policy (else full strength, full tint), so
 * `road({ materials: { road: librarySurfaceScan("asphalt/dry") } })` shows real asphalt and
 * `material: { scan: librarySurfaceScan("stucco/painted", { tint: 0 }) }` keeps a model's paint and
 * adds the plaster's grain. Only maps the pulled archive ships are named.
 * @capability library-surface-scan put a named scanned material on roads, terrain or kit models in one call
 */
export function librarySurfaceScan(name: string, options: LibraryTerrainOptions = {}): TerrainDetailMaterialConfig {
  const entry = requireLibraryMaterial(name);
  const basePath = options.basePath ?? "/materials";
  const color = mapUrl(entry, "color", basePath);
  const normal = mapUrl(entry, "normal", basePath);
  if (color === undefined || normal === undefined) {
    throw new TypeError(`Library material "${name}" carries no pulled color/normal maps; a surface scan needs a scanned material.`);
  }
  const roughness = mapUrl(entry, "roughness", basePath);
  const ao = mapUrl(entry, "ao", basePath);
  const displacement = mapUrl(entry, "displacement", basePath);
  const maps: TerrainMaterialMaps = {
    color,
    normal,
    ...(roughness === undefined ? {} : { roughness }),
    ...(ao === undefined ? {} : { ao }),
    ...(displacement === undefined ? {} : { displacement }),
  };
  return {
    maps,
    repeat: options.repeat ?? entry.tileMetres,
    strength: options.strength ?? entry.terrain?.strength ?? 1,
    tint: options.tint ?? entry.terrain?.tint ?? 1,
  };
}

/** Options for {@link libraryTerrainSurface}. */
export interface LibraryTerrainSurfaceOptions {
  /** URL prefix `assets pull` writes under; defaults to `/materials`. */
  basePath?: string;
  /** World metres one tile covers; defaults to the entry's authored `tileMetres`. */
  tile?: number;
  /** 0..1 how much the terrain's own colour recolours the scan; the core role default when omitted. */
  tint?: number;
}

/**
 * A library name as a terrain surface role: `terrain({ detail: { surfaces: { ground: libraryTerrainSurface("foliage/meadow") } } })`.
 * The terrain shader samples its colour, normal, roughness, AO and height maps, projected from above and
 * on their own face on slopes, and uses the height to decide which layer breaks through at a blend edge.
 * An unknown name throws.
 * @capability library-terrain-surface scanned library ground for a terrain's ground, sand or rock role, with slope projection and height blending
 */
export function libraryTerrainSurface(name: string, options: LibraryTerrainSurfaceOptions = {}): { scan: TerrainMaterialMaps; tile: number; tint?: number } {
  const entry = requireLibraryMaterial(name);
  const scan = librarySurfaceScan(name, options.basePath === undefined ? {} : { basePath: options.basePath });
  return { scan: scan.maps, tile: options.tile ?? entry.tileMetres, ...(options.tint === undefined ? {} : { tint: options.tint }) };
}

/** Options for {@link libraryBuildingSurface}. */
export interface LibraryBuildingSurfaceOptions {
  /** URL prefix `assets pull` writes under; defaults to `/materials`. */
  basePath?: string;
  /** Metres one building part slot covers, `[width, height]`; tiles per slot follow from the entry's `tileMetres`. */
  slotMetres?: readonly [number, number];
  /** Tiles per slot, along [x, y]; wins over `slotMetres`. */
  repeat?: number | readonly [number, number];
  /** Albedo multiplier over the map; defaults to the entry's authored response colour. */
  color?: string;
}

/**
 * A library name as a building surface: `building({ palette: { wall: libraryBuildingSurface("brick/red", { slotMetres: [12, 3] }) } })`.
 * The maps tile at the entry's authored metres, and the response's colour/roughness/metalness come
 * with them, so a facade picks a material by name instead of hand-wiring a surface per part kind.
 * @capability library-building-surface paint a building part from a named library material
 */
export function libraryBuildingSurface(name: string, options: LibraryBuildingSurfaceOptions = {}): BuildingSurfaceMaterial {
  const entry = requireLibraryMaterial(name);
  const basePath = options.basePath ?? "/materials";
  const color = mapUrl(entry, "color", basePath);
  const normal = mapUrl(entry, "normal", basePath);
  if (color === undefined || normal === undefined) {
    throw new TypeError(`Library material "${name}" carries no pulled color/normal maps; a shader surface has nothing to tile onto a building.`);
  }
  const roughness = mapUrl(entry, "roughness", basePath);
  const ao = mapUrl(entry, "ao", basePath);
  const maps: BuildingSurfaceMaps = {
    color,
    normal,
    ...(roughness === undefined ? {} : { roughness }),
    ...(ao === undefined ? {} : { ao }),
  };
  const repeat = options.repeat
    ?? (options.slotMetres === undefined
      ? undefined
      : [options.slotMetres[0] / entry.tileMetres, options.slotMetres[1] / entry.tileMetres] as const);
  const surfaceColor = options.color ?? entry.response.color;
  return {
    maps,
    ...(surfaceColor === undefined ? {} : { color: surfaceColor }),
    ...(repeat === undefined ? {} : { repeat }),
    ...(entry.response.roughness === undefined ? {} : { roughness: entry.response.roughness }),
    ...(entry.response.metalness === undefined ? {} : { metalness: entry.response.metalness }),
  };
}

/**
 * A library name as the sparse surface parameters a `MaterialAsset` or a render-time override takes,
 * so a material picked by name keeps its authored roughness, metalness and cut-out policy.
 * @capability library-surface-parameters carry a named library material's response into authored overrides
 */
export function librarySurfaceParameters(name: string): MaterialSurfaceParameters {
  return { ...requireLibraryMaterial(name).response };
}
