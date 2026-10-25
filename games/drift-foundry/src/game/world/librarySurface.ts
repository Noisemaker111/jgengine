import { findLibraryMaterial, libraryMaterialMaps } from "@jgengine/assets/catalogs/materialLibrary";
import type { BuildingSurfaceMaterial } from "@jgengine/core/world/buildings";

/** Where `assets pull` writes a library material's maps, matching the root catalog's basePath. */
const MATERIAL_BASE = "/materials";

/**
 * A generated-facade surface painted by a named material from the shared library: the scanned
 * ambientCG maps `assets pull` writes into `public/materials/<source>/`, the library's own physical
 * response, and a light multiplier that keeps this zone's authored value.
 *
 * The library publishes an editable `MaterialAsset`; a generated building palette takes plain map
 * URLs, so this is the bridge between the two. It wants to live in `@jgengine/assets` beside
 * `libraryMaterialMaps`; drop this file when that package exposes a surface bridge.
 */
export function libraryFacade(name: string, repeat: [number, number], tint: string): BuildingSurfaceMaterial {
  const entry = findLibraryMaterial(name);
  if (entry === null) throw new Error(`drift-foundry: unknown library material "${name}"`);
  const maps = libraryMaterialMaps(entry, { basePath: MATERIAL_BASE });
  const { color, normal, roughness, ao } = maps;
  if (color === undefined || normal === undefined || roughness === undefined) {
    throw new Error(`drift-foundry: library material "${name}" is missing a color, normal or roughness map`);
  }
  return {
    color: tint,
    maps: {
      color: color.url,
      normal: normal.url,
      roughness: roughness.url,
      ...(ao === undefined ? {} : { ao: ao.url }),
    },
    repeat,
    roughness: entry.response.roughness,
    metalness: entry.response.metalness,
  };
}
