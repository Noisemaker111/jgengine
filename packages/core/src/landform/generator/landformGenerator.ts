// @skill jgengine-world
/**
 * The `landform` generator: a param schema over the landscape and dune models, `prepare` that grows
 * the landform in a worker (or reads it from the cache), and `generate` that answers from the cache,
 * growing on the spot only when nothing prepared it. Its output is a {@link LandformTerrain};
 * `landformTerrainSnapshot` hands that to the editor's terrain document.
 *
 * @capability landform-generator grow a terrain heightfield and its material layers from geology, rivers and wind, for the editor and runtime
 */

import { defineGenerator, type GeneratorContext } from "../../generator/generator";
import { defineParamSchema, type ParamsOf } from "../../generator/paramSchema";
import type { WindMode } from "../dunes/duneField";
import { growLandform, LANDFORM_TERRAIN_MAX_SIDE, type LandformRecipe, type LandformTerrain } from "./landformTerrain";

/** The output family of landform generators. */
export const LANDFORM_OUTPUT = "landform";

/** The `landform` generator's params. */
export const LANDFORM_SCHEMA = defineParamSchema({
  groups: [
    { id: "map", label: "Map" },
    { id: "rock", label: "Rock and rivers" },
    { id: "wind", label: "Wind and dunes" },
  ],
  fields: [
    { key: "seed", type: "seed", label: "Seed", default: "landform" },
    { key: "side", type: "range", label: "Cells per side", group: "map", min: 32, max: LANDFORM_TERRAIN_MAX_SIDE, step: 16, default: 128, vary: false },
    { key: "cellSize", type: "range", label: "Cell size (simulated)", group: "map", min: 5, max: 200, step: 5, default: 30, unit: "m", vary: false },
    { key: "years", type: "range", label: "Time", group: "map", min: 1e4, max: 5e6, step: 1e4, default: 1e6, unit: "yr", exploreScale: "log" },
    { key: "scale", type: "range", label: "World scale (world m per simulated m)", group: "map", min: 0.01, max: 1, step: 0.01, default: 1, exploreScale: "log", vary: false },
    { key: "seaLevel", type: "range", label: "Sea level (−1 none)", group: "map", min: -1, max: 500, step: 1, default: -1, unit: "m" },
    { key: "uplift", type: "range", label: "Uplift", group: "rock", min: 0, max: 5, step: 0.05, default: 1, unit: "mm/yr" },
    { key: "erodibility", type: "range", label: "Erodibility K", group: "rock", min: 1e-6, max: 1e-4, step: 1e-6, default: 2e-5, exploreScale: "log" },
    { key: "diffusivity", type: "range", label: "Hillslope creep", group: "rock", min: 0, max: 0.5, step: 0.005, default: 0.01, unit: "m²/yr" },
    { key: "deposition", type: "range", label: "River deposition G", group: "rock", min: 0, max: 3, step: 0.05, default: 0.5 },
    { key: "reposeAngle", type: "range", label: "Debris repose", group: "rock", min: 25, max: 45, step: 1, default: 34, unit: "°" },
    { key: "caprock", type: "range", label: "Caprock thickness", group: "rock", min: 0, max: 300, step: 5, default: 0, unit: "m" },
    { key: "glacierEla", type: "range", label: "Glacier line (−1 none)", group: "rock", min: -1, max: 5000, step: 10, default: -1, unit: "m" },
    { key: "sand", type: "range", label: "Dune sand", group: "wind", min: 0, max: 30, step: 0.5, default: 0, unit: "m" },
    { key: "windToward", type: "range", label: "Wind toward", group: "wind", min: 0, max: 359, step: 1, default: 90, unit: "°" },
    { key: "windSpread", type: "range", label: "Wind spread (0 one wind, 120 two, 360 all sides)", group: "wind", min: 0, max: 360, step: 5, default: 0, unit: "°" },
    { key: "duneSweeps", type: "range", label: "Dune time", group: "wind", min: 50, max: 2000, step: 50, default: 400, unit: "sweeps" },
  ],
});

/** Parsed params of the `landform` generator. */
export type LandformGeneratorParams = ParamsOf<typeof LANDFORM_SCHEMA>;

// One wind at spread 0; two winds either side of `toward` up to 180°; past that, three from all sides.
function windRegime(toward: number, spread: number): WindMode[] {
  if (spread <= 0) return [{ toward, share: 1 }];
  if (spread <= 180) return [{ toward: toward - spread / 2, share: 1 }, { toward: toward + spread / 2, share: 1 }];
  return [0, 120, 240].map((turn) => ({ toward: toward + turn, share: 1 }));
}

/**
 * The recipe a generator's params and detail level grow: lower detail keeps the map size with fewer, larger cells.
 * @capability landform-generator grow a terrain heightfield and its material layers from geology, rivers and wind, for the editor and runtime
 */
