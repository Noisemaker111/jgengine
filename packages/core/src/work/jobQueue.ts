/**
 * Generic timed work queue — a pure-data model for discrete jobs that reserve
 * inputs, advance over game time, can be paused/cancelled, and emit an output on
 * completion. It backs unit training, crafting jobs, construction, research,
 * respawns, downloads, and fabrication without any of them re-implementing the
 * reservation → progress → completion → output-routing loop.
 *
 * The state ({@link WorkQueueState}) is plain serializable data; all policy —
 * duration, ordering, capacity, concurrency, input reservation, refund, and
 * output mapping — lives in {@link WorkQueueConfig}, which is supplied by the
 * caller and is never serialized. Side effects (charging a wallet, spawning an
 * entity) are the caller's: reservations and refunds are returned as data, and
 * completion emits a typed event carrying a pure output payload for an external
 * completion adapter to route.
 */

export type JobId = string;

/** Lifecycle phase of a single queued job. Terminal jobs are removed from state. */
export type JobStatus = "queued" | "active" | "paused";

/** One unit of timed work. Plain serializable data (given serializable `TSpec`/`TReserve`). */
export interface Job<TSpec, TReserve = undefined> {
  /** Stable id, unique within the queue for its lifetime. */
  readonly id: JobId;
  /** Caller-owned description of the work (e.g. `{ unitId }`). */
  readonly spec: TSpec;
  /** Reserved inputs computed at enqueue time (e.g. resource cost, population). */
  readonly reservation: TReserve;
  readonly status: JobStatus;
  /** Seconds of work the job requires. */
  readonly duration: number;
  /** Seconds of work completed so far (0…duration). */
  readonly elapsed: number;
  /** Higher runs sooner under priority ordering; FIFO within equal priority. */
  readonly priority: number;
  /** Monotonic enqueue index — the FIFO tiebreak. */
  readonly seq: number;
}

/** Serializable queue state. Holds only non-terminal jobs, so it stays bounded. */
export interface WorkQueueState<TSpec, TReserve = undefined> {
  readonly jobs: readonly Job<TSpec, TReserve>[];
  readonly nextId: number;
  readonly seq: number;
}

/** Comparator over jobs; negative means the first job runs sooner. */
export type JobOrdering<TSpec, TReserve = undefined> = (
  a: Job<TSpec, TReserve>,
  b: Job<TSpec, TReserve>,
) => number;

