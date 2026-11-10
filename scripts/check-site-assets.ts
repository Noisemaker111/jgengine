// Two checks on the built /play runner.
// Assets (default): every file and pack a game names must be in the runner, in the game's own folder or
// the shared one, so a game never reaches jgengine.com drawing placeholder boxes. The release runs it.
// Bundles (--bundles): the engine every game downloads is measured once against apps/dev/bundle-budget.json,
// and each game's own part against bundleKb in its perf-budget.json. CI's web-build job runs it before merge.
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
  summary: "fail when a game's models, textures or sounds are missing from the built /play runner; with --bundles, when the shared engine or a game's own code is over its budget",
  usage: "bun scripts/check-site-assets.ts [--bundles] [<built play dir>]",
  example: "bun scripts/check-site-assets.ts --bundles apps/web/dist/client/play",
  flags: [
    { flag: "--bundles", detail: "check download sizes instead of assets: engineKb in apps/dev/bundle-budget.json, bundleKb in each game's perf-budget.json" },
    { flag: "--before-upload", detail: "on failure, also say that a deploy must go through `bun run deploy:site` (the built site's wrangler.json runs the check this way before every upload)" },
    { flag: "<built play dir>", detail: "the runner build to check (default apps/web/dist/client/play)" },
  ],
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

/** Bytes of JS and CSS and how many files they span. */
export interface BundlePart {
  bytes: number;
  files: number;
}

/** What one game downloads past the runner shell: all of it, and the part beyond the shared engine. */
export interface GameBundle {
  total: BundlePart;
  own: BundlePart;
}

/**
 * The built runner's downloads, past the shell `index.html` already loads: the engine every game
 * shares, measured once, and what each game adds on top of it.
 */
export interface RunnerBundles {
  engine: BundlePart;
  games: Map<string, GameBundle>;
}

/**
 * Bundle sizes from the built runner. The runner's registry chunk maps each game's entry to the chunks Vite
 * preloads for it (`__vite__mapDeps`); a game's download is that list minus the shell. The engine is the
 * files every game preloads; a game's own part is the rest, including chunks it shares with only some games.
 */
export function runnerBundles(playDir: string): RunnerBundles {
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
  const fileSets = [...perGame.values()];
  const engine = new Set(fileSets.length === 0 ? [] : [...(fileSets[0] ?? [])].filter((name) => fileSets.every((files) => files.has(name))));
  const part = (names: Iterable<string>): BundlePart => {
    let bytes = 0;
    let files = 0;
    for (const name of names) {
      bytes += statSync(join(assets, name)).size;
      files += 1;
    }
    return { bytes, files };
  };
  const games = new Map<string, GameBundle>();
  for (const [game, files] of perGame) games.set(game, { total: part(files), own: part([...files].filter((name) => !engine.has(name))) });
  return { engine: part(engine), games };
}

const kib = (bytes: number): number => Math.round((bytes / 1024) * 10) / 10;

/** The shared engine's budget, in KiB: `engineKb` in the runner's `apps/dev/bundle-budget.json`. */
export function loadEngineBudgetKb(root: string): number | undefined {
  const file = join(root, "apps", "dev", "bundle-budget.json");
  if (!existsSync(file)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const value = raw !== null && typeof raw === "object" && "engineKb" in raw ? raw.engineKb : undefined;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * The runner's bundles against their budgets: the shared engine once against `engineKb`, and each game's
 * own part against its `bundleKb`. Returns the printed table and every part over or without a budget.
 */
export function bundleBudgetReport(
  bundles: RunnerBundles,
  engineBudgetKb: number | undefined,
  budgetKb: (game: string) => number | undefined,
): { table: string; failures: string[] } {
  const rows: string[] = [];
  const failures: string[] = [];
  const header = ["part", "KiB", "budget KiB", "headroom", "files", "download KiB"];
  const row = (name: string, part: BundlePart, budget: number | undefined, download: string, missing: string) => {
    const size = kib(part.bytes);
    if (budget === undefined) failures.push(`${name}: no budget (${missing}; today it is ${size} KiB)`);
    else if (size > budget) failures.push(`${name}: ${size} KiB is over its ${budget} KiB budget`);
    const headroom = budget === undefined ? "no budget" : `${Math.round(((budget - size) / budget) * 100)}%`;
    rows.push([name, String(size), budget === undefined ? "-" : String(budget), headroom, String(part.files), download].join("\t"));
  };
  row("engine (every game)", bundles.engine, engineBudgetKb, "-", "add engineKb to apps/dev/bundle-budget.json");
  for (const [game, bundle] of [...bundles.games].sort(([a], [b]) => a.localeCompare(b))) {
    row(game, bundle.own, budgetKb(game), String(kib(bundle.total.bytes)), "add bundleKb to its perf-budget.json");
  }
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((cells) => cells.split("\t")[column]?.length ?? 0)));
  const line = (cells: string[]) => cells.map((cell, column) => (column === 0 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0))).join("  ");
  return { table: [line(header), ...rows.map((cells) => line(cells.split("\t")))].join("\n"), failures };
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
  const args = process.argv.slice(2);
  const bundlesMode = args.includes("--bundles");
  // Wrangler runs this with `--before-upload` before every upload of the built site, so a bare
  // `wrangler deploy` is refused too; the refusal names the one command that deploys correctly.
  const refuse = (): never => {
    if (args.includes("--before-upload")) {
      console.error("wrangler deploy REFUSED: this build cannot go live as it is. Deploy jgengine.com with `bun run deploy:site` from the repository root: it provisions the game assets, builds, checks and uploads.");
    }
    process.exit(1);
  };
  const playDir = args.find((arg) => !arg.startsWith("--")) ?? join(repoRoot, "apps", "web", "dist", "client", "play");
  if (!existsSync(join(playDir, "index.html"))) {
    console.error(`check-site-assets FAILED: no runner build at ${playDir}; build the site first (bun --cwd=apps/web run build)`);
    refuse();
  }
  if (bundlesMode) {
    const bundle = bundleBudgetReport(runnerBundles(playDir), loadEngineBudgetKb(repoRoot), (game) => {
      try {
        return loadBudget(game, repoRoot).budget.bundleKb;
      } catch {
        return undefined;
      }
    });
    console.log(bundle.table);
    if (bundle.failures.length === 0) {
      console.log("check-site-assets: the shared engine and every game's own code are inside their budgets");
      process.exit(0);
    }
    for (const failure of bundle.failures) console.error(failure);
    console.error(
      `check-site-assets FAILED: ${bundle.failures.length} over or without a budget; trim the imports (load a heavy optional system on demand), or raise the budget for a real feature with the reason beside it`,
    );
    process.exit(1);
  }
  const failures = await checkSiteAssets(playDir, join(repoRoot, "games"));
  if (failures.size === 0) {
    console.log(`check-site-assets: every game's assets are in ${playDir}`);
    process.exit(0);
  }
  let total = 0;
  for (const [game, missing] of failures) {
    total += missing.length;
    console.error(`${game}: ${missing.length} missing`);
    for (const path of missing.slice(0, 8)) console.error(`  ${path}`);
    if (missing.length > 8) console.error(`  +${missing.length - 8} more`);
  }
  console.error(`check-site-assets FAILED: ${total} assets across ${failures.size} games are not in the build; run bun run games:provision, then rebuild`);
  refuse();
}