export function landformRecipe(params: LandformGeneratorParams, detail = 1): LandformRecipe {
  const side = Math.max(16, Math.min(LANDFORM_TERRAIN_MAX_SIDE, Math.round(params.side * detail)));
  const extent = params.side * params.cellSize;
  return {
    side,
    cellSize: extent / side,
    years: params.years,
    uplift: params.uplift,
    erodibility: params.erodibility,
    diffusivity: params.diffusivity,
    deposition: params.deposition,
    reposeAngle: params.reposeAngle,
    seaLevel: params.seaLevel < 0 ? null : params.seaLevel,
    caprock: params.caprock,
    glacierEla: params.glacierEla < 0 ? null : params.glacierEla,
    sand: params.sand,
    wind: windRegime(params.windToward, params.windSpread),
    duneSweeps: params.duneSweeps,
    scale: params.scale,
  };
}

// Bump when growLandform changes what a recipe grows, so stored terrain is not reused.
const LANDFORM_VERSION = 1;

/**
 * The cache key of a grown landform: model version, recipe and seed.
 * @capability landform-generator grow a terrain heightfield and its material layers from geology, rivers and wind, for the editor and runtime
 */
export function landformKey(recipe: LandformRecipe, seed: string): string {
  return JSON.stringify([LANDFORM_VERSION, seed, recipe]);
}

/** Durable storage for grown landforms, e.g. IndexedDB or a file. Injected; the cache works without it. */
export interface LandformStore {
  load(key: string): Promise<LandformTerrain | undefined>;
  save(key: string, terrain: LandformTerrain): Promise<void>;
}

/** Grown landforms by key: a bounded in-memory cache over optional durable storage. */
export interface LandformCache {
  get(key: string): LandformTerrain | undefined;
  put(key: string, terrain: LandformTerrain): void;
  /** Load from storage into memory; the terrain, or undefined when neither holds it. */
  load(key: string): Promise<LandformTerrain | undefined>;
  /** Keys held in memory, oldest first. */
  keys(): string[];
  /** The landforms held in memory, oldest first. */
  snapshot(): Array<[string, LandformTerrain]>;
  /** Replace what memory holds with `entries`, oldest first; storage is untouched. */
  restore(entries: ReadonlyArray<readonly [string, LandformTerrain]>): void;
  /** Forget everything in memory; storage is untouched. */
  reset(): void;
}

/** Options for {@link createLandformCache}. */
export interface LandformCacheOptions {
  /** Most landforms kept in memory. Default 6. */
  limit?: number;
  store?: LandformStore;
}

/**
 * A landform cache.
 * @capability landform-generator grow a terrain heightfield and its material layers from geology, rivers and wind, for the editor and runtime
 */
export function createLandformCache(options: LandformCacheOptions = {}): LandformCache {
  const limit = Math.max(1, options.limit ?? 6);
  const memory = new Map<string, LandformTerrain>();
  const remember = (key: string, terrain: LandformTerrain): void => {
    memory.delete(key);
    memory.set(key, terrain);
    while (memory.size > limit) {
      const oldest = memory.keys().next().value;
      if (oldest === undefined) break;
      memory.delete(oldest);
    }
  };
  return {
    get(key) {
      const terrain = memory.get(key);
      if (terrain !== undefined) remember(key, terrain);
      return terrain;
    },
    put(key, terrain) {
      remember(key, terrain);
      void options.store?.save(key, terrain).catch((error: unknown) => console.warn("[jgengine] landform store save failed", error));
    },
    async load(key) {
      const known = memory.get(key);
      if (known !== undefined) return known;
      const stored = await options.store?.load(key);
      if (stored !== undefined) remember(key, stored);
      return stored;
    },
    keys: () => [...memory.keys()],
    snapshot: () => [...memory.entries()],
    restore(entries) {
      memory.clear();
      for (const [key, terrain] of entries) remember(key, terrain);
    },
    reset: () => memory.clear(),
  };
}

/** Grows landforms somewhere other than the caller's frame. */
export interface LandformGrower {
  grow(recipe: LandformRecipe, seed: string): Promise<LandformTerrain>;
  dispose(): void;
}

/** @internal A job on its way to a landform worker. */
export interface LandformJob {
  id: number;
  recipe: LandformRecipe;
  seed: string;
}

/** @internal A landform worker's answer. */
export type LandformReply = { id: number; terrain: LandformTerrain } | { id: number; error: string };

/** @internal */
export function isLandformJob(value: unknown): value is LandformJob {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "number" && "recipe" in value && typeof value.recipe === "object" && "seed" in value && typeof value.seed === "string";
}

function isLandformReply(value: unknown): value is LandformReply {
  if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "number") return false;
  return ("error" in value && typeof value.error === "string") || ("terrain" in value && typeof value.terrain === "object");
}

/** Options for {@link createWorkerLandformGrower}. */
export interface WorkerLandformGrowerOptions {
  /** Most workers at once. Default 2. */
  workers?: number;
  /** Start one worker; default spawns `landformWorker.ts` as a module worker. */
  spawn?: () => Worker;
}

