import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { Logger, NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, prune, reorder, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

import { BUILT_LOD_VERSION, builtLodDir, parseBuiltLodMeta, type BuiltImpostor, type BuiltLodLevel, type BuiltLodMeta } from "@jgengine/core/lod/builtLods";

import { encodePng } from "./imageCodec";

/** One simplified level a build writes: the share of triangles to keep and the simplifier's error budget. */
export interface LodLevelPlan {
  /** Share of the source's triangles the level keeps, 0 to 1. */
  readonly ratio: number;
  /** Simplifier error budget as a share of the model's size. Default 0.01. */
  readonly error?: number;
}

/** How a game's models are simplified: data in the game's `jgengine.json` `assetBuild.lods`. */
export interface LodBuildPlan {
  /** Levels from the most to the least detailed. */
  readonly levels: readonly LodLevelPlan[];
  /** Models below this many triangles get no levels: a crate gains nothing. Default 500. */
  readonly minTriangles?: number;
  /** A level that keeps more than this share of the level before it is dropped, and so is every level after it. Default 0.85. */
  readonly minReduction?: number;
}

/** How far-view impostors are baked: data in `assetBuild.impostors`. */
export interface ImpostorBakePlan {
  /** View directions per atlas side; the atlas holds frames² views. Default 8. */
  readonly frames?: number;
  /** Pixels per view. Default 128. */
  readonly cell?: number;
}

/** A baked atlas pair as raw RGBA rows, bottom row first (as the GPU reads them back). */
export interface BakedImpostorPixels {
  readonly size: number;
  readonly albedo: Uint8Array;
  readonly normal: Uint8Array;
  readonly center: readonly [number, number, number];
  readonly radius: number;
}

/** Renders a model file's impostor atlas; the pipeline passes one backed by a headless browser. */
export type ImpostorBaker = (file: string, frames: number, cell: number) => Promise<BakedImpostorPixels | null>;

/** What one model's build did. */
export interface ModelLodBuildResult {
  readonly file: string;
  /** `cached`: the files on disk already match the source and plan. */
  readonly status: "built" | "cached" | "skipped";
  readonly reason?: string;
  readonly meta: BuiltLodMeta | null;
}

const DEFAULT_ERROR = 0.01;
const DEFAULT_MIN_TRIANGLES = 500;
const DEFAULT_MIN_REDUCTION = 0.85;
const DEFAULT_FRAMES = 8;
const DEFAULT_CELL = 128;
/** The material extras key a level keeps its source material index under; the runtime reskins by it. */
export const SOURCE_MATERIAL_KEY = "jgSourceMaterial";

let io: NodeIO | null = null;
const QUIET = new Logger(Logger.Verbosity.WARN);

async function nodeIO(): Promise<NodeIO> {
  if (io !== null) return io;
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  return io;
}

/** Triangles the scene draws, counting a mesh once per node that uses it. @internal */
export function sceneTriangles(document: Document): number {
  let count = 0;
  for (const scene of document.getRoot().listScenes()) {
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (mesh === null) return;
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4) continue;
        count += (primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0) / 3;
      }
    });
  }
  return Math.round(count);
}

/** Content hash of a model file and the resources a `.gltf` names beside it. @internal */
export function modelSourceHash(file: string): string {
  const hash = createHash("sha256").update(readFileSync(file));
  if (file.toLowerCase().endsWith(".gltf")) {
    const json: unknown = JSON.parse(readFileSync(file, "utf8"));
    const buffers = typeof json === "object" && json !== null && "buffers" in json && Array.isArray(json.buffers) ? json.buffers : [];
    for (const buffer of buffers) {
      const uri: unknown = typeof buffer === "object" && buffer !== null && "uri" in buffer ? buffer.uri : undefined;
      if (typeof uri !== "string" || uri.startsWith("data:")) continue;
      const path = join(dirname(file), decodeURIComponent(uri));
      if (existsSync(path)) hash.update(readFileSync(path));
    }
  }
  return hash.digest("hex").slice(0, 24);
}

/** Hash of everything in a plan that changes the files a build writes. @internal */
export function lodPlanHash(plan: LodBuildPlan, impostor: ImpostorBakePlan | null): string {
  return createHash("sha256")
    .update(JSON.stringify({ v: BUILT_LOD_VERSION, levels: plan.levels, min: plan.minTriangles ?? DEFAULT_MIN_TRIANGLES, reduce: plan.minReduction ?? DEFAULT_MIN_REDUCTION, impostor }))
    .digest("hex")
    .slice(0, 16);
}

/** The meta already on disk for `file`, when it matches the source and plan. @internal */
export function cachedLodMeta(file: string, source: string, plan: string): BuiltLodMeta | null {
  const path = join(builtLodDir(file), "meta.json");
  if (!existsSync(path)) return null;
  try {
    const meta = parseBuiltLodMeta(JSON.parse(readFileSync(path, "utf8")));
    return meta !== null && meta.source === source && meta.plan === plan ? meta : null;
  } catch {
    return null;
  }
}

