import type { DecalStyle } from "@jgengine/core/world/decalKind";
import { bakeDecalTexture, decalKey, keepDecal, knownDecal, type DecalPaint, type DecalTextureData } from "./decalTexture";

/** @internal One look on its way to a worker. */
export interface DecalBakeJob {
  id: number;
  style: DecalStyle;
  seed: string;
  size: number;
  paint: DecalPaint;
}

/** @internal A worker's answer: the look's bytes, or why it failed. */
export type DecalBakeReply = { id: number; data: Uint8Array } | { id: number; error: string };

/** @internal */
export function isDecalBakeJob(value: unknown): value is DecalBakeJob {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "number" && "style" in value && typeof value.style === "string" && "size" in value && typeof value.size === "number";
}

function isDecalBakeReply(value: unknown): value is DecalBakeReply {
  if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "number") return false;
  return ("data" in value && value.data instanceof Uint8Array) || ("error" in value && typeof value.error === "string");
}

interface Pending {
  job: DecalBakeJob;
  key: string;
  resolve: (baked: DecalTextureData) => void;
}

/** Most bake workers at once: a floor's decals in a third of the time, with cores left for the game. */
function workerCount(): number {
  const cores = typeof navigator === "object" && typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(3, cores - 2));
}

const queue: Pending[] = [];
const busy = new Map<Worker, Pending>();
const idle: Worker[] = [];
const inFlight = new Map<string, Promise<DecalTextureData>>();
let alive = 0;
let nextId = 1;
/** Set when a worker could not start or failed: every later bake runs on the main thread, as before. */
let broken = false;

function bakeHere(pending: Pending): void {
  const baked = { size: pending.job.size, data: bakeDecalTexture(pending.job.style, pending.job.seed, pending.job.size, pending.job.paint).data };
  keepDecal(pending.key, baked);
  pending.resolve(baked);
}

function breakPool(cause: string): void {
  if (!broken) console.warn(`degraded: decal bake worker ${cause}; decals bake on the main thread`);
  broken = true;
  for (const worker of [...idle, ...busy.keys()]) worker.terminate();
  const stranded = [...busy.values(), ...queue.splice(0)];
  busy.clear();
  idle.length = 0;
  alive = 0;
  for (const pending of stranded) bakeHere(pending);
}

function start(): Worker | null {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./decalBakeWorker.ts", import.meta.url), { type: "module" });
  } catch (error) {
    breakPool(`could not start (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
  alive += 1;
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    const reply = event.data;
    const pending = busy.get(worker);
    if (pending === undefined || !isDecalBakeReply(reply) || reply.id !== pending.job.id) return;
    busy.delete(worker);
    if ("error" in reply) bakeHere(pending);
    else {
      const baked = { size: pending.job.size, data: reply.data };
      keepDecal(pending.key, baked);
      pending.resolve(baked);
    }
    idle.push(worker);
    pump();
  });
  worker.addEventListener("error", (event: ErrorEvent) => breakPool(`failed (${event.message})`));
  return worker;
}

function pump(): void {
  while (!broken && queue.length > 0) {
    let worker = idle.pop();
    if (worker === undefined) {
      if (alive >= workerCount()) return;
      const started = start();
      if (started === null) return;
      worker = started;
    }
    const pending = queue.shift()!;
    busy.set(worker, pending);
    worker.postMessage(pending.job);
  }
  // Nothing left to bake: the workers go, and the next floor starts them again.
  if (queue.length === 0 && busy.size === 0) {
    for (const worker of idle) worker.terminate();
    alive -= idle.length;
    idle.length = 0;
  }
}

/**
 * Bake a decal look on a worker and keep its bytes for the next mount. A look already baked, or
 * being baked, is not baked again. Where the platform has no workers, or one fails, it bakes on the
 * calling thread and says so once. @internal
 */
export function bakeDecal(style: DecalStyle, seed: string, size: number, paint: DecalPaint = {}): Promise<DecalTextureData> {
  const key = decalKey(style, seed, size, paint);
  const known = knownDecal(key);
  if (known !== undefined) return Promise.resolve(known);
  const running = inFlight.get(key);
  if (running !== undefined) return running;
  const baking = new Promise<DecalTextureData>((resolve) => {
    const pending: Pending = { job: { id: nextId++, style, seed, size, paint: { text: paint.text, color: paint.color } }, key, resolve };
    if (broken || typeof Worker === "undefined") bakeHere(pending);
    else {
      queue.push(pending);
      pump();
    }
  });
  inFlight.set(key, baking);
  void baking.then(() => inFlight.delete(key));
  return baking;
}
