import { createAssetCatalog, type AssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { aliases } from "../aliases";
import { generatedIndex } from "../generated";
import type { IndexEntry } from "../manifest";
import { singles } from "../singles";
import { sources as declaredSources } from "../sources";

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

  if (sourceFilter !== null) {
    const knownSourceIds = new Set(declaredSources.map((source) => source.id));
    for (const id of sourceFilter) {
      if (!knownSourceIds.has(id)) {
        throw new Error(`buildCatalog: unknown source id "${id}" — not declared in packages/assets/src/sources/*.ts`);
      }
    }
  }

  const catalog = createAssetCatalog();

  for (const entry of generatedIndex) {
    if (sourceFilter !== null && !sourceFilter.has(entry.source)) continue;
    const url = entryUrl(basePath, entry);
    catalog.register(entry.id, entry.dims === undefined ? { url } : { url, dims: entry.dims });
  }

  if (includeSingles) {
    for (const single of singles) {
      catalog.register(single.id, { url: single.url });
    }
  }

  if (includeAliases) {
    for (const alias of aliases) {
      const ref = catalog.resolve(alias.target);
      if (ref === null) continue;
      catalog.register(alias.key, ref.dims === undefined ? { url: ref.url } : { url: ref.url, dims: ref.dims });
    }
  }

  return catalog;
}
