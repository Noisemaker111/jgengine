import { findLibraryModel, libraryModel, libraryModelDir, libraryModelGap } from "./catalogs/modelLibrary";
import { generatedIndex } from "./generated";
import { keyFromFile } from "./indexGen";
import type { IndexEntry } from "./manifest";
import { rankAssets, scoreAssetText } from "./rankAssets";
import { singles } from "./singles";
import { sourceById } from "./sources";

/** A model file a game already ships under its `public/` (`models/imported/creatures/trex.glb`). */
export interface GameModelFile {
  /** The game folder it was found in. */
  game: string;
  /** Path under that game's `public/`, POSIX separators. */
  rel: string;
}

interface FoundBase {
  /** What to name this match by: a `pack/model` id, a library name, a pack id or `<game>:<path>`. */
  id: string;
  title: string;
  /** 0 (none) to 100 (exact). */
  score: number;
  /** SPDX id or the source's own wording; `null` when the folder it came from does not say. */
  license: string | null;
  author: string | null;
  /** Whether the bytes are on disk where the game serves them from (or in the shared store, with no game named). */
  onDisk: boolean;
}

/** One answer to an asset request, shaped by where its bytes come from. */
export type FoundAsset =
  /** A model inside a catalog pack: `url` is what a `ModelConfig` loads once the pack is in the game. */
  | (FoundBase & { kind: "model"; source: string; url: string; pull: string })
  /** A realistic library model: draw it with `libraryModel(name)`; `pull` is `null` for one a game generated and committed. */
  | (FoundBase & { kind: "library"; url: string; use: string; pull: string | null })
  /** A whole catalog pack whose files are not indexed yet: pull it, then `jgengine assets list --source <id>`. */
  | (FoundBase & { kind: "pack"; source: string; pull: string })
  /** A file another game (or this one) already ships: provisioning copies it to the same path in this game. */
  | (FoundBase & { kind: "game-file"; from: string; url: string });

/** A free source to look on when nothing here fits, with the search already filled in. */
export interface ElsewhereSource {
  source: string;
  url: string;
  covers: string;
}

/** Everything one request turned up. */
export interface AssetFindResult {
  query: string;
  /** Best first; empty when nothing scored. */
  matches: FoundAsset[];
  /** The library's own note when it knows it has nothing realistic for this request. */
  gap: { reason: string; route: string } | null;
  /** Filled when no match is a confident one (score under {@link CONFIDENT_SCORE}). */
  elsewhere: ElsewhereSource[];
}

/** Where to look on disk: `has(rel)` answers for a path under the game's `public/` (or the store). */
export interface FindAssetsContext {
  has(rel: string): boolean;
  /** Model files games already ship; see {@link GameModelFile}. */
  gameFiles: readonly GameModelFile[];
  /** The game the paths are for, so its own files are not offered back to it as copies. */
  game?: string;
  /** Matches per request (default 5). */
  limit?: number;
}

/** A match at or above this score is a real answer; below it the free sources are offered too. */
export const CONFIDENT_SCORE = 60;
/** Matches below this score are dropped as noise. */
const MIN_SCORE = 30;

const indexById = new Map<string, IndexEntry>(generatedIndex.map((entry) => [entry.id, entry]));

function credit(sourceId: string): { license: string | null; author: string | null } {
  const source = sourceById.get(sourceId);
  return { license: source?.license ?? null, author: source?.author ?? null };
}

