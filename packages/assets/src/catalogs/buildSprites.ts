import { createAssetCatalog, type AssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { generatedSpriteIndex } from "../generated-sprites";
import type { IndexEntry } from "../manifest";
import { entryUrl } from "./build";

/** Options for `buildSpriteCatalog`. */
export interface BuildSpriteCatalogOptions {
  /** URL prefix where pulled sprite/icon files live (consumer's `public/sprites`). */
  basePath?: string;
  /** Restrict to these source ids; omit for all. */
  sources?: readonly string[];
}

/** Resolves individual pulled sprite/icon ids (e.g. `gameicons-icons/sword`) to `{ url }`. */
export function buildSpriteCatalog(options: BuildSpriteCatalogOptions = {}): AssetCatalog {
  const basePath = options.basePath ?? "/sprites";
  const sourceFilter = options.sources === undefined ? null : new Set(options.sources);

  const catalog = createAssetCatalog();
  for (const entry of generatedSpriteIndex as readonly IndexEntry[]) {
    if (sourceFilter !== null && !sourceFilter.has(entry.source)) continue;
    catalog.register(entry.id, { url: entryUrl(basePath, entry) });
  }
  return catalog;
}
