import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { assetStoreRoot, dirHasEntries, provisionJobs, type ProvisionResult, type PullJob } from "../../packages/assets/src/assetStore";
import { compressedVariant, textureVariantDir } from "./textureVariants";

const assetsDir = fileURLToPath(new URL("../../packages/assets", import.meta.url));
const provisionScript = fileURLToPath(new URL("../scripts/provision-assets.ts", import.meta.url));
const compressScript = fileURLToPath(new URL("../scripts/compress-textures.ts", import.meta.url));

/** The asset catalogs a game's source is matched against. */
export interface AssetCatalogs {
  sources: readonly { id: string; kind?: string }[];
  library: readonly { name: string; origin: { provider: string } }[];
  /** Semantic keys (`asset:prop_crate`, `nature/tree_pine`) and the `pack/model` ids they stand for. */
  aliases?: readonly { key: string; target: string }[];
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
 * referenced when its id, or an alias that resolves into it (`"asset:prop_crate"`), appears as a
 * string literal; generated library models are committed by the game itself, so they never need a pull.
 */
export function missingPulls(text: string, publicDir: string, catalogs: AssetCatalogs): PullJob[] {
  const quoted = (id: string): boolean => text.includes(`"${id}"`) || text.includes(`'${id}'`);
  const aliased = new Set((catalogs.aliases ?? []).filter((alias) => quoted(alias.key)).map((alias) => alias.target.split("/")[0]!));
  const jobs: PullJob[] = [];
  for (const source of catalogs.sources) {
    if (!quoted(source.id) && !aliased.has(source.id)) continue;
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

/**
 * The text a game's asset references are read from: its source, plus the default road scan's pack id
 * when it draws a paved road, since no source line names that pack.
 */
export function referencedAssetText(gameDir: string): string {
  const text = sourceText(join(gameDir, "src"));
  const scene = join(gameDir, "src", "editor.scene.json");
  const sceneText = existsSync(scene) ? readFileSync(scene, "utf8") : "";
  return drawsPavedRoad(text, sceneText) ? `${text}\n"${DEFAULT_ROAD_SCAN_SOURCE}"` : text;
}

/** Everything a game names assets in: its asset reference text plus its editor scene. */
export function gameAssetText(gameDir: string): string {
  const scene = join(gameDir, "src", "editor.scene.json");
  return `${referencedAssetText(gameDir)}\n${existsSync(scene) ? readFileSync(scene, "utf8") : ""}`;
}

/** The pack and model-library catalogs games are matched against. */
export async function loadCatalogs(): Promise<AssetCatalogs> {
  const module = (await import(join(assetsDir, "src/index.ts"))) as {
    sources: AssetCatalogs["sources"];
    MODEL_LIBRARY?: AssetCatalogs["library"];
    aliases?: AssetCatalogs["aliases"];
  };
  return { sources: module.sources, library: module.MODEL_LIBRARY ?? [], aliases: module.aliases ?? [] };
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
  const jobs = missingPulls(referencedAssetText(gameDir), join(gameDir, "public"), await loadCatalogs());
  return provisionJobs(gameDir, jobs, { pull: (target, outRoot) => runPull(gameDir, target, outRoot), log: options.log, download: options.download, env: options.env });
}

/** Whether a dev server should pull missing assets: on by default, off in CI, `JG_DEV_PROVISION` overrides both. */
export function shouldProvision(env: Readonly<Record<string, string | undefined>>): boolean {
  if (env["JG_DEV_PROVISION"] === "0") return false;
  if (env["JG_DEV_PROVISION"] === "1") return true;
  return env["CI"] === undefined || env["CI"] === "" || env["CI"] === "false";
}

/**
 * Encode the KTX2 twins of these games' textures (every game when `games` is empty) in a detached,
 * idle-priority process (`games:compress`), so a dev server starts at once and serves the twins
 * from the load after they land. Skipped wherever provisioning is (CI).
 */
export function startTextureCompression(cwd: string, games: readonly string[] = []): void {
  if (!shouldProvision(process.env)) return;
  try {
    spawn("bun", [compressScript, ...games], { cwd, detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
    // No bun on PATH: the originals keep serving.
  }
}

/** Connect middleware answering a `public/` request with its KTX2 twin when the store has one (`textureVariants.ts`). */
export function textureVariantMiddleware(publicDir: string, variantDir: string) {
  const base = resolve(publicDir);
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const [target = ""] = (req.url ?? "").split("#", 1);
    const query = target.indexOf("?");
    let file: string;
    try {
      file = resolve(base, normalize(decodeURIComponent(query < 0 ? target : target.slice(0, query))).replace(/^[\\/]+/, ""));
    } catch {
      return next();
    }
    if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
    const variant = compressedVariant(file, query < 0 ? "" : target.slice(query + 1), variantDir);
    if (variant === null) return next();
    const types: Record<string, string> = { ".ktx2": "image/ktx2", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json" };
    res.statusCode = 200;
    res.setHeader("Content-Type", types[extname(variant)] ?? "application/octet-stream");
    res.setHeader("Content-Length", String(statSync(variant).size));
    if (req.method === "HEAD") return void res.end();
    createReadStream(variant).pipe(res);
  };
}

/**
 * Dev-only Vite plugin: before the game's dev server starts, pull any asset pack the game
 * references and does not have yet, so `bun run dev` on a fresh checkout shows real models instead
 * of placeholder boxes. `JG_DEV_PROVISION=0` skips it (offline work); CI skips it unless
 * `JG_DEV_PROVISION=1`, since a check booting a dev server must not wait on downloads. Once the
 * game is provisioned its textures' KTX2 twins are encoded in the background and served as they land.
 */
export function viteProvisionAssets(): {
  name: string;
  apply: "serve";
  configureServer(server: { config: { root: string; publicDir: string }; middlewares: { use(handler: ReturnType<typeof textureVariantMiddleware>): void } }): Promise<void>;
} {
  return {
    name: "jg-dev-provision-assets",
    apply: "serve",
    async configureServer(server) {
      const repoRoot = resolve(server.config.root, "..", "..");
      if (server.config.publicDir) server.middlewares.use(textureVariantMiddleware(server.config.publicDir, textureVariantDir(assetStoreRoot(repoRoot))));
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
      startTextureCompression(server.config.root, [game]);
    },
  };
}
