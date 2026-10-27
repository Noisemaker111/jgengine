// The release gate on game assets: after the site build and before it is uploaded, every file and
// pack a game names must be in the built /play runner, in the game's own folder or the shared one.
// A missing one fails the deploy, so a game never reaches jgengine.com drawing placeholder boxes.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAME_PUBLIC_FOLDER, assetLiterals, modelSiblings } from "../apps/dev/gamePublicPlugin";
import { dirHasEntries } from "../packages/assets/src/assetStore";
import { gameAssetText, loadCatalogs, missingPulls, type AssetCatalogs } from "../games/shared/provisionAssets";
import { printHelpIfAsked } from "./script-help";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const USAGE = {
  summary: "fail when a game's models, textures or sounds are missing from the built /play runner",
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
  process.exit(1);
}
