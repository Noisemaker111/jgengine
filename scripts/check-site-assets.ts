// The release gate on game assets: after the site build and before it is uploaded, every file and
// pack a game names must be in the built /play runner, in the game's own folder or the shared one.
// A missing one fails the deploy, so a game never reaches jgengine.com drawing placeholder boxes.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAME_PUBLIC_FOLDER, assetLiterals, modelSiblings } from "../apps/dev/gamePublicPlugin";
import { dirHasEntries } from "../packages/assets/src/assetStore";
import { gameAssetText, loadCatalogs, missingPulls, type AssetCatalogs } from "../games/shared/provisionAssets";
import { loadBudget } from "./perf-budget";
import { printHelpIfAsked } from "./script-help";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const USAGE = {
  summary: "fail when a game's models, textures or sounds are missing from the built /play runner, or its bundle is over its bundleKb budget",
  usage: "bun scripts/check-site-assets.ts [<built play dir>]",
  example: "bun scripts/check-site-assets.ts apps/web/dist/client/play",
  flags: [{ flag: "<built play dir>", detail: "the runner build to check (default apps/web/dist/client/play)" }],
};

/** The games the runner can load: a `games/<id>` with a `src/index.tsx`. */
export function runnerGames(gamesDir: string): string[] {
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && existsSync(join(gamesDir, entry.name, "src", "index.tsx")))
    .map((entry) => entry.name)
    .sort();
}

function fileIn(root: string, path: string): boolean {
  const file = join(root, ...path.split("/"));
  return existsSync(file) && statSync(file).isFile();
}

/**
 * What one game names that the built runner lacks: each literal asset path and each pack or library
 * model, looked up in the game's own folder (`games/<id>/`) first and the runner's shared files after.
 */
export function missingGameAssets(game: string, text: string, playDir: string, catalogs: AssetCatalogs): string[] {
  const own = join(playDir, GAME_PUBLIC_FOLDER, game);
  const missing: string[] = [];
  const models: { path: string; file: string }[] = [];
  for (const path of assetLiterals(text)) {
    const root = fileIn(own, path) ? own : fileIn(playDir, path) ? playDir : null;
    if (root === null) missing.push(path);
    else if (/\.(gltf|glb)$/.test(path)) models.push({ path, file: join(root, ...path.split("/")) });
  }
  // A model's own textures and buffers load beside it, so each must ship too.
  for (const { path, file } of models) {
    for (const sibling of modelSiblings(path, file)) {
      if (!fileIn(own, sibling) && !fileIn(playDir, sibling) && !missing.includes(sibling)) missing.push(sibling);
    }
  }
  for (const job of missingPulls(text, own, catalogs)) {
    if (!dirHasEntries(join(playDir, job.dir))) missing.push(`${job.dir.split("\\").join("/")}/ (${job.target})`);
  }
  return missing;
}

/** What one game adds to the runner shell, in bytes of JS and CSS. `ownBytes` is the part no other game loads. */
export interface GameBundle {
  bytes: number;
  ownBytes: number;
  files: number;
}

/**
 * Per-game bundle sizes from the built runner. The runner's registry chunk maps each game's entry to the chunks Vite
 * preloads for it (`__vite__mapDeps`); a game's bundle is that list minus the shell `index.html` already loads.
 */
