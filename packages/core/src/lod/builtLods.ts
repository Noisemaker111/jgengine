// @skill jgengine-world
import type { ModelVariantLodConfig } from "./modelLod";

/**
 * Mesh levels and impostor atlases the asset build writes next to a model file, and the rules the
 * runtime uses to switch between them. The build (`@jgengine/assets` `buildModelLods`) and the
 * runtime read the same names and the same {@link BuiltLodMeta}, so neither guesses the other's files.
 */

/** Bumped whenever the files the build writes change shape, so a stale build is never read. */
export const BUILT_LOD_VERSION = 1;

/** One simplified level the build wrote: its file inside the model's lod folder and its cost. */
export interface BuiltLodLevel {
  /** File name inside {@link builtLodDir}. */
  readonly file: string;
  /** Share of the source's triangles the simplifier aimed for. */
  readonly ratio: number;
  /** Triangles the level really has. */
  readonly triangles: number;
}

/** A baked far-view atlas: `frames`² views over the upper hemisphere, `cell` pixels each. */
export interface BuiltImpostor {
  readonly albedo: string;
  readonly normal: string;
  readonly frames: number;
  readonly cell: number;
  /** Bounding sphere of the baked views, in the model file's own space. */
  readonly center: readonly [number, number, number];
  readonly radius: number;
}

/** What the build wrote for one model file: read from `<url>.lods/meta.json`. */
export interface BuiltLodMeta {
  readonly version: number;
  /** Content hash of the source file the levels were built from. */
  readonly source: string;
  /** Hash of the build plan, so a changed plan rebuilds. */
  readonly plan: string;
  /** World-space bounds of the source scene in the file's own units. */
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  /** Source triangles. */
  readonly triangles: number;
  /** Levels ordered from the most to the least detailed, excluding the source itself. */
  readonly levels: readonly BuiltLodLevel[];
  readonly impostor?: BuiltImpostor;
}

/**
 * How a game switches a model between its source mesh, its built levels and its impostor. Every field
 * is data the game sets in `visibility.meshLods` (and a model can override in `ModelConfig.meshLods`).
 */
export interface MeshLodConfig {
  /**
   * One entry per built level, largest first: the share of the viewport height the model's bounding
   * sphere spans below which that level takes over. `[0.3, 0.1]` draws the source while the model
   * spans more than 30% of the screen, the first level down to 10%, and the second below that.
   * Levels past the list (or past what the build wrote) are not drawn.
   */
  readonly screenSizes: readonly number[];
  /** Share of a switch distance an instance must travel past it before it changes level. Default 0.1. */
  readonly hysteresis?: number;
  /** Metres from the camera past which a baked impostor card draws instead of a mesh; unset draws none. */
  readonly impostorDistance?: number;
}

/** Hysteresis ratio used when a {@link MeshLodConfig} sets none. */
export const DEFAULT_MESH_LOD_HYSTERESIS = 0.1;

/** A url the runtime can look up built levels for: a plain path, not a data or blob url. */
export function hasBuiltLodPath(url: string): boolean {
  return url.length > 0 && !/^(data|blob):/i.test(url);
}

