// @skill jgengine-world
import type { CachedPlantStructure } from "../cache/plantCache";
import { decodePlantStructure } from "../cache/plantCodec";
import type { PlantEnvironment } from "../growth/plantEnvironment";
import type { PlantSpecies } from "../species/plantSpecies";

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
}

/** Grows plants somewhere other than the caller's frame and hands back their structure. */
export interface PlantGrower {
  grow(request: PlantGrowRequest): Promise<CachedPlantStructure>;
  /** Stop every worker; pending growth rejects. */
  dispose(): void;
}

/** @internal A request on its way to a worker. */
export interface PlantGrowJob {
  id: number;
  request: PlantGrowRequest;
}

/** @internal A worker's answer: the grown structure as codec bytes, or why it failed. */
export type PlantGrowReply = { id: number; bytes: Uint8Array } | { id: number; error: string };

/** @internal */
export function isPlantGrowJob(value: unknown): value is PlantGrowJob {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "number" && "request" in value && typeof value.request === "object";
}

function isPlantGrowReply(value: unknown): value is PlantGrowReply {
  if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "number") return false;
  return ("bytes" in value && value.bytes instanceof Uint8Array) || ("error" in value && typeof value.error === "string");
}

/** Options for {@link createWorkerPlantGrower}. */
export interface WorkerPlantGrowerOptions {
  /** Most workers alive at once. Default: one less than the machine's cores, 1..6. */
  workers?: number;
  /** Start one worker; default spawns `plantGrowWorker.ts` as a module worker. */
  spawn?: () => Worker;
}

interface Pending {
  job: PlantGrowJob;
  resolve: (grown: CachedPlantStructure) => void;
  reject: (error: Error) => void;
}

function defaultWorkerCount(): number {
  const cores = typeof navigator === "object" && typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(6, cores - 1));
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
export function createWorkerPlantGrower(options: WorkerPlantGrowerOptions = {}): PlantGrower | null {
  if (typeof Worker === "undefined") return null;
  const most = Math.max(1, options.workers ?? defaultWorkerCount());
  const spawn = options.spawn ?? spawnDefault;
  const queue: Pending[] = [];
  const busy = new Map<Worker, Pending>();
  const idle: Worker[] = [];
  let nextId = 1;

  function fail(worker: Worker, error: Error): void {
    const pending = busy.get(worker);
    busy.delete(worker);
    worker.terminate();
    pending?.reject(error);
    pump();
  }

  function start(): Worker {
    const worker = spawn();
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const reply = event.data;
      const pending = busy.get(worker);
      if (pending === undefined || !isPlantGrowReply(reply) || reply.id !== pending.job.id) return;
      busy.delete(worker);
      if ("error" in reply) pending.reject(new Error(`plant grow worker: ${reply.error}`));
      else {
        try {
          pending.resolve(decodePlantStructure(reply.bytes));
        } catch (error) {
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
      idle.push(worker);
      pump();
    });
    worker.addEventListener("error", (event: ErrorEvent) => {
      event.preventDefault();
      fail(worker, new Error(`plant grow worker failed: ${event.message}`));
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
    grow(request) {
      return new Promise<CachedPlantStructure>((resolve, reject) => {
        queue.push({ job: { id: nextId, request }, resolve, reject });
        nextId += 1;
        pump();
      });
    },
    dispose() {
      for (const pending of queue.splice(0)) pending.reject(new Error("plant grower disposed"));
      for (const [worker, pending] of busy) {
        worker.terminate();
        pending.reject(new Error("plant grower disposed"));
      }
      busy.clear();
      for (const worker of idle.splice(0)) worker.terminate();
    },
  };
}
