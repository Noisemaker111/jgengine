import { aliases } from "./aliases";
import { generatedIndex } from "./generated";
import { generatedSpriteIndex } from "./generated-sprites";
import { keyFromFile } from "./indexGen";
import { materialAliases } from "./materials";
import { registryCatalog } from "./registry";
import { singles } from "./singles";
import { materialSources, modelSources, spriteSources } from "./sources";
import { keyFromSpriteFile } from "./spriteIndexGen";

/** What a match is: a model file, a whole pack, a material, a HUD component, an icon, or a sprite (pack). */
export type AssetKind = "model" | "pack" | "material" | "component" | "icon" | "sprite" | "spritePack";

/** One catalog entry a query matched, shaped by its kind. */
export type AssetMatch =
  | { kind: "model"; id: string; source: string; file?: string; via: "index" | "alias" | "single" }
  | { kind: "pack"; source: string; title: string; categories: readonly string[] }
  | { kind: "material"; id: string; title: string; categories: readonly string[] }
  | { kind: "component"; name: string; title: string; description: string }
  | { kind: "icon"; name: string }
  /** One already-indexed file inside a pulled sprite/icon pack, e.g. `gameicons-icons/sword`. */
  | { kind: "sprite"; id: string; source: string; via: "index" }
  /** A whole sprite/icon pack, not yet resolved to individual files — same role as `pack` for models. */
  | { kind: "spritePack"; source: string; title: string; categories: readonly string[] };

/** Narrowing for {@link rankAssets}. */
export interface RankAssetsOptions {
  /** Restrict results to one kind. */
  kind?: AssetKind | undefined;
  /** Cap the number of matches returned (default 12). */
  limit?: number;
}

/** A match with its score, 0 (none) to 100 (exact). */
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

/**
 * How well `needle` names any of `hays`, 0 (none) to 100 (exact): the score every asset search ranks by.
 * @internal
 */
export function scoreAssetText(needle: string, ...hays: (string | undefined)[]): number {
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

/**
 * Rank every catalog entry — models, packs, HUD components, icons — against one query.
 *
 * @capability rank-assets find the model, pack, material, sprite, HUD component or icon for a word, best first
 */
export function rankAssets(query: string, options: RankAssetsOptions = {}): RankedMatch[] {
  const q = query.trim();
  const ranked: RankedMatch[] = [];
  const push = (score: number, match: AssetMatch): void => {
    if (score > 0) ranked.push({ score, match });
  };

  if (options.kind === undefined || options.kind === "model") {
    for (const entry of generatedIndex) {
      push(scoreAssetText(q, entry.id, keyFromFile(entry.file), ...entry.categories), {
        kind: "model",
        id: entry.id,
        source: entry.source,
        file: entry.file,
        via: "index",
      });
    }
    for (const alias of aliases) {
      push(scoreAssetText(q, alias.key, alias.target), {
        kind: "model",
        id: alias.target,
        source: sourceOf(alias.target),
        via: "alias",
      });
    }
    for (const single of singles) {
      push(scoreAssetText(q, single.id, ...single.categories), {
        kind: "model",
        id: single.id,
        source: sourceOf(single.id),
        via: "single",
      });
    }
  }

  if (options.kind === undefined || options.kind === "pack") {
    for (const source of modelSources) {
      push(scoreAssetText(q, source.id, source.title, source.provider, ...source.categories), {
        kind: "pack",
        source: source.id,
        title: source.title,
        categories: source.categories,
      });
    }
  }

  if (options.kind === undefined || options.kind === "material") {
    for (const source of materialSources) {
      push(scoreAssetText(q, source.id, source.title, ...source.categories), {
        kind: "material",
        id: source.id,
        title: source.title,
        categories: source.categories,
      });
    }
    for (const alias of materialAliases) {
      const target = materialSources.find((source) => source.id === alias.target);
      if (target === undefined) continue;
      push(scoreAssetText(q, alias.key, alias.target), {
        kind: "material",
        id: target.id,
        title: target.title,
        categories: target.categories,
      });
    }
  }

  if (options.kind === undefined || options.kind === "component") {
    for (const component of registryCatalog.components) {
      push(scoreAssetText(q, component.name, component.title, component.description), {
        kind: "component",
        name: component.name,
        title: component.title,
        description: component.description,
      });
    }
  }

  if (options.kind === undefined || options.kind === "icon") {
    for (const icon of registryCatalog.icons) {
      push(scoreAssetText(q, icon), { kind: "icon", name: icon });
    }
  }

  if (options.kind === undefined || options.kind === "sprite") {
    for (const entry of generatedSpriteIndex) {
      push(scoreAssetText(q, entry.id, keyFromSpriteFile(entry.file), ...entry.categories), {
        kind: "sprite",
        id: entry.id,
        source: entry.source,
        via: "index",
      });
    }
  }

  if (options.kind === undefined || options.kind === "spritePack") {
    for (const source of spriteSources) {
      push(scoreAssetText(q, source.id, source.title, source.provider, ...source.categories), {
        kind: "spritePack",
        source: source.id,
        title: source.title,
        categories: source.categories,
      });
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
    case "sprite":
      return `sprite:${match.id}`;
    case "spritePack":
      return `spritePack:${match.source}`;
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

/**
 * One line naming a match for a terminal list: kind, id and title.
 *
 * @capability describe-asset-match print a ranked asset match as one readable line
 */
export function describeAssetMatch(match: AssetMatch): string {
  switch (match.kind) {
    case "model":
      return `[model]     ${match.id}${match.via === "alias" ? "  (alias)" : match.via === "single" ? "  (single)" : ""}`;
    case "pack":
      return `[pack]      ${match.source} — ${match.title}`;
    case "material":
      return `[material]  ${match.id} — ${match.title}`;
    case "component":
      return `[component] ${match.name} — ${match.title}`;
    case "icon":
      return `[icon]      ${match.name}`;
    case "sprite":
      return `[sprite]    ${match.id}`;
    case "spritePack":
      return `[spritePack] ${match.source} — ${match.title}`;
  }
}
