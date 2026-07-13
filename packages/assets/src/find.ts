import { aliases } from "./aliases";
import { generatedIndex } from "./generated";
import { keyFromFile } from "./indexGen";
import { materialAliases } from "./materials";
import { registryCatalog } from "./registry";
import { singles } from "./singles";
import { materialSources, modelSources } from "./sources";

export type AssetKind = "model" | "pack" | "material" | "component" | "icon";

export type AssetMatch =
  | { kind: "model"; id: string; source: string; file?: string; via: "index" | "alias" | "single" }
  | { kind: "pack"; source: string; title: string; categories: readonly string[] }
  | { kind: "material"; id: string; title: string; categories: readonly string[] }
  | { kind: "component"; name: string; title: string; description: string }
  | { kind: "icon"; name: string };

export interface FindOptions {
  /** Restrict results to one kind. */
  kind?: AssetKind;
  /** Cap the number of matches returned (default 12). */
  limit?: number;
}

export interface RankedMatch {
  match: AssetMatch;
  score: number;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_/-]+/g, " ").trim();
}

function tokenScore(token: string, hay: string, words: readonly string[]): number {
  if (words.includes(token)) return 70;
  if (hay.startsWith(token)) return 55;
  if (words.some((word) => word.startsWith(token))) return 45;
  if (hay.includes(token)) return 30;
  return 0;
}

/**
 * 0 (no match) … 100 (exact). Single-word queries reward whole-word and prefix
 * hits over loose substrings; a multi-word query ("mana bar") scores by the mean
 * of its tokens and only counts when *every* token lands in the field.
 */
function scoreText(needle: string, hay: string): number {
  const n = normalize(needle);
  const h = normalize(hay);
  if (n.length === 0 || h.length === 0) return 0;
  if (h === n) return 100;
  const words = h.split(" ");
  const tokens = n.split(" ").filter((token) => token.length > 0);
  if (tokens.length <= 1) return tokenScore(n, h, words);
  let sum = 0;
  for (const token of tokens) {
    const score = tokenScore(token, h, words);
    if (score === 0) return 0;
    sum += score;
  }
  return Math.min(90, Math.round(sum / tokens.length));
}

function best(needle: string, ...hays: (string | undefined)[]): number {
  let top = 0;
  for (const hay of hays) {
    if (hay === undefined) continue;
    top = Math.max(top, scoreText(needle, hay));
  }
  return top;
}

function sourceOf(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(0, slash);
}

/** Rank every catalog entry — models, packs, HUD components, icons — against one query. */
export function rankAssets(query: string, options: FindOptions = {}): RankedMatch[] {
  const q = query.trim();
  const ranked: RankedMatch[] = [];
  const push = (score: number, match: AssetMatch): void => {
    if (score > 0) ranked.push({ score, match });
  };

  if (options.kind === undefined || options.kind === "model") {
    for (const entry of generatedIndex) {
      push(best(q, entry.id, keyFromFile(entry.file), ...entry.categories), {
        kind: "model",
        id: entry.id,
        source: entry.source,
        file: entry.file,
        via: "index",
      });
    }
    for (const alias of aliases) {
      push(best(q, alias.key, alias.target), {
        kind: "model",
        id: alias.target,
        source: sourceOf(alias.target),
        via: "alias",
      });
    }
    for (const single of singles) {
      push(best(q, single.id, ...single.categories), {
        kind: "model",
        id: single.id,
        source: sourceOf(single.id),
        via: "single",
      });
    }
  }

  if (options.kind === undefined || options.kind === "pack") {
    for (const source of modelSources) {
      push(best(q, source.id, source.title, source.provider, ...source.categories), {
        kind: "pack",
        source: source.id,
        title: source.title,
        categories: source.categories,
      });
    }
  }

  if (options.kind === undefined || options.kind === "material") {
    for (const source of materialSources) {
      push(best(q, source.id, source.title, ...source.categories), {
        kind: "material",
        id: source.id,
        title: source.title,
        categories: source.categories,
      });
    }
    for (const alias of materialAliases) {
      const target = materialSources.find((source) => source.id === alias.target);
      if (target === undefined) continue;
      push(best(q, alias.key, alias.target), {
        kind: "material",
        id: target.id,
        title: target.title,
        categories: target.categories,
      });
    }
  }

  if (options.kind === undefined || options.kind === "component") {
    for (const component of registryCatalog.components) {
      push(best(q, component.name, component.title, component.description), {
        kind: "component",
        name: component.name,
        title: component.title,
        description: component.description,
      });
    }
  }

  if (options.kind === undefined || options.kind === "icon") {
    for (const icon of registryCatalog.icons) {
      push(best(q, icon), { kind: "icon", name: icon });
    }
  }

  ranked.sort((a, b) => b.score - a.score || matchKey(a.match).localeCompare(matchKey(b.match)));
  return dedupe(ranked).slice(0, options.limit ?? 12);
}

function matchKey(match: AssetMatch): string {
  switch (match.kind) {
    case "model":
      return `model:${match.id}`;
    case "pack":
      return `pack:${match.source}`;
    case "material":
      return `material:${match.id}`;
    default:
      return `${match.kind}:${match.name}`;
  }
}

function dedupe(ranked: readonly RankedMatch[]): RankedMatch[] {
  const seen = new Set<string>();
  const out: RankedMatch[] = [];
  for (const entry of ranked) {
    const key = matchKey(entry.match);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** The ranked matches for a query — models, packs, HUD components, and icons in one list. */
export function findAssets(query: string, options: FindOptions = {}): AssetMatch[] {
  return rankAssets(query, options).map((entry) => entry.match);
}
