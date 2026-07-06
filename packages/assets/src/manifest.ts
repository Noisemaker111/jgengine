/**
 * Asset manifest types for @jgengine/assets.
 *
 * An AssetPack describes a downloadable collection of CC0 models.
 * A PackManifest is the registry of all known packs.
 */

export interface AssetEntry {
  /** File name without extension, used as the catalog key. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Category path, e.g. ["nature", "tree"] */
  categories: readonly string[];
}

export interface AssetPack {
  /** Unique pack identifier, e.g. "kenney-nature" */
  id: string;
  /** Display name. */
  name: string;
  /** CC0 source site. */
  source: string;
  /** Total model count (approximate). */
  modelCount: number;
  /** Direct download URL for the ZIP. If absent, the CLI scrapes the source page. */
  downloadUrl?: string;
  /** Source page URL (used for scraping when downloadUrl is absent). */
  sourceUrl: string;
  /** Path inside the ZIP that contains GLB files. */
  zipGlbPath: string;
  /** Categories this pack covers. */
  categories: readonly string[];
}

export interface PackManifest {
  packs: readonly AssetPack[];
}

export interface PullResult {
  packId: string;
  downloaded: number;
  skipped: number;
  outputDir: string;
}