function catalogMatches(query: string, ctx: FindAssetsContext): FoundAsset[] {
  const found: FoundAsset[] = [];
  for (const { match, score } of rankAssets(query, { limit: 40 })) {
    if (match.kind === "model") {
      if (match.via === "single") {
        const single = singles.find((entry) => entry.id === match.id);
        if (single === undefined) continue;
        found.push({ kind: "model", id: match.id, title: match.id, score, license: single.license, author: single.author, source: match.source, url: single.url, pull: match.source, onDisk: true });
        continue;
      }
      const entry = indexById.get(match.id);
      if (entry === undefined) continue;
      found.push({
        kind: "model",
        id: entry.id,
        title: keyFromFile(entry.file),
        score,
        ...credit(entry.source),
        source: entry.source,
        url: `/models/${entry.source}/${entry.file}`,
        pull: entry.source,
        onDisk: ctx.has(`models/${entry.source}/${entry.file}`),
      });
    } else if (match.kind === "pack") {
      found.push({ kind: "pack", id: match.source, title: match.title, score, ...credit(match.source), source: match.source, pull: match.source, onDisk: ctx.has(`models/${match.source}`) });
    }
  }
  return found;
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

/**
 * The library's candidates rescored on the scale the catalog uses: an exact intent is 100, otherwise
 * each query word counts 80 when an intent names it and 60 when only the title does, averaged over
 * every query word, so "street lamp" ranks a lamp well above a tree that only shares "street".
 */
function libraryMatches(query: string, ctx: FindAssetsContext): FoundAsset[] {
  const wanted = query.trim().toLowerCase();
  const queryWords = words(wanted);
  return findLibraryModel(query, { limit: 10 }).map(({ entry }) => {
    const intentWords = new Set(entry.intents.flatMap(words));
    const titleWords = new Set([...words(entry.title), ...words(entry.name)]);
    const exact = entry.name === wanted || entry.intents.includes(wanted);
    const sum = queryWords.reduce((total, word) => total + (intentWords.has(word) ? 80 : titleWords.has(word) ? 60 : 0), 0);
    const url = libraryModel(entry.name).url;
    const generated = entry.origin.provider === "generated";
    return {
      kind: "library",
      id: entry.name,
      title: entry.title,
      score: exact ? 100 : Math.round(sum / Math.max(1, queryWords.length)),
      license: entry.license,
      author: entry.author,
      url,
      use: `libraryModel("${entry.name}")`,
      pull: generated ? null : `model:${entry.name}`,
      onDisk: generated ? ctx.has(url.replace(/^\//, "")) : ctx.has(`models/${libraryModelDir(entry.name)}`),
    };
  });
}

function fileName(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

function gameFileMatches(query: string, ctx: FindAssetsContext): FoundAsset[] {
  const found: FoundAsset[] = [];
  const seen = new Set<string>();
  // The game's own copy first, so a file several games ship is offered as already there.
  const files = [...ctx.gameFiles].sort((a, b) => Number(b.game === ctx.game) - Number(a.game === ctx.game));
  for (const file of files) {
    const parts = file.rel.split("/");
    const folder = parts[parts.length - 2] ?? "";
    const name = keyFromFile(fileName(file.rel)).replace(/\.gltf$/i, "");
    // A copy of a catalog pack's file is the catalog model; offer that instead of the copy.
    if (sourceById.has(folder) && indexById.has(`${folder}/${name}`)) continue;
    if (seen.has(file.rel)) continue;
    const score = scoreAssetText(query, name, `${folder} ${name}`);
    if (score < MIN_SCORE) continue;
    seen.add(file.rel);
    const own = file.game === ctx.game;
    found.push({
      kind: "game-file",
      id: `${file.game}:${file.rel}`,
      title: name,
      score,
      ...(sourceById.has(folder) ? credit(folder) : { license: null, author: null }),
      from: file.game,
      url: `/${file.rel}`,
      onDisk: own || ctx.has(file.rel),
    });
  }
  return found;
}

function elsewhere(query: string): ElsewhereSource[] {
  const q = encodeURIComponent(query.trim());
  return [
    { source: "Poly Pizza", url: `https://poly.pizza/search/${q}`, covers: "low-poly CC0 and CC-BY models, including Quaternius' animated animals, dinosaurs and monsters" },
    { source: "Poly Haven", url: `https://polyhaven.com/models?s=${q}`, covers: "realistic CC0 scans: props, furniture, plants, rocks" },
  ];
}

/**
 * Answer one asset request from everything the engine can reach: catalog pack models and aliases,
 * the realistic model library, whole packs not indexed yet, and model files games already ship.
 * Each match carries its licence, the URL a game loads it from and whether it is on disk; a weak
 * answer also names the free sources to search, and the library's own note when it knows the gap.
 *
 * @capability find-assets look up many asset names at once: licence, game path, on-disk state and where else to look
 */
export function findAssets(query: string, ctx: FindAssetsContext): AssetFindResult {
  const all = [...catalogMatches(query, ctx), ...libraryMatches(query, ctx), ...gameFileMatches(query, ctx)]
    .filter((match) => match.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || Number(b.onDisk) - Number(a.onDisk) || a.id.localeCompare(b.id));
  const matches = all.slice(0, ctx.limit ?? 5);
  const confident = (matches[0]?.score ?? 0) >= CONFIDENT_SCORE;
  const gap = libraryModelGap(query);
  return {
    query,
    matches,
    gap: gap === null ? null : { reason: gap.reason, route: gap.route },
    elsewhere: confident ? [] : elsewhere(query),
  };
}

