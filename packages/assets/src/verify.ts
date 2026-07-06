import { aliases } from "./aliases";
import { generatedIndex } from "./generated";
import type { AssetAlias, AssetSource, IndexEntry, SingleAsset } from "./manifest";
import { singles } from "./singles";
import { sources } from "./sources";

export interface VerifyResult {
  ok: boolean;
  errors: string[];
}

export interface VerifyInput {
  sources: readonly AssetSource[];
  singles: readonly SingleAsset[];
  aliases: readonly AssetAlias[];
  index: readonly IndexEntry[];
}

export function verifyData(input: VerifyInput): VerifyResult {
  const errors: string[] = [];

  for (const source of input.sources) {
    if (source.license.trim().length === 0) errors.push(`source ${source.id}: missing license`);
    if (source.author.trim().length === 0) errors.push(`source ${source.id}: missing author`);
  }

  for (const single of input.singles) {
    if (single.license.trim().length === 0) errors.push(`single ${single.id}: missing license`);
    if (single.author.trim().length === 0) errors.push(`single ${single.id}: missing author`);
    if (single.url.trim().length === 0) errors.push(`single ${single.id}: missing url`);
  }

  const knownIds = new Set<string>([
    ...input.index.map((entry) => entry.id),
    ...input.singles.map((single) => single.id),
  ]);
  for (const alias of input.aliases) {
    if (!knownIds.has(alias.target)) {
      errors.push(`alias ${alias.key}: target "${alias.target}" not found in index or singles`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function verifyManifest(): VerifyResult {
  return verifyData({ sources, singles, aliases, index: generatedIndex });
}
