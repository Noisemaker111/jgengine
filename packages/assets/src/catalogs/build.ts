import { createAssetCatalog, type AssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { aliases } from "../aliases";
import { generatedIndex } from "../generated";
import type { IndexEntry } from "../manifest";
import { singles } from "../singles";
import { sources as declaredSources } from "../sources";

/**
 * A durable, hand-or-tool authored catalog entry that is not part of the generated pack index,
 * singles, or aliases — the shape the editor writes into a promoted game's `src/game/assets.ts`
 * when an asset is imported. `label` is human-facing only and is intentionally not registered
 * into the catalog (it mirrors how a single asset's author/license live only in the source
 * literal), so at runtime an extra resolves to exactly `{ url }`.
 */
export interface CatalogExtra {
  /** Catalog id the entry resolves under (matches what a folder rescan would produce). */
  id: string;
  /** URL the shipped game serves the model from (e.g. `/models/imported/Ship.glb`). */
  url: string;
  /** Human-facing label kept only in the source literal; never registered into the catalog. */
  label?: string;
}

export interface BuildCatalogOptions {
  /** URL prefix where pulled pack GLBs live (consumer's `public/models`). */
  basePath?: string;
  /** Restrict pack entries to these source ids; omit for all. */
  sources?: readonly string[];
  includeAliases?: boolean;
  includeSingles?: boolean;
  /**
   * Extra catalog entries registered after packs/singles and before aliases: imported assets the
   * editor persists into a promoted game's typed catalog. Registered last-writer-wins after packs
   * (so an extra can override a pack id) but before aliases (so an alias can target an extra).
   */
  extras?: readonly CatalogExtra[];
}

export function entryUrl(basePath: string, entry: IndexEntry): string {
  return `${basePath.replace(/\/+$/, "")}/${entry.source}/${entry.file}`;
}

/**
 * Builds a game's asset catalog from the generated CC0 pack index plus singles, extras, and aliases.
 * Registration order is packs → singles → {@link BuildCatalogOptions.extras | extras} → aliases:
 * packs and singles come first, extras override them last-writer-wins, and aliases resolve last so
 * they can target an extra. See {@link BuildCatalogOptions} for filtering and opt-outs.
 */
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
    catalog.register(entry.id, {
      url,
      ...(entry.dims === undefined ? {} : { dims: entry.dims }),
      ...(entry.collisionMesh === undefined ? {} : { collisionMesh: entry.collisionMesh }),
    });
  }

  if (includeSingles) {
    for (const single of singles) {
      catalog.register(single.id, { url: single.url });
    }
  }

  for (const extra of options.extras ?? []) {
    catalog.register(extra.id, { url: extra.url });
  }

  if (includeAliases) {
    for (const alias of aliases) {
      const ref = catalog.resolve(alias.target);
      if (ref === null) continue;
      catalog.register(alias.key, {
        url: ref.url,
        ...(ref.dims === undefined ? {} : { dims: ref.dims }),
        ...(ref.collisionMesh === undefined ? {} : { collisionMesh: ref.collisionMesh }),
      });
    }
  }

  return catalog;
}