/** The folder holding everything built for a model file. */
export function builtLodDir(url: string): string {
  const query = url.search(/[?#]/);
  return `${query < 0 ? url : url.slice(0, query)}.lods`;
}

/** The metadata file the build writes for a model file. */
export function builtLodMetaUrl(url: string): string {
  return `${builtLodDir(url)}/meta.json`;
}

/** The url of one file inside a model's lod folder. */
export function builtLodFileUrl(url: string, file: string): string {
  return `${builtLodDir(url)}/${file}`;
}

/** Parse a metadata file, or null when it is not one this runtime reads. */
export function parseBuiltLodMeta(value: unknown): BuiltLodMeta | null {
  if (!isRecord(value) || value["version"] !== BUILT_LOD_VERSION) return null;
  const bounds = value["bounds"];
  if (!isRecord(bounds)) return null;
  const min = vec3(bounds["min"]);
  const max = vec3(bounds["max"]);
  if (min === null || max === null || !Array.isArray(value["levels"])) return null;
  const levels: BuiltLodLevel[] = [];
  for (const level of value["levels"]) {
    if (!isRecord(level) || typeof level["file"] !== "string" || typeof level["triangles"] !== "number" || typeof level["ratio"] !== "number") return null;
    levels.push({ file: level["file"], ratio: level["ratio"], triangles: level["triangles"] });
  }
  const impostor = parseImpostor(value["impostor"]);
  return {
    version: BUILT_LOD_VERSION,
    source: typeof value["source"] === "string" ? value["source"] : "",
    plan: typeof value["plan"] === "string" ? value["plan"] : "",
    bounds: { min, max },
    triangles: typeof value["triangles"] === "number" ? value["triangles"] : 0,
    levels,
    ...(impostor === null ? {} : { impostor }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function vec3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value;
  return typeof x === "number" && typeof y === "number" && typeof z === "number" ? [x, y, z] : null;
}

function parseImpostor(value: unknown): BuiltImpostor | null {
  if (!isRecord(value)) return null;
  const center = vec3(value["center"]);
  const albedo = value["albedo"];
  const normal = value["normal"];
  const frames = value["frames"];
  const cell = value["cell"];
  const radius = value["radius"];
  if (center === null || typeof albedo !== "string" || typeof normal !== "string") return null;
  if (typeof frames !== "number" || typeof cell !== "number" || typeof radius !== "number") return null;
  return { albedo, normal, frames, cell, center, radius };
}

/**
 * Metres from the camera at which a model of bounding `radius` spans `screenSize` of the viewport
 * height through a perspective camera with vertical field of view `fovY` (radians).
 * @internal
 */
export function screenSizeDistance(radius: number, screenSize: number, fovY: number): number {
  const half = Math.tan(Math.min(Math.max(fovY, 1e-3), Math.PI - 1e-3) / 2);
  return radius / (Math.max(screenSize, 1e-6) * half);
}

/** Share of the viewport height a model of bounding `radius` spans at `distance` metres. @internal */
export function projectedScreenSize(radius: number, distance: number, fovY: number): number {
  const half = Math.tan(Math.min(Math.max(fovY, 1e-3), Math.PI - 1e-3) / 2);
  return radius / (Math.max(distance, 1e-6) * half);
}

/** The url the impostor level carries in a resolved variant config; it names no file. */
export const IMPOSTOR_LEVEL_URL = "jg:impostor";

/** A model's built levels resolved for one camera: its variant config, and whether its last level is the impostor. */
export interface ResolvedBuiltLods {
  readonly variants: ModelVariantLodConfig;
  /** True when the last level of `variants` is {@link IMPOSTOR_LEVEL_URL}. */
  readonly impostor: boolean;
}

/**
 * Turn what the build wrote and what the game asked for into the distance levels the variant selector
 * switches on. `radius` is the model's bounding radius in metres at scale 1 (after its own
 * normalization), `fovY` the camera's vertical field of view. Distances are per unit of instance
 * scale (`scaleWithInstance`), so a placement drawn twice as big switches twice as far out, which is
 * what keeps the switch at the same size on screen. Returns null when nothing would change.
 */
export function resolveBuiltLods(
  url: string,
  meta: BuiltLodMeta,
  config: MeshLodConfig,
  radius: number,
  fovY: number,
): ResolvedBuiltLods | null {
  const count = Math.min(meta.levels.length, config.screenSizes.length);
  const impostorDistance = meta.impostor !== undefined ? config.impostorDistance : undefined;
  const urls: string[] = [url];
  const edges: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const size = config.screenSizes[index];
    const level = meta.levels[index];
    if (size === undefined || level === undefined) break;
    const distance = screenSizeDistance(radius, size, fovY);
    if (!Number.isFinite(distance) || distance <= (edges[edges.length - 1] ?? 0)) continue;
    if (impostorDistance !== undefined && distance >= impostorDistance) break;
    edges.push(distance);
    urls.push(builtLodFileUrl(url, level.file));
  }
  let impostor = false;
  if (impostorDistance !== undefined && Number.isFinite(impostorDistance) && impostorDistance > (edges[edges.length - 1] ?? 0)) {
    edges.push(impostorDistance);
    urls.push(IMPOSTOR_LEVEL_URL);
    impostor = true;
  }
  if (urls.length < 2) return null;
  const levels = urls.map((level, index) => {
    const edge = edges[index];
    return edge === undefined ? { url: level } : { url: level, maxDistance: edge };
  });
  const hysteresis = Math.max(0, config.hysteresis ?? DEFAULT_MESH_LOD_HYSTERESIS);
  return { variants: { levels, hysteresis: 0, hysteresisRatio: hysteresis, scaleWithInstance: true }, impostor };
}

/** Merge a game's mesh-lod settings with one model's override; false or no settings turns it off. */
export function meshLodSettings(game: MeshLodConfig | false | undefined, model: Partial<MeshLodConfig> | false | undefined): MeshLodConfig | null {
  if (model === false || game === false) return null;
  if (game === undefined && model === undefined) return null;
  const screenSizes = model?.screenSizes ?? game?.screenSizes;
  if (screenSizes === undefined) return null;
  const hysteresis = model?.hysteresis ?? game?.hysteresis;
  const impostorDistance = model?.impostorDistance ?? game?.impostorDistance;
  return {
    screenSizes,
    ...(hysteresis === undefined ? {} : { hysteresis }),
    ...(impostorDistance === undefined ? {} : { impostorDistance }),
  };
}
