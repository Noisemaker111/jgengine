/**
 * Pull every asset pack a game references into its `public/`, so a fresh clone (or CI) can run,
 * test and capture without hand-pulling packs.
 *
 *   bun run games:provision                 every game
 *   bun run games:provision ember-command   one game
 *
 * A pack counts as referenced when its source id appears as a string literal in the game's `src/`;
 * a realistic library model (`city/street-lamp`) counts the same way and is pulled with
 * `pull model:<name>`. Anything already on disk is skipped, so re-running is cheap.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dir, "..");
const assetsDir = join(root, "..", "packages", "assets");

function gameDirs(only: string[]): string[] {
  return readdirSync(root)
    .filter((name) => existsSync(join(root, name, "src")) && existsSync(join(root, name, "package.json")))
    .filter((name) => only.length === 0 || only.includes(name));
}

function sourceText(dir: string): string {
  let text = "";
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) text += sourceText(path);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) text += readFileSync(path, "utf8");
  }
  return text;
}

function isPopulated(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

const only = process.argv.slice(2);
let failed = false;
for (const game of gameDirs(only)) {
  const gameDir = join(root, game);
  const { sources, MODEL_LIBRARY } = (await import(join(assetsDir, "src/index.ts"))) as {
    sources: readonly { id: string; kind?: string }[];
    MODEL_LIBRARY?: readonly { name: string; origin: { provider: string } }[];
  };
  const text = sourceText(join(gameDir, "src"));
  const referenced = sources.filter((source) => text.includes(`"${source.id}"`) || text.includes(`'${source.id}'`));
  for (const source of referenced) {
    const subdir = source.kind === "material" ? "materials" : source.kind === "sprite" ? "sprites" : "models";
    if (isPopulated(join(gameDir, "public", subdir, source.id))) continue;
    console.log(`${game}: pulling ${source.id}`);
    const result = spawnSync("bun", [join(assetsDir, "src/cli/pull.ts"), "pull", source.id, "--dir", join(gameDir, "public")], {
      cwd: gameDir,
      stdio: "inherit",
    });
    if (result.status !== 0) failed = true;
  }
  for (const entry of MODEL_LIBRARY ?? []) {
    // Generated models are committed by the game itself; every other provider is pulled from its source.
    if (entry.origin.provider === "generated" || !text.includes(`"${entry.name}"`)) continue;
    if (isPopulated(join(gameDir, "public", "models", "library", ...entry.name.split("/")))) continue;
    console.log(`${game}: pulling library model ${entry.name}`);
    const result = spawnSync("bun", [join(assetsDir, "src/cli/pull.ts"), "pull", `model:${entry.name}`, "--dir", join(gameDir, "public")], {
      cwd: gameDir,
      stdio: "inherit",
    });
    if (result.status !== 0) failed = true;
  }
}
process.exit(failed ? 1 : 0);
