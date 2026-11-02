import { existsSync, readFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative } from "node:path";

import { assetStoreRoot } from "../../packages/assets/src/assetStore";
import {
  buildModelLods,
  cachedLodMeta,
  describeLodBuild,
  lodPlanHash,
  modelSourceHash,
  type ImpostorBakePlan,
  type LodBuildPlan,
  type ModelLodBuildResult,
} from "../../packages/assets/src/modelLodBuild";
import { compressTextures } from "./compressTextures";
import { startImpostorBaker } from "./impostorBaker";
import { textureVariantDir } from "./textureVariants";

/**
 * The asset pipeline for one game, one call: GPU-compressed texture twins, simplified mesh levels and
 * baked impostors for the model files its `jgengine.json` `assetBuild` names under `public/`. Every
 * step is cached by content (textures by hash in the store's `.ktx2/`, levels and atlases by source
 * and plan hash in `<file>.lods/meta.json`), so a second run costs a pass of hashing.
 *
 *   "assetBuild": {
 *     "lods": { "include": ["models/library/nature/bush/near.gltf"], "levels": [{ "ratio": 0.4 }, { "ratio": 0.12, "error": 0.03 }] },
 *     "impostors": { "include": ["models/library/nature/jacaranda/near.gltf"], "frames": 8, "cell": 128 }
 *   }
 */
export interface GameAssetBuildPlan {
  readonly lods?: LodBuildPlan & { readonly include: readonly string[]; readonly exclude?: readonly string[] };
  readonly impostors?: ImpostorBakePlan & { readonly include: readonly string[] };
}

/** Most worker threads the pipeline runs at once; the PC is shared. */
export const MAX_ASSET_WORKERS = 4;

/** Read `assetBuild` from a game's `jgengine.json`; null when it has none. */
export function readAssetBuildPlan(gameDir: string): GameAssetBuildPlan | null {
  const path = join(gameDir, "jgengine.json");
  if (!existsSync(path)) return null;
  const json: unknown = JSON.parse(readFileSync(path, "utf8"));
  const plan: unknown = typeof json === "object" && json !== null ? Reflect.get(json, "assetBuild") : undefined;
  if (plan === undefined) return null;
  return parseAssetBuildPlan(plan, path);
}

/** Validate an `assetBuild` value, naming the field that is wrong. */
export function parseAssetBuildPlan(value: unknown, where = "assetBuild"): GameAssetBuildPlan {
  if (typeof value !== "object" || value === null) throw new Error(`${where}: assetBuild must be an object`);
  const lods: unknown = Reflect.get(value, "lods");
  const impostors: unknown = Reflect.get(value, "impostors");
  const strings = (list: unknown, field: string): string[] => {
    if (!Array.isArray(list) || !list.every((item) => typeof item === "string")) throw new Error(`${where}: ${field} must be a list of globs under public/`);
    return list.map(String);
  };
  const plan: { lods?: GameAssetBuildPlan["lods"]; impostors?: GameAssetBuildPlan["impostors"] } = {};
  if (lods !== undefined) {
    if (typeof lods !== "object" || lods === null) throw new Error(`${where}: assetBuild.lods must be an object`);
    const levels: unknown = Reflect.get(lods, "levels");
    if (!Array.isArray(levels) || levels.length === 0) throw new Error(`${where}: assetBuild.lods.levels lists at least one { ratio, error? }`);
    const parsed = levels.map((level: unknown, index) => {
      const ratio: unknown = typeof level === "object" && level !== null ? Reflect.get(level, "ratio") : undefined;
      const error: unknown = typeof level === "object" && level !== null ? Reflect.get(level, "error") : undefined;
      if (typeof ratio !== "number" || !(ratio > 0 && ratio < 1)) throw new Error(`${where}: assetBuild.lods.levels[${index}].ratio must be between 0 and 1`);
      if (error !== undefined && typeof error !== "number") throw new Error(`${where}: assetBuild.lods.levels[${index}].error must be a number`);
      return error === undefined ? { ratio } : { ratio, error };
    });
    const exclude: unknown = Reflect.get(lods, "exclude");
    const minTriangles: unknown = Reflect.get(lods, "minTriangles");
    const minReduction: unknown = Reflect.get(lods, "minReduction");
    plan.lods = {
      include: strings(Reflect.get(lods, "include"), "assetBuild.lods.include"),
      levels: parsed,
      ...(exclude === undefined ? {} : { exclude: strings(exclude, "assetBuild.lods.exclude") }),
      ...(typeof minTriangles === "number" ? { minTriangles } : {}),
      ...(typeof minReduction === "number" ? { minReduction } : {}),
    };
  }
  if (impostors !== undefined) {
    if (typeof impostors !== "object" || impostors === null) throw new Error(`${where}: assetBuild.impostors must be an object`);
    const frames: unknown = Reflect.get(impostors, "frames");
    const cell: unknown = Reflect.get(impostors, "cell");
    plan.impostors = {
      include: strings(Reflect.get(impostors, "include"), "assetBuild.impostors.include"),
      ...(typeof frames === "number" ? { frames } : {}),
      ...(typeof cell === "number" ? { cell } : {}),
    };
  }
  return plan;
}

