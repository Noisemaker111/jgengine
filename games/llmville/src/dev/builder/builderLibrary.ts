import type { DecorItemSpec, MapData } from "@llmville/game/world/mapTypes";
import type { GridFootprint } from "@llmville/game/world/grid";

/**
 * Saved builder library entry. Single source of truth for the shape — the
 * dev-server plugin that regenerates `assetLibrary.ts` imports this type
 * instead of re-declaring it.
 */
export interface BuilderAssetLibraryEntry {
  id: string;
  label: string;
  tags: string[];
  kind: "group" | "place";
  footprint?: GridFootprint;
  decor?: DecorItemSpec;
  place?: MapData;
  prompt?: string;
  suggestedPath?: string;
  promotedModelKey?: string;
}

/** Later entries win by id. */
export function mergeLibraryEntries(entries: readonly BuilderAssetLibraryEntry[]): BuilderAssetLibraryEntry[] {
  const byId = new Map<string, BuilderAssetLibraryEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  return Array.from(byId.values());
}