// stateless: its queue holds in-flight promises, not state to save; a new grower is the reset.
/**
 * A pool of workers that grow landforms with the same models as the main thread. Workers start on
 * demand and stop when the queue drains. Null where the platform has no workers.
 * @capability landform-generator grow a terrain heightfield and its material layers from geology, rivers and wind, for the editor and runtime
 */
export function createWorkerLandformGrower(options: WorkerLandformGrowerOptions = {}): LandformGrower | null {
  if (typeof Worker === "undefined") return null;
  const most = Math.max(1, options.workers ?? 2);
  const spawn = options.spawn ?? ((): Worker => new Worker(new URL("./landformWorker.ts", import.meta.url), { type: "module" }));
  interface Pending {
    job: LandformJob;
    resolve: (terrain: LandformTerrain) => void;
    reject: (error: Error) => void;
  }
  const queue: Pending[] = [];
  const busy = new Map<Worker, Pending>();
  const idle: Worker[] = [];
  let nextId = 1;
  function start(): Worker {
    const worker = spawn();
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const reply = event.data;
      const pending = busy.get(worker);
      if (pending === undefined || !isLandformReply(reply) || reply.id !== pending.job.id) return;
      busy.delete(worker);
      if ("error" in reply) pending.reject(new Error(`landform worker: ${reply.error}`));
      else pending.resolve(reply.terrain);
      idle.push(worker);
      pump();
    });
    worker.addEventListener("error", (event: ErrorEvent) => {
      event.preventDefault();
      const pending = busy.get(worker);
      busy.delete(worker);
      worker.terminate();
      pending?.reject(new Error(`landform worker failed: ${event.message}`));
      pump();
    });
    return worker;
  }
  function pump(): void {
    while (queue.length > 0) {
      const worker = idle.pop() ?? (busy.size < most ? start() : undefined);
      if (worker === undefined) return;
      const pending = queue.shift();
      if (pending === undefined) {
        idle.push(worker);
        return;
      }
      busy.set(worker, pending);
      worker.postMessage(pending.job);
    }
    if (busy.size === 0) for (const worker of idle.splice(0)) worker.terminate();
  }
  return {
    grow(recipe, seed) {
      return new Promise<LandformTerrain>((resolve, reject) => {
        queue.push({ job: { id: nextId, recipe, seed }, resolve, reject });
        nextId += 1;
        pump();
      });
    },
    dispose() {
      for (const pending of queue.splice(0)) pending.reject(new Error("landform grower disposed"));
      for (const [worker, pending] of busy) {
        worker.terminate();
        pending.reject(new Error("landform grower disposed"));
      }
      busy.clear();
      for (const worker of idle.splice(0)) worker.terminate();
    },
  };
}

/** Options for {@link createLandformGenerator}. */
export interface LandformGeneratorOptions {
  /** Where `prepare` grows landforms. Default a worker pool where the platform has workers; null grows on the calling thread. */
  grower?: LandformGrower | null;
}

/**
 * A landform generator over one cache.
 * @capability landform-generator grow a terrain heightfield and its material layers from geology, rivers and wind, for the editor and runtime
 */
export function createLandformGenerator(cache: LandformCache, options: LandformGeneratorOptions = {}) {
  let grower: LandformGrower | null | undefined = options.grower;
  const growing = new Map<string, Promise<void>>();
  const recipeFor = (params: LandformGeneratorParams, context: GeneratorContext): { recipe: LandformRecipe; key: string } => {
    const recipe = landformRecipe(params, context.detail);
    return { recipe, key: landformKey(recipe, context.seed) };
  };
  async function growOffFrame(recipe: LandformRecipe, seed: string): Promise<LandformTerrain> {
    grower ??= createWorkerLandformGrower();
    if (grower !== null) {
      try {
        return await grower.grow(recipe, seed);
      } catch (error) {
        console.warn("[jgengine] landform worker unavailable, growing on the calling thread", error);
        grower.dispose();
        grower = null;
      }
    }
    return growLandform(recipe, seed);
  }
  return defineGenerator({
    id: "landform",
    label: "Landform",
    output: LANDFORM_OUTPUT,
    schema: LANDFORM_SCHEMA,
    lods: [1, 0.5, 0.25],
    async prepare(params, context) {
      const { recipe, key } = recipeFor(params, context);
      if ((await cache.load(key)) !== undefined) return;
      let job = growing.get(key);
      if (job === undefined) {
        job = growOffFrame(recipe, context.seed).then((terrain) => cache.put(key, terrain));
        growing.set(key, job);
        void job.finally(() => growing.delete(key)).catch(() => undefined);
      }
      await job;
    },
    generate(params, context) {
      const { recipe, key } = recipeFor(params, context);
      const known = cache.get(key);
      if (known !== undefined) return known;
      const terrain = growLandform(recipe, context.seed);
      cache.put(key, terrain);
      return terrain;
    },
  });
}

/** The cache {@link LANDFORM_GENERATOR} uses: memory only. */
export const LANDFORM_CACHE = createLandformCache();

/** The built-in landform generator. */
export const LANDFORM_GENERATOR = createLandformGenerator(LANDFORM_CACHE);
