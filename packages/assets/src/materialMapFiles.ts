/**
 * Normalized filenames a pulled material directory contains, keyed by map role. Kept in its own
 * module so catalogs and editors can name a pulled file without loading the archive reader.
 */
export const MATERIAL_MAP_FILES = {
  color: "color.jpg",
  normal: "normal.jpg",
  roughness: "roughness.jpg",
  ao: "ao.jpg",
  opacity: "opacity.jpg",
  displacement: "displacement.jpg",
  ktx2: "material.ktx2",
} as const;

/** One PBR map's role within a material, including an optional compressed KTX2 asset. */
export type MaterialMapRole = keyof typeof MATERIAL_MAP_FILES;
