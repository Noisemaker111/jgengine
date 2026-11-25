/**
 * Jobs run on a few module workers so a long build (a forest, a landform, a folder of meshes) never
 * spends the caller's frame. Workers start on demand, the queue runs first in, first out, and every
 * worker stops when the queue drains.
 */

/** What a worker pool is doing: jobs waiting, jobs running and workers alive. */
export interface WorkerPoolState {
  queued: number;
  running: number;
  workers: number;
}

/** A pool of workers that each answer one job at a time. */
export interface WorkerPool<Job, Result> {
  /** Queue a job; `transfer` moves buffers to the worker instead of copying them. */
  run(job: Job, transfer?: Transferable[]): Promise<Result>;
  state(): WorkerPoolState;
  /** Reject every queued and running job and stop every worker; the next `run` starts workers again. */
  reset(): void;
}

/** Options for {@link createWorkerPool}. */
export interface WorkerPoolOptions<Result> {
  /** Most workers alive at once. */
  workers: number;
  /**
   * Jobs one worker holds at once. Default 1. A job that waits on I/O (a fetch) takes more, so the
   * worker parses one while the next downloads instead of idling until the main thread hands it work.
   */
  jobsPerWorker?: number;
  /** Start one worker. */
  spawn: () => Worker;
  /** Names the pool in its errors (`plant grow worker failed: …`). */
  name: string;
  /** Checks a worker's result before it resolves a job. */
  isResult: (value: unknown) => value is Result;
}

/** A job as it crosses to a worker. @internal */
export interface WorkerPoolJob<Job> {
  id: number;
  job: Job;
}

/** A worker's answer to one {@link WorkerPoolJob}. @internal */
export type WorkerPoolReply<Result> = { id: number; result: Result } | { id: number; error: string };

/** The default worker count: one less than the machine's cores, at most `most`. */
export function defaultWorkerCount(most: number): number {
  const cores = typeof navigator === "object" && typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(most, cores - 1));
}

interface Pending<Job, Result> {
  message: WorkerPoolJob<Job>;
  transfer: Transferable[];
  resolve: (result: Result) => void;
  reject: (error: Error) => void;
}

function replyId(value: unknown): number | null {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "number" ? value.id : null;
}

/**
 * A pool of module workers answering jobs posted by {@link serveWorkerJobs}. Null where the platform
 * has no workers, so the caller runs the job on its own thread.
 * @capability worker-pool run jobs on a few on-demand module workers that stop when the queue drains
 */
export function createWorkerPool<Job, Result>(options: WorkerPoolOptions<Result>): WorkerPool<Job, Result> | null {
  if (typeof Worker === "undefined") return null;
  const most = Math.max(1, options.workers);
  const perWorker = Math.max(1, options.jobsPerWorker ?? 1);
  const queue: Pending<Job, Result>[] = [];
  const running = new Map<Worker, Map<number, Pending<Job, Result>>>();
  let nextId = 1;

  function start(): Worker {
    const worker = options.spawn();
    const jobs = new Map<number, Pending<Job, Result>>();
    running.set(worker, jobs);
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const reply = event.data;
      const id = replyId(reply);
      const pending = id === null ? undefined : jobs.get(id);
      if (pending === undefined || id === null) return;
      jobs.delete(id);
      if (typeof reply === "object" && reply !== null && "error" in reply && typeof reply.error === "string") {
        pending.reject(new Error(`${options.name}: ${reply.error}`));
      } else if (typeof reply === "object" && reply !== null && "result" in reply && options.isResult(reply.result)) {
        pending.resolve(reply.result);
      } else pending.reject(new Error(`${options.name}: malformed reply`));
      pump();
    });
    worker.addEventListener("error", (event: ErrorEvent) => {
      event.preventDefault();
      running.delete(worker);
      worker.terminate();
      for (const pending of jobs.values()) pending.reject(new Error(`${options.name} failed: ${event.message}`));
      pump();
    });
    return worker;
  }

  /** The worker holding the fewest jobs, starting one while under the limit; null when every worker is full. */
  function freeWorker(): Worker | null {
    let best: Worker | null = null;
    let fewest = perWorker;
    for (const [worker, jobs] of running) {
      if (jobs.size < fewest) {
        best = worker;
        fewest = jobs.size;
      }
    }
    if (fewest === 0 || running.size >= most) return best;
    return start();
  }

  function pump(): void {
    while (queue.length > 0) {
      const worker = freeWorker();
      if (worker === null) return;
      const pending = queue.shift()!;
      running.get(worker)!.set(pending.message.id, pending);
      worker.postMessage(pending.message, { transfer: pending.transfer });
    }
    let busy = false;
    for (const jobs of running.values()) busy ||= jobs.size > 0;
    if (!busy) stopAll();
  }

  function stopAll(): void {
    for (const worker of running.keys()) worker.terminate();
    running.clear();
  }

  return {
    run(job, transfer = []) {
      return new Promise<Result>((resolve, reject) => {
        queue.push({ message: { id: nextId, job }, transfer, resolve, reject });
        nextId += 1;
        pump();
      });
    },
    state() {
      let jobs = 0;
      for (const held of running.values()) jobs += held.size;
      return { queued: queue.length, running: jobs, workers: running.size };
    },
    reset() {
      for (const pending of queue.splice(0)) pending.reject(new Error(`${options.name} reset`));
      for (const jobs of running.values()) for (const pending of jobs.values()) pending.reject(new Error(`${options.name} reset`));
      stopAll();
    },
  };
}

/**
 * The worker side of {@link createWorkerPool}: answer each job with `handle`'s result, moving the
 * buffers it lists. A thrown error goes back as the job's rejection.
 */
export function serveWorkerJobs<Job, Result>(
  isJob: (value: unknown) => value is Job,
  handle: (job: Job) => Promise<{ result: Result; transfer?: Transferable[] }> | { result: Result; transfer?: Transferable[] },
): void {
  addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data;
    const id = replyId(message);
    if (id === null || typeof message !== "object" || message === null || !("job" in message) || !isJob(message.job)) return;
    const job = message.job;
    void (async () => {
      let reply: WorkerPoolReply<Result>;
      let transfer: Transferable[] = [];
      try {
        const answer = await handle(job);
        reply = { id, result: answer.result };
        transfer = answer.transfer ?? [];
      } catch (error) {
        reply = { id, error: error instanceof Error ? error.message : String(error) };
      }
      postMessage(reply, { transfer });
    })();
  });
}
