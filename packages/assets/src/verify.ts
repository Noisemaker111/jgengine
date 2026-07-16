import { aliases } from "./aliases";
import { generatedIndex } from "./generated";
import type { AssetAlias, AssetProvider, AssetSource, IndexEntry, SingleAsset } from "./manifest";
import { materialAliases } from "./materials";
import { singles } from "./singles";
import { sources } from "./sources";

export interface VerifyResult {
  ok: boolean;
  errors: string[];
}

/** Providers allowed repo-wide; Kenney.nl is permanently barred — see CLAUDE.md "Never Kenney". */
const ALLOWED_PROVIDERS: readonly AssetProvider[] = ["quaternius", "kaykit", "ambientcg", "gameicons"];

function containsKenney(value: string): boolean {
  return value.toLowerCase().includes("kenney");
}

export interface VerifyInput {
  sources: readonly AssetSource[];
  singles: readonly SingleAsset[];
  aliases: readonly AssetAlias[];
  index: readonly IndexEntry[];
  materialAliases?: readonly AssetAlias[];
}

export function verifyData(input: VerifyInput): VerifyResult {
  const errors: string[] = [];

  for (const source of input.sources) {
    if (source.license.trim().length === 0) errors.push(`source ${source.id}: missing license`);
    if (source.author.trim().length === 0) errors.push(`source ${source.id}: missing author`);
    if (!ALLOWED_PROVIDERS.includes(source.provider)) {
      errors.push(`source ${source.id}: provider "${source.provider}" is not allowlisted (Never Kenney — see CLAUDE.md)`);
    }
    if (containsKenney(source.id)) errors.push(`source ${source.id}: id contains banned "kenney" substring`);
  }

  for (const single of input.singles) {
    if (single.license.trim().length === 0) errors.push(`single ${single.id}: missing license`);
    if (single.author.trim().length === 0) errors.push(`single ${single.id}: missing author`);
    if (single.url.trim().length === 0) errors.push(`single ${single.id}: missing url`);
    if (containsKenney(single.id)) errors.push(`single ${single.id}: id contains banned "kenney" substring`);
    if (containsKenney(single.url)) errors.push(`single ${single.id}: url contains banned "kenney" substring`);
  }

  for (const entry of input.index) {
    if (containsKenney(entry.id)) errors.push(`index entry ${entry.id}: id contains banned "kenney" substring`);
  }

  for (const alias of [...input.aliases, ...(input.materialAliases ?? [])]) {
    if (containsKenney(alias.key)) errors.push(`alias ${alias.key}: key contains banned "kenney" substring`);
    if (containsKenney(alias.target)) errors.push(`alias ${alias.key}: target contains banned "kenney" substring`);
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

  const materialIds = new Set(
    input.sources.filter((source) => source.kind === "material").map((source) => source.id),
  );
  for (const alias of input.materialAliases ?? []) {
    if (!materialIds.has(alias.target)) {
      errors.push(`material alias ${alias.key}: target "${alias.target}" is not a material source`);
    }
  }

  const seenIds = new Set<string>();
  for (const source of input.sources) {
    if (seenIds.has(source.id)) errors.push(`source ${source.id}: duplicate id`);
    seenIds.add(source.id);
  }

  return { ok: errors.length === 0, errors };
}

export function verifyManifest(): VerifyResult {
  return verifyData({ sources, singles, aliases, index: generatedIndex, materialAliases });
}