function animated(document: Document): boolean {
  const root = document.getRoot();
  return root.listSkins().length > 0 || root.listAnimations().length > 0 ||
    root.listMeshes().some((mesh) => mesh.listPrimitives().some((primitive) => primitive.listTargets().length > 0));
}

/** One simplified level: the source with its textures dropped (the runtime keeps the source's maps). */
async function buildLevel(file: string, level: LodLevelPlan): Promise<{ bytes: Uint8Array; triangles: number }> {
  const reader = await nodeIO();
  const document = (await reader.read(file)).setLogger(QUIET);
  const root = document.getRoot();
  root.listMaterials().forEach((material, index) => material.setExtras({ ...material.getExtras(), [SOURCE_MATERIAL_KEY]: index }));
  for (const texture of root.listTextures()) texture.dispose();
  await document.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: level.ratio, error: level.error ?? DEFAULT_ERROR }),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  return { bytes: await reader.writeBinary(document), triangles: sceneTriangles(document) };
}

function writeAtomic(path: string, bytes: Uint8Array | string): void {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, bytes);
  renameSync(temp, path);
}

/**
 * Build the simplified levels (and, with a baker, the impostor atlas) for one model file into
 * `<file>.lods/`, the folder the runtime reads (`@jgengine/core/lod/builtLods`). Cached: a source
 * and plan that match the meta on disk rebuild nothing. Animated and skinned models are skipped.
 * @capability model-lod-build write simplified mesh levels and a baked impostor atlas beside a model file
 */
export async function buildModelLods(
  file: string,
  plan: LodBuildPlan,
  options: { impostor?: ImpostorBakePlan | null; bake?: ImpostorBaker } = {},
): Promise<ModelLodBuildResult> {
  const impostorPlan = options.bake === undefined ? null : options.impostor ?? null;
  const source = modelSourceHash(file);
  const planHash = lodPlanHash(plan, impostorPlan);
  const cached = cachedLodMeta(file, source, planHash);
  if (cached !== null) return { file, status: "cached", meta: cached };

  const reader = await nodeIO();
  const document = (await reader.read(file)).setLogger(QUIET);
  if (animated(document)) return { file, status: "skipped", reason: "animated or skinned", meta: null };
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (scene === undefined) return { file, status: "skipped", reason: "no scene", meta: null };
  const bounds = getBounds(scene);
  const triangles = sceneTriangles(document);

  const dir = builtLodDir(file);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const levels: BuiltLodLevel[] = [];
  if (triangles >= (plan.minTriangles ?? DEFAULT_MIN_TRIANGLES)) {
    let previous = triangles;
    for (const [index, level] of plan.levels.entries()) {
      const built = await buildLevel(file, level);
      if (built.triangles <= 0 || built.triangles > previous * (plan.minReduction ?? DEFAULT_MIN_REDUCTION)) break;
      const name = `lod${index + 1}.glb`;
      writeAtomic(join(dir, name), built.bytes);
      levels.push({ file: name, ratio: level.ratio, triangles: built.triangles });
      previous = built.triangles;
    }
  }

  let impostor: BuiltImpostor | undefined;
  if (impostorPlan !== null && options.bake !== undefined) {
    const frames = impostorPlan.frames ?? DEFAULT_FRAMES;
    const cell = impostorPlan.cell ?? DEFAULT_CELL;
    const baked = await options.bake(file, frames, cell);
    if (baked !== null) {
      writeAtomic(join(dir, "impostor-albedo.png"), encodePng({ width: baked.size, height: baked.size, data: baked.albedo }));
      writeAtomic(join(dir, "impostor-normal.png"), encodePng({ width: baked.size, height: baked.size, data: baked.normal }));
      impostor = { albedo: "impostor-albedo.png", normal: "impostor-normal.png", frames, cell, center: baked.center, radius: baked.radius };
    }
  }

  const meta: BuiltLodMeta = {
    version: BUILT_LOD_VERSION,
    source,
    plan: planHash,
    bounds: { min: [bounds.min[0], bounds.min[1], bounds.min[2]], max: [bounds.max[0], bounds.max[1], bounds.max[2]] },
    triangles,
    levels,
    ...(impostor === undefined ? {} : { impostor }),
  };
  writeAtomic(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  return { file, status: "built", meta };
}

/** A short line for one result: `name: 12,400 → 4,960 / 1,240 tris + impostor`. @internal */
export function describeLodBuild(result: ModelLodBuildResult, name = basename(result.file)): string {
  if (result.meta === null) return `${name}: skipped (${result.reason ?? "nothing to build"})`;
  const levels = result.meta.levels.map((level) => level.triangles.toLocaleString("en-US")).join(" / ");
  return `${name}: ${result.meta.triangles.toLocaleString("en-US")}${levels === "" ? "" : ` → ${levels}`} tris${result.meta.impostor === undefined ? "" : " + impostor"}${result.status === "cached" ? " (cached)" : ""}`;
}
