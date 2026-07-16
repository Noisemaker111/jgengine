import type { NavPoint } from "../nav/navGrid";

export type JobPhase = "idle" | "travelling" | "working" | "done";

export interface JobDef {
  id?: string;
  station: NavPoint;
  work: number;
  priority?: number;
  arriveRadius?: number;
  repeat?: boolean;
}

export interface Job {
  id: string;
  station: NavPoint;
  work: number;
  priority: number;
  arriveRadius: number;
  repeat: boolean;
  worker: string | null;
}

export interface JobTickContext {
  distanceToStation: number;
}

export interface JobReport {
  jobId: string;
  workerId: string;
  cycle: number;
}

export interface WorkerState {
  jobId: string | null;
  phase: JobPhase;
  worked: number;
  cycles: number;
}

export interface JobBoard {
  post(job: JobDef): string;
  cancel(jobId: string): boolean;
  assign(workerId: string, jobId: string): boolean;
  claim(workerId: string): string | null;
  release(workerId: string): void;
  advance(workerId: string, dt: number, ctx: JobTickContext): JobReport | null;
  worker(workerId: string): WorkerState;
  station(workerId: string): NavPoint | null;
  jobOf(workerId: string): string | null;
  get(jobId: string): Job | null;
  queued(): readonly Job[];
  active(): readonly Job[];
  list(): readonly Job[];
}

const DEFAULT_ARRIVE_RADIUS = 0.75;

function idleWorker(): WorkerState {
  return { jobId: null, phase: "idle", worked: 0, cycles: 0 };
}

/** @internal */
export function createJobBoard(): JobBoard {
  const jobs = new Map<string, Job>();
  const workers = new Map<string, WorkerState>();
  let counter = 1;

  function workerState(workerId: string): WorkerState {
    let state = workers.get(workerId);
    if (state === undefined) {
      state = idleWorker();
      workers.set(workerId, state);
    }
    return state;
  }

  function begin(workerId: string, job: Job): void {
    const state = workerState(workerId);
    job.worker = workerId;
    state.jobId = job.id;
    state.phase = "travelling";
    state.worked = 0;
    state.cycles = 0;
  }

  function detach(workerId: string, requeue: boolean): void {
    const state = workers.get(workerId);
    if (state === undefined || state.jobId === null) return;
    const job = jobs.get(state.jobId);
    if (job !== undefined && job.worker === workerId) job.worker = requeue ? null : job.worker;
    state.jobId = null;
    state.phase = "idle";
    state.worked = 0;
  }

  return {
    post(job) {
      const id = job.id ?? `job-${counter++}`;
      jobs.set(id, {
        id,
        station: job.station,
        work: job.work,
        priority: job.priority ?? 0,
        arriveRadius: job.arriveRadius ?? DEFAULT_ARRIVE_RADIUS,
        repeat: job.repeat ?? false,
        worker: null,
      });
      return id;
    },
    cancel(jobId) {
      const job = jobs.get(jobId);
      if (job === undefined) return false;
      if (job.worker !== null) detach(job.worker, false);
      jobs.delete(jobId);
      return true;
    },
    assign(workerId, jobId) {
      const job = jobs.get(jobId);
      if (job === undefined) return false;
      if (job.worker !== null && job.worker !== workerId) detach(job.worker, true);
      detach(workerId, true);
      begin(workerId, job);
      return true;
    },
    claim(workerId) {
      const existing = workerState(workerId);
      if (existing.jobId !== null && jobs.has(existing.jobId)) return existing.jobId;
      let best: Job | null = null;
      for (const job of jobs.values()) {
        if (job.worker !== null) continue;
        if (best === null || job.priority > best.priority) best = job;
      }
      if (best === null) {
        existing.phase = "idle";
        return null;
      }
      begin(workerId, best);
      return best.id;
    },
    release(workerId) {
      detach(workerId, true);
    },
    advance(workerId, dt, ctx) {
      const state = workerState(workerId);
      if (state.jobId === null) {
        state.phase = "idle";
        return null;
      }
      const job = jobs.get(state.jobId);
      if (job === undefined) {
        state.jobId = null;
        state.phase = "idle";
        state.worked = 0;
        return null;
      }
      if (state.phase === "travelling" || state.phase === "idle") {
        state.phase = ctx.distanceToStation <= job.arriveRadius ? "working" : "travelling";
      }
      if (state.phase !== "working" || dt <= 0) return null;
      if (ctx.distanceToStation > job.arriveRadius) {
        state.phase = "travelling";
        return null;
      }
      state.worked += dt;
      if (state.worked < job.work) return null;
      state.cycles += 1;
      const report: JobReport = { jobId: job.id, workerId, cycle: state.cycles };
      if (job.repeat) {
        state.worked -= job.work;
        state.phase = "working";
      } else {
        job.worker = null;
        jobs.delete(job.id);
        state.jobId = null;
        state.phase = "done";
        state.worked = 0;
      }
      return report;
    },
    worker(workerId) {
      return { ...workerState(workerId) };
    },
    station(workerId) {
      const state = workers.get(workerId);
      if (state === undefined || state.jobId === null) return null;
      return jobs.get(state.jobId)?.station ?? null;
    },
    jobOf(workerId) {
      return workers.get(workerId)?.jobId ?? null;
    },
    get(jobId) {
      return jobs.get(jobId) ?? null;
    },
    queued() {
      return [...jobs.values()].filter((job) => job.worker === null);
    },
    active() {
      return [...jobs.values()].filter((job) => job.worker !== null);
    },
    list() {
      return [...jobs.values()];
    },
  };
}
