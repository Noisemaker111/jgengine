import { type CreditsDocument, type CreditsSection, groupCredits } from "@jgengine/core/game/credits";

import { generatedIndex } from "./generated";
import type { AssetSource } from "./manifest";
import { singles } from "./singles";
import { sourceById, sources } from "./sources";

/**
 * The distinct asset sources behind a set of asset ids — the packs a game actually ships, not the
 * whole catalog. Unknown ids are skipped; order follows first use so a stable id list gives a
 * stable credits screen.
 *
 * @capability sources-for-asset-ids resolve the asset packs behind the ids a game actually ships
 */
export function sourcesForAssetIds(ids: Iterable<string>): AssetSource[] {
  const sourceOfEntry = new Map(generatedIndex.map((entry) => [entry.id, entry.source]));
  const singleIds = new Set(singles.map((single) => single.id));
  const resolved: AssetSource[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const sourceId = sourceOfEntry.get(id) ?? (singleIds.has(id) ? id : undefined);
    if (sourceId === undefined || seen.has(sourceId)) continue;
    const source = sourceById.get(sourceId);
    if (source === undefined) continue;
    seen.add(sourceId);
    resolved.push(source);
  }
  return resolved;
}

/**
 * The distinct sources behind a set of source ids — the shape a game already declares to
 * `buildCatalog({ sources })` / `buildMaterialCatalog`. Unknown ids are skipped.
 *
 * @capability sources-for-source-ids resolve the asset pack metadata behind the source ids a game declares
 */
export function sourcesForSourceIds(ids: Iterable<string>): AssetSource[] {
  const resolved: AssetSource[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const source = sourceById.get(id);
    if (source === undefined) continue;
    seen.add(id);
    resolved.push(source);
  }
  return resolved;
}

/** Grouping for {@link creditsForSources} — one section per license (default) or per provider. */
export type CreditsGrouping = "license" | "provider";

/**
 * Turns asset sources into credit sections, one per license or provider, each entry naming the pack
 * and its author with the pack homepage as `href`. Feed it {@link sourcesForAssetIds} so the screen
 * credits what shipped, and fold the result into the game's hand-authored credits with
 * `mergeCredits`.
 *
 * @capability credits-for-sources generate credit sections from asset pack metadata, grouped by license or provider
 */
export function creditsForSources(
  used: readonly AssetSource[],
  grouping: CreditsGrouping = "license",
): CreditsSection[] {
  return groupCredits(
    used,
    (source) => (grouping === "provider" ? source.provider : source.license),
    (source) => ({ label: source.title, detail: source.author, href: source.homepage }),
  );
}

/**
 * One call from the asset ids a game ships to a ready {@link CreditsDocument} — the credit
 * obligation for borrowed assets, derived rather than hand-maintained.
 *
 * @capability credits-for-asset-ids build a credits document from the asset ids a game ships
 */
export function creditsForAssetIds(
  ids: Iterable<string>,
  options: { title?: string; grouping?: CreditsGrouping; notice?: string } = {},
): CreditsDocument {
  return {
    title: options.title,
    sections: creditsForSources(sourcesForAssetIds(ids), options.grouping ?? "license"),
    notice: options.notice,
  };
}

/**
 * One call from the source ids a game declares to a ready {@link CreditsDocument} — the usual entry
 * point, since `buildCatalog({ sources })` already names them.
 *
 * @capability credits-for-source-ids build a credits document from the asset source ids a game declares
 */
export function creditsForSourceIds(
  ids: Iterable<string>,
  options: { title?: string; grouping?: CreditsGrouping; notice?: string } = {},
): CreditsDocument {
  return {
    title: options.title,
    sections: creditsForSources(sourcesForSourceIds(ids), options.grouping ?? "license"),
    notice: options.notice,
  };
}

/** Every catalogued source, for a credits screen that lists the whole shipped catalog. */
export function allAssetSources(): readonly AssetSource[] {
  return sources;
}
