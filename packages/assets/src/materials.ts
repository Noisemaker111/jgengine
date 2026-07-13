import { unzipSync } from "fflate";

import type { AssetAlias, AssetSource } from "./manifest";
import { materialSources, sourceById } from "./sources";

/** Normalized filenames a pulled material directory contains, keyed by map role. */
export const MATERIAL_MAP_FILES = {
  color: "color.jpg",
  normal: "normal.jpg",
  roughness: "roughness.jpg",
  ao: "ao.jpg",
  displacement: "displacement.jpg",
} as const;

/** One PBR map's role within a material: color, normal, roughness, ao, or displacement. */
export type MaterialMapRole = keyof typeof MATERIAL_MAP_FILES;

const MAP_SUFFIXES: readonly { role: MaterialMapRole; pattern: RegExp }[] = [
  { role: "color", pattern: /_Color\.(jpe?g|png)$/i },
  { role: "normal", pattern: /_NormalGL\.(jpe?g|png)$/i },
  { role: "roughness", pattern: /_Roughness\.(jpe?g|png)$/i },
  { role: "ao", pattern: /_AmbientOcclusion\.(jpe?g|png)$/i },
  { role: "displacement", pattern: /_Displacement\.(jpe?g|png)$/i },
];

/** One normalized map pulled out of a material archive by `extractMaterialMaps`. */
export interface ExtractedMaterialMap {
  /** Normalized output filename (`color.jpg`, `normal.jpg`, …). */
  file: string;
  role: MaterialMapRole;
  bytes: Uint8Array;
}

/**
 * Pulls the recognized PBR maps out of a material archive (ambientCG's flat
 * `<Asset>_<Res>_<Map>.jpg` layout) and normalizes their names so resolved
 * URLs never depend on the provider's naming or the pulled resolution.
 */
export function extractMaterialMaps(archive: Uint8Array): ExtractedMaterialMap[] {
  const entries = unzipSync(archive);
  const byRole = new Map<MaterialMapRole, ExtractedMaterialMap>();
  for (const [path, bytes] of Object.entries(entries)) {
    for (const { role, pattern } of MAP_SUFFIXES) {
      if (pattern.test(path) && !byRole.has(role)) {
        byRole.set(role, { file: MATERIAL_MAP_FILES[role], role, bytes });
      }
    }
  }
  return Array.from(byRole.values()).sort((a, b) => a.file.localeCompare(b.file));
}

/** URLs of one material's PBR maps; `ao`/`displacement` files may be absent from a rare pack. */
export interface MaterialMaps {
  color: string;
  normal: string;
  roughness: string;
  ao: string;
  displacement: string;
}

/** A resolved material: identity, attribution, and its normalized map URLs. */
export interface MaterialRef {
  id: string;
  title: string;
  license: string;
  author: string;
  categories: readonly string[];
  maps: MaterialMaps;
}

/** Semantic keys onto the ambientCG catalog, mirroring the model alias layer. */
export const materialAliases: readonly AssetAlias[] = [
  { key: "material/grass", target: "ambientcg-grass001" },
  { key: "material/dirt", target: "ambientcg-ground001" },
  { key: "material/rock", target: "ambientcg-rock001" },
  { key: "material/gravel", target: "ambientcg-gravel001" },
  { key: "material/snow", target: "ambientcg-snow001" },
  { key: "material/sand", target: "ambientcg-ground002" },
  { key: "material/wood", target: "ambientcg-wood001" },
  { key: "material/planks", target: "ambientcg-planks001" },
  { key: "material/brick", target: "ambientcg-bricks001" },
  { key: "material/paving", target: "ambientcg-pavingstones001" },
  { key: "material/tile", target: "ambientcg-tiles001" },
  { key: "material/concrete", target: "ambientcg-concrete001" },
  { key: "material/asphalt", target: "ambientcg-asphalt001" },
  { key: "material/metal", target: "ambientcg-metal001" },
  { key: "material/fabric", target: "ambientcg-fabric001" },
  { key: "material/lava", target: "ambientcg-lava001" },
  { key: "material/ice", target: "ambientcg-ice001" },
  { key: "material/marble", target: "ambientcg-marble001" },
];

/** Options for `buildMaterialCatalog`. */
export interface BuildMaterialCatalogOptions {
  /** URL prefix where pulled material maps live (consumer's `public/materials`). */
  basePath?: string;
  includeAliases?: boolean;
}

/** Resolves material ids and `material/…` aliases to `MaterialRef`s. */
export interface MaterialCatalog {
  resolve(idOrAlias: string): MaterialRef | null;
  ids(): readonly string[];
}

function refFor(source: AssetSource, basePath: string): MaterialRef {
  const base = `${basePath.replace(/\/+$/, "")}/${source.id}`;
  return {
    id: source.id,
    title: source.title,
    license: source.license,
    author: source.author,
    categories: source.categories,
    maps: {
      color: `${base}/${MATERIAL_MAP_FILES.color}`,
      normal: `${base}/${MATERIAL_MAP_FILES.normal}`,
      roughness: `${base}/${MATERIAL_MAP_FILES.roughness}`,
      ao: `${base}/${MATERIAL_MAP_FILES.ao}`,
      displacement: `${base}/${MATERIAL_MAP_FILES.displacement}`,
    },
  };
}

/**
 * A resolvable catalog over every `kind: "material"` source. Ids are source
 * ids (`ambientcg-grass001`) plus the `material/…` aliases; every resolve
 * returns the normalized map URLs under `basePath`, matching what
 * `assets pull` writes into `<dir>/materials/<id>/`.
 */
export function buildMaterialCatalog(options: BuildMaterialCatalogOptions = {}): MaterialCatalog {
  const basePath = options.basePath ?? "/materials";
  const includeAliases = options.includeAliases ?? true;
  const byKey = new Map<string, MaterialRef>();
  for (const source of materialSources) {
    byKey.set(source.id, refFor(source, basePath));
  }
  if (includeAliases) {
    for (const alias of materialAliases) {
      const target = sourceById.get(alias.target);
      if (target === undefined || target.kind !== "material") continue;
      byKey.set(alias.key, refFor(target, basePath));
    }
  }
  return {
    resolve: (idOrAlias) => byKey.get(idOrAlias) ?? null,
    ids: () => materialSources.map((source) => source.id),
  };
}
