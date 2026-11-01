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
  /** Shared-library keys (`gameicons:lorc/wheat`, `polyhaven:ArmChair_01`): what to pull and where it is served. */
  libraryPull?: (key: string) => LibraryPullJob | undefined;
  /** Library surfaces (`foliage/grass-dry`) and the material pack each is scanned from, so naming one serves its maps. Loaded lazily: the library imports `@jgengine/core`, which the vite config must not pull in. */
  materials?: readonly { name: string; source?: string | undefined }[];
  /** Curated HDRIs, colour grades and fonts a game's source names by id (`hdriEnvironment("golden-hour")`). */
  lookJobs?: (text: string) => readonly { target: string; dir: string }[];
}

/** A pull for one shared-library key, with the URL the game loads once it is served. */
export interface LibraryPullJob extends PullJob {
  url: string;
}

const LIBRARY_KEY = /["'`]((?:ambientcg|polyhaven|gameicons|sketchfab|kaykit|quaternius|rocketbox|makehuman|smithsonian):[A-Za-z0-9_./-]+)["'`]/g;

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
 * string literal, as does a material-library name (`"ground/beach"`) that maps to it; generated library models are committed by the game itself, so they never need a pull.
 */
export function missingPulls(text: string, publicDir: string, catalogs: AssetCatalogs): PullJob[] {
  const quoted = (id: string): boolean => text.includes(`"${id}"`) || text.includes(`'${id}'`);
  const aliased = new Set((catalogs.aliases ?? []).filter((alias) => quoted(alias.key)).map((alias) => alias.target.split("/")[0]!));
  const jobs: PullJob[] = [];
  const named = new Set((catalogs.materials ?? []).filter((entry) => entry.source !== undefined && quoted(entry.name)).map((entry) => entry.source));
  for (const source of catalogs.sources) {
    if (!quoted(source.id) && !aliased.has(source.id) && !named.has(source.id)) continue;
    const subdir = source.kind === "material" ? "materials" : source.kind === "sprite" ? "sprites" : "models";
    const dir = join(subdir, source.id);
    if (!dirHasEntries(join(publicDir, dir))) jobs.push({ target: source.id, dir });
  }
  for (const entry of catalogs.library) {
    if (entry.origin.provider === "generated" || !text.includes(`"${entry.name}"`)) continue;
    const dir = join("models", "library", ...entry.name.split("/"));
    if (!dirHasEntries(join(publicDir, dir))) jobs.push({ target: `model:${entry.name}`, dir });
  }
  for (const look of catalogs.lookJobs?.(text) ?? []) {
    if (!dirHasEntries(join(publicDir, look.dir))) jobs.push({ target: look.target, dir: look.dir });
  }
  if (catalogs.libraryPull !== undefined) {
    for (const match of text.matchAll(LIBRARY_KEY)) {
      const job = match[1] === undefined ? undefined : catalogs.libraryPull(match[1]);
      if (job === undefined || jobs.some((other) => other.dir === job.dir) || dirHasEntries(join(publicDir, job.dir))) continue;
      jobs.push(job);
    }
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
  const materialLibrary: { MATERIAL_LIBRARY: NonNullable<AssetCatalogs["materials"]> } = await import(join(assetsDir, "src/catalogs/materialLibrary.ts"));
  const index: typeof import("../../packages/assets/src/library/libraryIndex") = await import(join(assetsDir, "src/library/libraryIndex.ts"));
  const served: typeof import("../../packages/assets/src/library/libraryServed") = await import(join(assetsDir, "src/library/libraryServed.ts"));
  const byKey = new Map(index.assetLibrary().map((entry) => [entry.key, entry]));
  const libraryPull = (key: string): LibraryPullJob | undefined => {
    const entry = byKey.get(key);
    if (entry === undefined) return undefined;
    const path = served.libraryServedPath(entry);
    return { target: entry.pack ?? entry.key, dir: join(...path.dir.split("/")), url: path.url };
  };
  const curated: typeof import("../../packages/assets/src/catalogs/curatedPull") = await import(join(assetsDir, "src/catalogs/curatedPull.ts"));
  return { sources: module.sources, library: module.MODEL_LIBRARY ?? [], aliases: module.aliases ?? [], materials: materialLibrary.MATERIAL_LIBRARY, libraryPull, lookJobs: curated.curatedJobsIn };
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

/**
 * Serve one shared-library key in a game: link it from the shared asset store, or pull it into the
 * store first. Returns the URL the game loads, or null for an unknown key or a failed pull.
 */
export async function provisionLibraryKey(gameDir: string, key: string, options: { log?: (line: string) => void } = {}): Promise<{ url: string; files: string[] } | null> {
  const job = (await loadCatalogs()).libraryPull?.(key);
  if (job === undefined) return null;
  const result = await provisionJobs(gameDir, [job], { pull: (target, outRoot) => runPull(gameDir, target, outRoot), log: options.log });
  if (result.failed.length > 0) return null;
  const servedDir = job.dir.split(sep).join("/");
  return { url: job.url, files: servedFiles(join(gameDir, "public", job.dir)).map((path) => `/${servedDir}/${path}`) };
}

/** Every file under a served asset folder, links followed, as paths relative to it. */
function servedFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  // walk-ok: one pulled asset's own folder, listed so a multi-game host can serve its files
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stat = statSync(path, { throwIfNoEntry: false });
    if (stat?.isDirectory() === true) out.push(...servedFiles(path, `${prefix}${name}/`));
    else if (stat?.isFile() === true) out.push(`${prefix}${name}`);
  }
  return out;
}

/** The dev-server route the editor's asset library posts `{ key }` to, answering `{ url }` once the asset is served. */
export const LIBRARY_PULL_ROUTE = "/__jgengine/library-pull";

/**
 * The handler for {@link LIBRARY_PULL_ROUTE}. `gameDirOf` names the game folder a request serves
 * into: a game's own server ignores the posted `game`, a host serving many games (the dev runner)
 * reads it. Answers `{ url, files }`, `files` being every root-absolute path the pull served.
 */
export function libraryPullMiddleware(gameDirOf: (game: string | undefined) => string | undefined) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (req.method !== "POST") return next();
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      const reply = (status: number, value: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(value));
      };
      let key: unknown;
      let game: unknown;
      try {
        const parsed: unknown = JSON.parse(body);
        key = typeof parsed === "object" && parsed !== null && "key" in parsed ? parsed.key : undefined;
        game = typeof parsed === "object" && parsed !== null && "game" in parsed ? parsed.game : undefined;
      } catch {
        key = undefined;
      }
      if (typeof key !== "string" || !/^[a-z]+:[A-Za-z0-9_./-]+$/.test(key)) return reply(400, { error: "expected { key: \"<source>:<id>\" }" });
      const gameDir = gameDirOf(typeof game === "string" ? game : undefined);
      if (gameDir === undefined) return reply(404, { error: `no game ${String(game)} to serve ${key} into` });
      // Vite runs under Node, which cannot load the library index's TypeScript, so Bun does the pull.
      const child = spawn("bun", [provisionScript, basename(gameDir), "--library", key], { cwd: gameDir, windowsHide: true });
      let out = "";
      child.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
      });
      child.once("error", () => reply(500, { error: "bun is not on PATH" }));
      child.once("exit", (code) => {
        const last = out.trim().split(/\r?\n/).pop() ?? "";
        try {
          const parsed: unknown = JSON.parse(last);
          if (code === 0 && typeof parsed === "object" && parsed !== null && "url" in parsed) return reply(200, parsed);
        } catch {
          // fall through to the failure reply
        }
        reply(502, { error: `could not provision ${key}; run: bun run games:provision ${basename(gameDir)}` });
      });
    });
  };
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
  configureServer(server: {
    config: { root: string; publicDir: string };
    middlewares: { use(handler: ReturnType<typeof textureVariantMiddleware>): void; use(route: string, handler: ReturnType<typeof libraryPullMiddleware>): void };
  }): Promise<void>;
} {
  return {
    name: "jg-dev-provision-assets",
    apply: "serve",
    async configureServer(server) {
      const repoRoot = resolve(server.config.root, "..", "..");
      if (server.config.publicDir) server.middlewares.use(textureVariantMiddleware(server.config.publicDir, textureVariantDir(assetStoreRoot(repoRoot))));
      server.middlewares.use(LIBRARY_PULL_ROUTE, libraryPullMiddleware(() => server.config.root));
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