/** The files under `publicDir` the globs name, in a stable order. Links into the asset store are followed. */
export function matchPublicFiles(publicDir: string, include: readonly string[], exclude: readonly string[] = []): string[] {
  const found = new Set<string>();
  const skip = exclude.map((pattern) => new Bun.Glob(pattern));
  for (const pattern of include) {
    // walk-ok: the game names these globs in its own jgengine.json; the scan stays inside its public/.
    for (const relative of new Bun.Glob(pattern).scanSync({ cwd: publicDir, followSymlinks: true, onlyFiles: true })) {
      if (relative.includes(".lods/") || skip.some((glob) => glob.match(relative))) continue;
      found.add(relative);
    }
  }
  return [...found].sort().map((relative) => join(publicDir, relative));
}

export interface GameAssetBuildOptions {
  log?: (line: string) => void;
  /** Encode KTX2 texture twins. Default true. */
  textures?: boolean;
  /** Build simplified levels. Default true. */
  lods?: boolean;
  /** Bake impostors in a headless browser. Default true. */
  impostors?: boolean;
  workers?: number;
}

export interface GameAssetBuildSummary {
  readonly results: readonly ModelLodBuildResult[];
  readonly failed: readonly string[];
}

/** Run every step of a game's asset build; see {@link GameAssetBuildPlan}. */
export async function buildGameAssets(gameDir: string, options: GameAssetBuildOptions = {}): Promise<GameAssetBuildSummary> {
  const log = options.log ?? console.log;
  const workers = Math.max(1, Math.min(MAX_ASSET_WORKERS, options.workers ?? MAX_ASSET_WORKERS, cpus().length));
  const publicDir = join(gameDir, "public");
  const repoRoot = join(gameDir, "..", "..");
  if (options.textures !== false && existsSync(publicDir)) {
    const result = await compressTextures([publicDir], textureVariantDir(assetStoreRoot(repoRoot)), { log, workers });
    if (result !== null) log(`textures: ${result.images} image and ${result.models} model twins encoded, ${result.skipped} skipped`);
  }
  const plan = readAssetBuildPlan(gameDir);
  const results: ModelLodBuildResult[] = [];
  const failed: string[] = [];
  if (plan?.lods === undefined || options.lods === false || !existsSync(publicDir)) return { results, failed };
  const lodPlan = plan.lods;
  const files = matchPublicFiles(publicDir, lodPlan.include, lodPlan.exclude ?? []);
  const impostorFiles = new Set(plan.impostors !== undefined && options.impostors !== false ? matchPublicFiles(publicDir, plan.impostors.include) : []);
  const impostorPlan = plan.impostors === undefined ? null : { ...(plan.impostors.frames === undefined ? {} : { frames: plan.impostors.frames }), ...(plan.impostors.cell === undefined ? {} : { cell: plan.impostors.cell }) };
  const meshOnly = files.filter((file) => !impostorFiles.has(file));
  const record = (result: ModelLodBuildResult) => {
    results.push(result);
    if (result.status !== "cached") log(`lods: ${describeLodBuild(result, relative(publicDir, result.file))}`);
  };

  // Levels only: a pool of worker threads, each simplifying one file at a time.
  const pending = meshOnly.filter((file) => cachedLodMeta(file, modelSourceHash(file), lodPlanHash(lodPlan, null)) === null);
  for (const file of meshOnly) if (!pending.includes(file)) results.push({ file, status: "cached", meta: cachedLodMeta(file, modelSourceHash(file), lodPlanHash(lodPlan, null)) });
  await runWorkers(pending, Math.min(workers, pending.length), lodPlan, record, (file, error) => {
    failed.push(file);
    log(`lods: ${file}: ${error}`);
  });

  // Levels and an impostor: one browser page bakes them in turn.
  const toBake = [...impostorFiles];
  if (toBake.length > 0 && impostorPlan !== null) {
    const stale = toBake.filter((file) => cachedLodMeta(file, modelSourceHash(file), lodPlanHash(lodPlan, impostorPlan)) === null);
    for (const file of toBake) if (!stale.includes(file)) results.push({ file, status: "cached", meta: cachedLodMeta(file, modelSourceHash(file), lodPlanHash(lodPlan, impostorPlan)) });
    if (stale.length > 0) {
      const baker = await startImpostorBaker(publicDir);
      try {
        for (const file of stale) {
          try {
            record(await buildModelLods(file, lodPlan, { impostor: impostorPlan, bake: baker.bake }));
          } catch (error) {
            failed.push(file);
            log(`impostors: ${file}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } finally {
        await baker.close();
      }
    }
  }
  const built = results.filter((result) => result.status === "built").length;
  const cached = results.filter((result) => result.status === "cached").length;
  log(`lods: ${built} built, ${cached} cached, ${results.length - built - cached} skipped, ${failed.length} failed (${files.length + [...impostorFiles].filter((file) => !files.includes(file)).length} files)`);
  return { results, failed };
}

async function runWorkers(
  files: readonly string[],
  count: number,
  plan: LodBuildPlan,
  done: (result: ModelLodBuildResult) => void,
  fail: (file: string, error: string) => void,
): Promise<void> {
  if (files.length === 0) return;
  const queue = [...files];
  const pool = Array.from({ length: Math.max(1, count) }, () => new Worker(new URL("./modelLodWorker.ts", import.meta.url).href));
  try {
    await Promise.all(pool.map((worker) => new Promise<void>((resolve) => {
      const next = () => {
        const file = queue.shift();
        if (file === undefined) {
          resolve();
          return;
        }
        worker.onmessage = (event: MessageEvent<{ result?: ModelLodBuildResult; error?: string }>) => {
          if (event.data.result !== undefined) done(event.data.result);
          else fail(file, event.data.error ?? "unknown error");
          next();
        };
        worker.postMessage({ file, plan });
      };
      next();
    })));
  } finally {
    for (const worker of pool) worker.terminate();
  }
}
