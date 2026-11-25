// @skill jgengine-world
import type { CachedPlantStructure } from "../cache/plantCache";
import { decodePlantMesh, decodePlantStructure } from "../cache/plantCodec";
import type { PlantEnvironment } from "../growth/plantEnvironment";
import { hasPlantLeafAtlas, keepPlantLeafAtlas, plantLeafAtlasKey, type PlantLeafAtlas } from "../mesh/plantLeafAtlas";
import type { PlantMesh, PlantStyle } from "../mesh/plantMesh";
import type { PlantSpecies } from "../species/plantSpecies";
import { createWorkerPool, defaultWorkerCount, type WorkerPoolState } from "../../run/workerPool";

/**
 * Everything that decides what grows: species, site, seed, age and the day it is seen. Plain data,
 * so it crosses to a worker unchanged.
 */
export interface PlantGrowRequest {
  species: PlantSpecies;
  env: PlantEnvironment;
  seed: string;
  age: number;
  day: number;
  /** Years the plant has stood dead after reaching `age`; 0 is alive. */
  deadYears: number;
}

/** A mesh to build where the plant grows: the style and generator detail it is drawn at. */
export interface PlantMeshOrder {
  style: PlantStyle;
  detail: number;
}

/** A grown plant, with its mesh when one was ordered. */
export interface PlantGrowResult {
  grown: CachedPlantStructure;
  mesh: PlantMesh | null;
}

/** Grows plants somewhere other than the caller's frame and hands back their structure. */
export interface PlantGrower {
  /** Grow a plant and, with `mesh`, build that mesh of it in the same place. */
  grow(request: PlantGrowRequest, mesh?: PlantMeshOrder): Promise<PlantGrowResult>;
  /** Stop every worker; pending growth rejects. */
  dispose(): void;
}

/** What a worker pool is doing: jobs waiting, jobs running and workers alive. */
export type WorkerPlantGrowerState = WorkerPoolState;

/** A {@link PlantGrower} backed by workers. */
export interface WorkerPlantGrower extends PlantGrower {
  /** Jobs waiting, jobs running and workers alive. */
  state(): WorkerPlantGrowerState;
  /** Cancel every job (they reject) and stop every worker; the pool starts workers again on the next grow. */
  reset(): void;
}

/** @internal A request on its way to a worker. */
export interface PlantGrowJob {
  request: PlantGrowRequest;
  mesh: PlantMeshOrder | null;
  /** Also bake the leaf atlas of the plant's leaf shape, the first time this pool meets that shape. */
  atlas: boolean;
}

/** @internal A worker's answer: the grown structure (and mesh) as codec bytes. */
export interface PlantGrowReply {
  bytes: Uint8Array;
  meshBytes: Uint8Array | null;
  atlas: PlantLeafAtlas | null;
}

/** @internal */
export function isPlantGrowJob(value: unknown): value is PlantGrowJob {
  return typeof value === "object" && value !== null && "request" in value && typeof value.request === "object";
}

function isPlantGrowReply(value: unknown): value is PlantGrowReply {
  if (typeof value !== "object" || value === null) return false;
  return "bytes" in value && value.bytes instanceof Uint8Array && "meshBytes" in value && (value.meshBytes === null || value.meshBytes instanceof Uint8Array) && "atlas" in value;
}

/** Options for {@link createWorkerPlantGrower}. */
export interface WorkerPlantGrowerOptions {
  /** Most workers alive at once. Default: one less than the machine's cores, 1..6. */
  workers?: number;
  /** Start one worker; default spawns `plantGrowWorker.ts` as a module worker. */
  spawn?: () => Worker;
}

function spawnDefault(): Worker {
  return new Worker(new URL("./plantGrowWorker.ts", import.meta.url), { type: "module" });
}

/**
 * A pool of workers that grow plants with the same simulation as the main thread, so a first visit
 * grows a forest without spending frame time. Workers start on demand and stop when the queue
 * drains. Null where the platform has no workers.
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */
export function createWorkerPlantGrower(options: WorkerPlantGrowerOptions = {}): WorkerPlantGrower | null {
  const pool = createWorkerPool<PlantGrowJob, PlantGrowReply>({
    workers: options.workers ?? defaultWorkerCount(6),
    spawn: options.spawn ?? spawnDefault,
    name: "plant grow worker",
    isResult: isPlantGrowReply,
  });
  if (pool === null) return null;
  // Leaf shapes some job is baking an atlas for: each shape is baked once, and every other leafy
  // mesh of that shape is handed back only once its atlas is here, so the main thread never bakes it.
  const atlasesOrdered = new Map<string, Promise<unknown>>();

  function reset(): void {
    pool!.reset();
    atlasesOrdered.clear();
  }

  return {
    grow(request, mesh) {
      const shape = request.species.leaf.shape;
      const leafy = mesh?.style.foliage === "leaves" && !hasPlantLeafAtlas(shape);
      const key = plantLeafAtlasKey(shape);
      const ordered = leafy ? atlasesOrdered.get(key) : undefined;
      const result = pool.run({ request, mesh: mesh ?? null, atlas: leafy && ordered === undefined }).then((reply): PlantGrowResult => {
        const grown = decodePlantStructure(reply.bytes);
        if (reply.atlas !== null) keepPlantLeafAtlas(grown.structure.leafShape, reply.atlas);
        return { grown, mesh: reply.meshBytes === null ? null : decodePlantMesh(reply.meshBytes) };
      });
      if (!leafy) return result;
      if (ordered === undefined) {
        // Settles either way: if this job fails, whoever waited bakes the atlas itself.
        atlasesOrdered.set(key, result.catch(() => undefined));
        return result;
      }
      return Promise.all([result, ordered]).then(([grown]) => grown);
    },
    state: () => pool.state(),
    reset,
    dispose: reset,
  };
}