/** Result of pre-enqueue validation (population caps, prerequisites, affordability). */
export interface JobValidation {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Optional per-enqueue overrides. */
export interface EnqueueOptions {
  /** Higher runs sooner under priority ordering. Defaults to 0. */
  readonly priority?: number;
  /** Explicit id; defaults to a queue-assigned `job-<n>`. */
  readonly id?: string;
}

/**
 * Injected policy for a queue. Never serialized — pass the same config to every
 * {@link enqueue}/{@link tick}/{@link cancelJob} call for a given queue.
 */
export interface WorkQueueConfig<TSpec, TReserve = undefined, TOutput = undefined> {
  /** Seconds of work a spec requires. Negative values clamp to 0 (instant). */
  duration: (spec: TSpec) => number;
  /** Max concurrent active jobs (multi-server queue). Defaults to 1. */
  concurrency?: number;
  /** Max non-terminal jobs; further enqueues are rejected with `"capacity"`. */
  capacity?: number;
  /** Selection order for queued jobs. Defaults to {@link priorityOrdering}. */
  ordering?: JobOrdering<TSpec, TReserve>;
  /** Compute the reservation stored on the job (charge-now is the caller's job). */
  reserve?: (spec: TSpec) => TReserve;
  /** Validate before enqueue; a non-ok result rejects with its reason. */
  validate?: (spec: TSpec, state: WorkQueueState<TSpec, TReserve>) => JobValidation;
  /** Map a completed job to its output payload for a completion adapter to route. */
  output?: (job: Job<TSpec, TReserve>) => TOutput;
  /** Compute a refund on cancellation from the reservation and progress (0…1). */
  refund?: (job: Job<TSpec, TReserve>, progress: number) => TReserve | null;
}

/** Typed lifecycle event emitted from {@link tick}. */
export type WorkQueueEvent<TSpec, TReserve = undefined, TOutput = undefined> =
  | { readonly type: "started"; readonly job: Job<TSpec, TReserve> }
  | { readonly type: "completed"; readonly job: Job<TSpec, TReserve>; readonly output: TOutput };

/** Outcome of {@link tick}: advanced state plus the events produced. */
export interface TickResult<TSpec, TReserve = undefined, TOutput = undefined> {
  readonly state: WorkQueueState<TSpec, TReserve>;
  readonly events: readonly WorkQueueEvent<TSpec, TReserve, TOutput>[];
}

/** Outcome of {@link enqueue}. On rejection the state is returned unchanged. */
export type EnqueueResult<TSpec, TReserve = undefined> =
  | { readonly ok: true; readonly state: WorkQueueState<TSpec, TReserve>; readonly job: Job<TSpec, TReserve> }
  | { readonly ok: false; readonly state: WorkQueueState<TSpec, TReserve>; readonly reason: string };

/** Outcome of {@link cancelJob}, carrying the removed job and its computed refund. */
export type CancelResult<TSpec, TReserve = undefined> =
  | {
      readonly ok: true;
      readonly state: WorkQueueState<TSpec, TReserve>;
      readonly job: Job<TSpec, TReserve>;
      readonly refund: TReserve | null;
    }
  | { readonly ok: false; readonly state: WorkQueueState<TSpec, TReserve>; readonly reason: string };

/**
 * Pure FIFO ordering by enqueue sequence.
 *
 * @capability work-order-fifo order queued jobs by enqueue sequence
 */
export function fifoOrdering<TSpec, TReserve = undefined>(a: Job<TSpec, TReserve>, b: Job<TSpec, TReserve>): number {
  return a.seq - b.seq;
}

/**
 * Priority-first ordering (higher priority sooner), FIFO within equal priority.
 *
 * @capability work-order-priority order queued jobs by priority, then FIFO within equal priority
 */
export function priorityOrdering<TSpec, TReserve = undefined>(
  a: Job<TSpec, TReserve>,
  b: Job<TSpec, TReserve>,
): number {
  return b.priority - a.priority || a.seq - b.seq;
}

/**
 * Create an empty timed work queue.
 *
 * @capability work-queue a serializable timed job queue with reservation, cancellation, completion, and output routing
 */
export function createWorkQueue<TSpec, TReserve = undefined>(): WorkQueueState<TSpec, TReserve> {
  return { jobs: [], nextId: 1, seq: 0 };
}

/**
 * Non-terminal job count (queued + active + paused).
 *
 * @capability work-queue-size count non-terminal jobs in a work queue
 */
export function queueSize<TSpec, TReserve>(state: WorkQueueState<TSpec, TReserve>): number {
  return state.jobs.length;
}

/**
 * Look up a job by id, or `null` if absent/terminal.
 *
 * @capability work-job-by-id look up a queued job by id
 */
export function jobById<TSpec, TReserve>(
  state: WorkQueueState<TSpec, TReserve>,
  id: JobId,
): Job<TSpec, TReserve> | null {
  return state.jobs.find((job) => job.id === id) ?? null;
}

/**
 * Jobs waiting for a slot, in selection order.
 *
 * @capability work-queued-jobs list jobs waiting for a slot, in selection order
 */
export function queuedJobs<TSpec, TReserve>(
  state: WorkQueueState<TSpec, TReserve>,
  ordering: JobOrdering<TSpec, TReserve> = priorityOrdering,
): Job<TSpec, TReserve>[] {
  return state.jobs.filter((job) => job.status === "queued").sort(ordering);
}

/**
 * Jobs currently progressing.
 *
 * @capability work-active-jobs list jobs currently progressing in a work queue
 */
export function activeJobs<TSpec, TReserve>(state: WorkQueueState<TSpec, TReserve>): Job<TSpec, TReserve>[] {
  return state.jobs.filter((job) => job.status === "active");
}

/**
 * Fractional progress of a job (0…1); a zero-duration job reads as complete.
 *
 * @capability work-job-progress compute a job's fractional progress
 */
export function jobProgress<TSpec, TReserve>(job: Job<TSpec, TReserve>): number {
  if (job.duration <= 0) return 1;
  return Math.min(1, Math.max(0, job.elapsed / job.duration));
}

/**
 * Enqueue a new job. Validates capacity and the injected `validate` policy, then
 * computes and stores the reservation. Charging the reservation (now or later) is
 * the caller's responsibility using {@link EnqueueResult.job}'s `reservation`.
 *
 * @capability enqueue-work reserve inputs and add a timed job, honoring capacity and validation policy
 */
export function enqueue<TSpec, TReserve, TOutput>(
  state: WorkQueueState<TSpec, TReserve>,
  config: WorkQueueConfig<TSpec, TReserve, TOutput>,
  spec: TSpec,
  options?: EnqueueOptions,
): EnqueueResult<TSpec, TReserve> {
  if (config.capacity !== undefined && state.jobs.length >= config.capacity) {
    return { ok: false, state, reason: "capacity" };
  }
  const validation = config.validate?.(spec, state);
  if (validation !== undefined && !validation.ok) {
    return { ok: false, state, reason: validation.reason ?? "invalid" };
  }
  const reservation = (config.reserve ? config.reserve(spec) : undefined) as TReserve;
  const job: Job<TSpec, TReserve> = {
    id: options?.id ?? `job-${state.nextId}`,
    spec,
    reservation,
    status: "queued",
    duration: Math.max(0, config.duration(spec)),
    elapsed: 0,
    priority: options?.priority ?? 0,
    seq: state.seq,
  };
  return {
    ok: true,
    job,
    state: { jobs: [...state.jobs, job], nextId: state.nextId + 1, seq: state.seq + 1 },
  };
}

/**
 * Cancel a job and compute its refund. Removes the job from the queue and returns
 * a refund payload (full reservation by default, or `config.refund` applied to the
 * job's progress for partial/no refund). Applying the refund is the caller's job.
 *
 * @capability cancel-work remove a job and compute its refund from reservation and progress
 */
export function cancelJob<TSpec, TReserve, TOutput>(
  state: WorkQueueState<TSpec, TReserve>,
  config: WorkQueueConfig<TSpec, TReserve, TOutput>,
  id: JobId,
): CancelResult<TSpec, TReserve> {
  const job = state.jobs.find((entry) => entry.id === id);
  if (job === undefined) return { ok: false, state, reason: "not-found" };
  const refund = config.refund
    ? config.refund(job, jobProgress(job))
    : ((job.reservation ?? null) as TReserve | null);
  return { ok: true, state: { ...state, jobs: state.jobs.filter((entry) => entry.id !== id) }, job, refund };
}

function setStatus<TSpec, TReserve>(
  state: WorkQueueState<TSpec, TReserve>,
  id: JobId,
  from: JobStatus,
  to: JobStatus,
): WorkQueueState<TSpec, TReserve> {
  let changed = false;
  const jobs = state.jobs.map((job) => {
    if (job.id === id && job.status === from) {
      changed = true;
      return { ...job, status: to };
    }
    return job;
  });
  return changed ? { ...state, jobs } : state;
}

/**
 * Pause a queued or active job in place; a paused job keeps its progress and yields its slot.
 *
 * @capability pause-work pause a queued or active job in place, retaining its progress
 */
export function pauseJob<TSpec, TReserve>(
  state: WorkQueueState<TSpec, TReserve>,
  id: JobId,
): WorkQueueState<TSpec, TReserve> {
  const active = setStatus(state, id, "active", "paused");
  return active !== state ? active : setStatus(state, id, "queued", "paused");
}

/**
 * Resume a paused job; it re-enters the queue and competes for a slot by ordering.
 *
 * @capability resume-work resume a paused job back into the queue's slot competition
 */
export function resumeJob<TSpec, TReserve>(
  state: WorkQueueState<TSpec, TReserve>,
  id: JobId,
): WorkQueueState<TSpec, TReserve> {
  return setStatus(state, id, "paused", "queued");
}

interface MutJob<TSpec, TReserve> {
  id: JobId;
  spec: TSpec;
  reservation: TReserve;
  status: JobStatus;
  duration: number;
  elapsed: number;
  priority: number;
  seq: number;
}

/**
 * Advance the queue by `dt` seconds. Promotes queued jobs into up to `concurrency`
 * active slots, advances active jobs, and completes those that reach their
 * duration — emitting `started`/`completed` events in deterministic order. A large
 * `dt` catches up across many jobs in one call: when a job completes with leftover
 * time, the freed slot promotes the next queued job and applies the remainder, so a
 * reconnect or save/load gap resolves in a single bounded pass. Completed jobs are
 * removed from the returned state.
 *
 * @capability tick-work advance jobs over time, completing work and emitting typed lifecycle events
 */
export function tick<TSpec, TReserve, TOutput>(
  state: WorkQueueState<TSpec, TReserve>,
  config: WorkQueueConfig<TSpec, TReserve, TOutput>,
  dt: number,
): TickResult<TSpec, TReserve, TOutput> {
  if (dt <= 0 || state.jobs.length === 0) return { state, events: [] };

  const concurrency = Math.max(1, Math.floor(config.concurrency ?? 1));
  const ordering = config.ordering ?? priorityOrdering;
  const jobs: MutJob<TSpec, TReserve>[] = state.jobs.map((job) => ({ ...job }));
  const events: WorkQueueEvent<TSpec, TReserve, TOutput>[] = [];
  const budget = new Map<JobId, number>();
  const completedIds = new Set<JobId>();

  const activeCount = (): number => jobs.reduce((n, job) => (job.status === "active" ? n + 1 : n), 0);
  const nextQueued = (): MutJob<TSpec, TReserve> | undefined => {
    let best: MutJob<TSpec, TReserve> | undefined;
    for (const job of jobs) {
      if (job.status !== "queued") continue;
      if (best === undefined || ordering(job, best) < 0) best = job;
    }
    return best;
  };
  const promote = (job: MutJob<TSpec, TReserve>, slotBudget: number): void => {
    job.status = "active";
    budget.set(job.id, Math.max(0, slotBudget));
    events.push({ type: "started", job: { ...job } });
  };

  // Jobs already active from a prior tick get a fresh full budget this tick.
  for (const job of jobs) {
    if (job.status === "active") budget.set(job.id, dt);
  }

  // Fill idle slots up to concurrency with a full tick budget each.
  while (activeCount() < concurrency) {
    const next = nextQueued();
    if (next === undefined) break;
    promote(next, dt);
  }

  // Step through completions in time order; each freed slot pulls the next queued
  // job forward with the leftover time. Bounded by the job count.
  const guardMax = jobs.length * 2 + concurrency + 8;
  for (let guard = 0; guard <= guardMax; guard += 1) {
    let chosen: MutJob<TSpec, TReserve> | undefined;
    let chosenRemaining = Infinity;
    for (const job of jobs) {
      if (job.status !== "active") continue;
      const available = budget.get(job.id) ?? 0;
      if (available <= 0) continue;
      const remaining = job.duration - job.elapsed;
      if (remaining > available) continue;
      if (
        chosen === undefined ||
        remaining < chosenRemaining ||
        (remaining === chosenRemaining && ordering(job, chosen) < 0)
      ) {
        chosen = job;
        chosenRemaining = remaining;
      }
    }
    if (chosen === undefined) break;

    const leftover = (budget.get(chosen.id) ?? 0) - Math.max(0, chosenRemaining);
    chosen.elapsed = chosen.duration;
    budget.delete(chosen.id);
    completedIds.add(chosen.id);
    const finished: Job<TSpec, TReserve> = { ...chosen, status: "active" };
    const output = (config.output ? config.output(finished) : undefined) as TOutput;
    events.push({ type: "completed", job: finished, output });

    const next = nextQueued();
    if (next !== undefined) promote(next, leftover);
  }

  // Advance any active job that still holds budget but did not complete.
  for (const job of jobs) {
    if (job.status !== "active" || completedIds.has(job.id)) continue;
    const available = budget.get(job.id) ?? 0;
    if (available > 0) job.elapsed = Math.min(job.duration, job.elapsed + available);
  }

  const remaining = jobs
    .filter((job) => !completedIds.has(job.id))
    .map((job) => ({ ...job }) as Job<TSpec, TReserve>);
  return { state: { ...state, jobs: remaining }, events };
}