export function gameBundles(playDir: string): Map<string, GameBundle> {
  const assets = join(playDir, "assets");
  const registry = readdirSync(assets).find((name) => /^registries-.*\.js$/.test(name));
  if (registry === undefined) throw new Error(`no runner registry chunk in ${assets}; build the runner first`);
  const text = readFileSync(join(assets, registry), "utf8");
  const listed = /m\.f=(\[[^\]]*\])/.exec(text);
  if (listed?.[1] === undefined) throw new Error(`${registry} has no preload file list; the runner build layout changed`);
  const names: unknown = JSON.parse(listed[1]);
  if (!Array.isArray(names)) throw new Error(`${registry} preload list is not an array`);
  const shell = new Set(
    [...readFileSync(join(playDir, "index.html"), "utf8").matchAll(/assets\/([^"]+\.(?:js|css))/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]])),
  );
  const perGame = new Map<string, Set<string>>();
  const entry = /"(?:\.\.\/)+games\/([a-z0-9-]+)\/src\/index\.tsx":\(\)=>\w+\(\(\)=>import\(`\.\/([^`]+)`\),__vite__mapDeps\(\[([\d,]*)\]\)\)/g;
  for (const match of text.matchAll(entry)) {
    const [, game, chunk, indexes] = match;
    if (game === undefined || chunk === undefined || indexes === undefined || perGame.has(game)) continue;
    const files = new Set<string>([chunk]);
    for (const index of indexes.split(",")) {
      const name = names[Number(index)];
      if (typeof name === "string") files.add(name.replace(/^assets\//, ""));
    }
    perGame.set(game, new Set([...files].filter((name) => /\.(?:js|css)$/.test(name) && !shell.has(name))));
  }
  const loadedBy = new Map<string, number>();
  for (const files of perGame.values()) for (const name of files) loadedBy.set(name, (loadedBy.get(name) ?? 0) + 1);
  const size = (name: string) => statSync(join(assets, name)).size;
  const out = new Map<string, GameBundle>();
  for (const [game, files] of perGame) {
    let bytes = 0;
    let ownBytes = 0;
    for (const name of files) {
      bytes += size(name);
      if (loadedBy.get(name) === 1) ownBytes += size(name);
    }
    out.set(game, { bytes, ownBytes, files: files.size });
  }
  return out;
}

const kib = (bytes: number): number => Math.round((bytes / 1024) * 10) / 10;

/** A game's bundle against its `bundleKb` budget: the printed table and the games over or without one. */
export function bundleBudgetReport(bundles: ReadonlyMap<string, GameBundle>, budgetKb: (game: string) => number | undefined): { table: string; failures: string[] } {
  const rows: string[] = [];
  const failures: string[] = [];
  const header = ["game", "bundle KiB", "own KiB", "budget KiB", "headroom", "files"];
  for (const [game, bundle] of [...bundles].sort(([a], [b]) => a.localeCompare(b))) {
    const budget = budgetKb(game);
    const size = kib(bundle.bytes);
    const headroom = budget === undefined ? "no budget" : `${Math.round(((budget - size) / budget) * 100)}%`;
    if (budget === undefined) failures.push(`${game}: no bundleKb budget (add it to its perf-budget.json; today it is ${size} KiB)`);
    else if (size > budget) failures.push(`${game}: bundle ${size} KiB is over its ${budget} KiB budget`);
    rows.push([game, String(size), String(kib(bundle.ownBytes)), budget === undefined ? "-" : String(budget), headroom, String(bundle.files)].join("\t"));
  }
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row.split("\t")[column]?.length ?? 0)));
  const line = (cells: string[]) => cells.map((cell, column) => (column === 0 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0))).join("  ");
  return { table: [line(header), ...rows.map((row) => line(row.split("\t")))].join("\n"), failures };
}

/** Every game's missing assets, keyed by game; an empty map passes. */
export async function checkSiteAssets(playDir: string, gamesDir: string): Promise<Map<string, string[]>> {
  const catalogs = await loadCatalogs();
  const failures = new Map<string, string[]>();
  for (const game of runnerGames(gamesDir)) {
    const missing = missingGameAssets(game, gameAssetText(join(gamesDir, game)), playDir, catalogs);
    if (missing.length > 0) failures.set(game, missing);
  }
  return failures;
}

if (import.meta.main) {
  if (printHelpIfAsked("check-site-assets", USAGE)) process.exit(0);
  const playDir = process.argv[2] ?? join(repoRoot, "apps", "web", "dist", "client", "play");
  if (!existsSync(join(playDir, "index.html"))) {
    console.error(`check-site-assets FAILED: no runner build at ${playDir}; build the site first (bun --cwd=apps/web run build)`);
    process.exit(1);
  }
  const failures = await checkSiteAssets(playDir, join(repoRoot, "games"));
  const bundle = bundleBudgetReport(gameBundles(playDir), (game) => {
    try {
      return loadBudget(game, repoRoot).budget.bundleKb;
    } catch {
      return undefined;
    }
  });
  console.log(bundle.table);
  if (failures.size === 0 && bundle.failures.length === 0) {
    console.log(`check-site-assets: every game's assets are in ${playDir} and every bundle is inside its budget`);
    process.exit(0);
  }
  if (bundle.failures.length > 0) {
    for (const failure of bundle.failures) console.error(failure);
    console.error(`check-site-assets FAILED: ${bundle.failures.length} bundles over budget; trim the game's imports, or raise bundleKb in its perf-budget.json with the reason`);
    if (failures.size === 0) process.exit(1);
  }
  let total = 0;
  for (const [game, missing] of failures) {
    total += missing.length;
    console.error(`${game}: ${missing.length} missing`);
    for (const path of missing.slice(0, 8)) console.error(`  ${path}`);
    if (missing.length > 8) console.error(`  +${missing.length - 8} more`);
  }
  console.error(`check-site-assets FAILED: ${total} assets across ${failures.size} games are not in the build; run bun run games:provision, then rebuild`);
  process.exit(1);
}
