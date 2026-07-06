import { createAssetCatalog, type AssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { aliases } from "../aliases";
import { generatedIndex } from "../generated";
import type { IndexEntry } from "../manifest";
import { singles } from "../singles";

export interface BuildCatalogOptions {
  /** URL prefix where pulled pack GLBs live (consumer's `public/models`). */
  basePath?: string;
  /** Restrict pack entries to these source ids; omit for all. */
  sources?: readonly string[];
  includeAliases?: boolean;
  includeSingles?: boolean;
}

export function entryUrl(basePath: string, entry: IndexEntry): string {
  return `${basePath.replace(/\/+$/, "")}/${entry.source}/${entry.file}`;
}

export function buildCatalog(options: BuildCatalogOptions = {}): AssetCatalog {
  const basePath = options.basePath ?? "/models";
  const includeAliases = options.includeAliases ?? true;
  const includeSingles = options.includeSingles ?? true;
  const sourceFilter = options.sources === undefined ? null : new Set(options.sources);

  const catalog = createAssetCatalog();
  const urlById = new Map<string, string>();

  for (const entry of generatedIndex) {
    if (sourceFilter !== null && !sourceFilter.has(entry.source)) continue;
    const url = entryUrl(basePath, entry);
    urlById.set(entry.id, url);
    catalog.register(entry.id, { url });
  }

  if (includeSingles) {
    for (const single of singles) {
      urlById.set(single.id, single.url);
      catalog.register(single.id, { url: single.url });
    }
  }

  if (includeAliases) {
    for (const alias of aliases) {
      const url = urlById.get(alias.target);
      if (url === undefined) continue;
      catalog.register(alias.key, { url });
    }
  }

  return catalog;
}
