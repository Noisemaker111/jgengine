import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assetStoreRoot, dirHasEntries, linkFromStore, mainCheckoutOf, seedCandidates, seedStore } from "./assetStore";

const assetsDir = fileURLToPath(new URL("../../packages/assets", import.meta.url));
const provisionScript = fileURLToPath(new URL("../scripts/provision-assets.ts", import.meta.url));

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
    if (!dirHasEntries(join(publicDir, dir))) jobs.push({ target: source.id, dir });
  }
  for (const entry of catalogs.library) {
    if (entry.origin.provider === "generated" || !text.includes(`"${entry.name}"`)) continue;
    const dir = join("models", "library", ...entry.name.split("/"));
    if (!dirHasEntries(join(publicDir, dir))) jobs.push({ target: `model:${entry.name}`, dir });
  }
  return jobs;
}

/** The scan behind `DEFAULT_ROAD_SCAN` (`@jgengine/core/world/features`), the library's `asphalt/dry`. */
export const DEFAULT_ROAD_SCAN_SOURCE = "ambientcg-asphalt003";
const PAVED_PATH = /"kind":\s*"(road|street|track|avenue|highway)"/;

/**
 * Whether a game draws a paved road — a `road(` call in its source or a paved path kind in its
 * scene document — and so wears the engine's default scanned asphalt, which it must have on disk.
 */
export function drawsPavedRoad(sourceText: string, sceneText: string): boolean {
  return /\broad\(/.test(sourceText) || PAVED_PATH.test(sceneText);
}

async function loadCatalogs(): Promise<AssetCatalogs> {
  const module = (await import(join(assetsDir, "src/index.ts"))) as {
    sources: AssetCatalogs["sources"];
    MODEL_LIBRARY?: AssetCatalogs["library"];
  };
  return { sources: module.sources, library: module.MODEL_LIBRARY ?? [] };
}

function runPull(cwd: string, target: string, outRoot: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("bun", [join(assetsDir, "src/cli/pull.ts"), "pull", target, "--dir", outRoot], {
      cwd,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

export interface ProvisionResult {
  /** Targets now served from the shared store through a link. */
  linked: string[];
  /** Targets downloaded into the store by this call. */
  pulled: string[];
  /** Targets a download was tried for and failed. */
  failed: string[];
  /** Targets the store lacks and this call was told not to download (`download: false`). */
  absent: string[];
}

/**
 * Serve every pack and library model a game references and is missing from the shared asset store
 * (`assetStore.ts`): link it when the store has it, seed the store from a copy any checkout already
 * pulled, and only then download into the store. Already-present ones are skipped, so a provisioned
 * game costs one source scan. `download: false` links what the store has and downloads nothing.
 */
export async function provisionGame(
  gameDir: string,
  options: { log?: (line: string) => void; download?: boolean; env?: Readonly<Record<string, string | undefined>> } = {},
): Promise<ProvisionResult> {
  const log = options.log ?? console.log;
  const repoRoot = resolve(gameDir, "..", "..");
  const store = assetStoreRoot(repoRoot, options.env);
  const roots = [repoRoot, mainCheckoutOf(repoRoot) ?? repoRoot];
  const text = sourceText(join(gameDir, "src"));
  const scene = join(gameDir, "src", "editor.scene.json");
  const sceneText = existsSync(scene) ? readFileSync(scene, "utf8") : "";
  // Paved roads wear the default scanned asphalt even though no source line names its pack.
  const referenced = drawsPavedRoad(text, sceneText) ? `${text}\n"${DEFAULT_ROAD_SCAN_SOURCE}"` : text;
  const jobs = missingPulls(referenced, join(gameDir, "public"), await loadCatalogs());
  const result: ProvisionResult = { linked: [], pulled: [], failed: [], absent: [] };
  for (const job of jobs) {
    const storeDir = join(store, job.dir);
    if (!seedStore(storeDir, seedCandidates(roots, job.dir))) {
      if (options.download === false) {
        result.absent.push(job.target);
        continue;
      }
      log(`${basename(gameDir)}: pulling ${job.target} into the shared asset store ${store}`);
      if (!(await runPull(gameDir, job.target, store))) {
        result.failed.push(job.target);
        continue;
      }
      result.pulled.push(job.target);
    }
    if (linkFromStore(storeDir, join(gameDir, "public", job.dir))) result.linked.push(job.target);
    else result.failed.push(job.target);
  }
  return result;
}

/** Whether a dev server should pull missing assets: on by default, off in CI, `JG_DEV_PROVISION` overrides both. */
export function shouldProvision(env: Readonly<Record<string, string | undefined>>): boolean {
  if (env.JG_DEV_PROVISION === "0") return false;
  if (env.JG_DEV_PROVISION === "1") return true;
  return env.CI === undefined || env.CI === "" || env.CI === "false";
}

/**
 * Dev-only Vite plugin: before the game's dev server starts, pull any asset pack the game
 * references and does not have yet, so `bun run dev` on a fresh checkout shows real models instead
 * of placeholder boxes. `JG_DEV_PROVISION=0` skips it (offline work); CI skips it unless
 * `JG_DEV_PROVISION=1`, since a check booting a dev server must not wait on downloads.
 */
export function viteProvisionAssets(): { name: string; apply: "serve"; configureServer(server: { config: { root: string } }): Promise<void> } {
  return {
    name: "jg-dev-provision-assets",
    apply: "serve",
    async configureServer(server) {
      if (!shouldProvision(process.env)) return;
      // Vite runs under Node, which cannot load the asset catalogs' TypeScript source, so the work
      // runs in Bun: the same `games:provision` a lane would type.
      const game = basename(server.config.root);
      const ok = await new Promise<boolean>((resolve) => {
        const child = spawn("bun", [provisionScript, game], { cwd: server.config.root, stdio: "inherit", windowsHide: true });
        child.once("error", () => resolve(false));
        child.once("exit", (code) => resolve(code === 0));
      });
      if (!ok) console.error(`dev: some models are not on disk and will show as named MISSING boxes; run: bun run games:provision ${game}`);
    },
  };
}
