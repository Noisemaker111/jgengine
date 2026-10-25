import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDir = fileURLToPath(new URL("../../packages/assets", import.meta.url));

/** The asset catalogs a game's source is matched against. */
export interface AssetCatalogs {
  sources: readonly { id: string; kind?: string }[];
  library: readonly { name: string; origin: { provider: string } }[];
}

/** One pack or library model a game references and does not have on disk. */
export interface PullJob {
  /** The `pull` target: a pack id, or `model:<name>` for a library model. */
  target: string;
  /** Where it lands, relative to the game's `public/`. */
  dir: string;
}

function sourceText(dir: string): string {
  if (!existsSync(dir)) return "";
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

/**
 * The packs and library models a game's `src/` names that its `public/` lacks. A pack counts as
 * referenced when its id appears as a string literal; generated library models are committed by the
 * game itself, so they never need a pull.
 */
export function missingPulls(text: string, publicDir: string, catalogs: AssetCatalogs): PullJob[] {
  const jobs: PullJob[] = [];
  for (const source of catalogs.sources) {
    if (!text.includes(`"${source.id}"`) && !text.includes(`'${source.id}'`)) continue;
    const subdir = source.kind === "material" ? "materials" : source.kind === "sprite" ? "sprites" : "models";
    const dir = join(subdir, source.id);
    if (!isPopulated(join(publicDir, dir))) jobs.push({ target: source.id, dir });
  }
  for (const entry of catalogs.library) {
    if (entry.origin.provider === "generated" || !text.includes(`"${entry.name}"`)) continue;
    const dir = join("models", "library", ...entry.name.split("/"));
    if (!isPopulated(join(publicDir, dir))) jobs.push({ target: `model:${entry.name}`, dir });
  }
  return jobs;
}

async function loadCatalogs(): Promise<AssetCatalogs> {
  const module = (await import(join(assetsDir, "src/index.ts"))) as {
    sources: AssetCatalogs["sources"];
    MODEL_LIBRARY?: AssetCatalogs["library"];
  };
  return { sources: module.sources, library: module.MODEL_LIBRARY ?? [] };
}

function runPull(gameDir: string, target: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("bun", [join(assetsDir, "src/cli/pull.ts"), "pull", target, "--dir", join(gameDir, "public")], {
      cwd: gameDir,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

/**
 * Pull every pack and library model a game references and is missing. Already-present ones are
 * skipped, so a provisioned game costs one source scan. Returns the targets that failed.
 */
export async function provisionGame(gameDir: string, log: (line: string) => void = console.log): Promise<string[]> {
  const jobs = missingPulls(sourceText(join(gameDir, "src")), join(gameDir, "public"), await loadCatalogs());
  const failed: string[] = [];
  for (const job of jobs) {
    log(`${basename(gameDir)}: pulling ${job.target}`);
    if (!(await runPull(gameDir, job.target))) failed.push(job.target);
  }
  return failed;
}

/**
 * Dev-only Vite plugin: before the game's dev server starts, pull any asset pack the game
 * references and does not have yet, so `bun run dev` on a fresh checkout shows real models instead
 * of placeholder boxes. `JG_DEV_PROVISION=0` skips it (offline work).
 */
export function viteProvisionAssets(): { name: string; apply: "serve"; configureServer(server: { config: { root: string } }): Promise<void> } {
  return {
    name: "jg-dev-provision-assets",
    apply: "serve",
    async configureServer(server) {
      if (process.env.JG_DEV_PROVISION === "0") return;
      const failed = await provisionGame(server.config.root, (line) => console.error(`dev: ${line}`));
      if (failed.length > 0) {
        console.error(`dev: could not pull ${failed.join(", ")} - those models will show as named MISSING boxes`);
      }
    },
  };
}
