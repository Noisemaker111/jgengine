import { DROWN_PENALTY_SECONDS, MAX_DROWNS, TIDE_STAGES, tideStageIndexAt } from "../tide/catalog";
import { DELIVERY_JOBS, REQUIRED_DELIVERIES, jobById, jobLabel, jobQueueForSeed } from "../delivery/catalog";
import { HOME_VILLAGE_ID, villageById } from "../world/villages";

export type RunStatus = "start" | "playing" | "won" | "lost";
export type LoseReason = "tide" | "deadline" | null;

export interface CarriedPackage {
  readonly jobId: string;
  readonly pickedUpAt: number;
}

export interface ToastEntry {
  readonly id: number;
  readonly text: string;
  readonly at: number;
}

export interface DeliveryLogEntry {
  readonly jobId: string;
  readonly outcome: "delivered" | "expired";
  readonly at: number;
}

export interface RunState {
  readonly seed: string;
  readonly status: RunStatus;
  readonly elapsed: number;
  readonly queue: readonly string[];
  readonly carried: CarriedPackage | null;
  readonly completed: number;
  readonly score: number;
  readonly drownCount: number;
  readonly lastVillageId: string;
  readonly respawnFreezeUntil: number | null;
  readonly tideStageSeen: number;
  readonly toastSeq: number;
  readonly toasts: readonly ToastEntry[];
  readonly log: readonly DeliveryLogEntry[];
  readonly loseReason: LoseReason;
}

const TOAST_TTL_SECONDS = 6;
const MAX_TOASTS = 4;

export function createInitialRun(seed: string): RunState {
  return {
    seed,
    status: "start",
    elapsed: 0,
    queue: jobQueueForSeed(seed),
    carried: null,
    completed: 0,
    score: 0,
    drownCount: 0,
    lastVillageId: HOME_VILLAGE_ID,
    respawnFreezeUntil: null,
    tideStageSeen: 0,
    toastSeq: 0,
    toasts: [],
    log: [],
    loseReason: null,
  };
}

function pushToast(run: RunState, text: string): RunState {
  const entry: ToastEntry = { id: run.toastSeq, text, at: run.elapsed };
  const toasts = [...run.toasts, entry].slice(-MAX_TOASTS);
  return { ...run, toastSeq: run.toastSeq + 1, toasts };
}

function pruneToasts(run: RunState): RunState {
  const toasts = run.toasts.filter((toast) => run.elapsed - toast.at < TOAST_TTL_SECONDS);
  if (toasts.length === run.toasts.length) return run;
  return { ...run, toasts };
}

export function startRun(run: RunState): RunState {
  if (run.status !== "start") return run;
  return { ...run, status: "playing", elapsed: 0 };
}

function withLoseCheck(run: RunState): RunState {
  if (run.status !== "playing") return run;
  if (run.completed >= REQUIRED_DELIVERIES) return { ...run, status: "won" };
  if (run.carried === null && run.queue.length === 0) {
    return { ...run, status: "lost", loseReason: "deadline" };
  }
  return run;
}

export function advanceElapsed(run: RunState, elapsed: number): RunState {
  if (run.status !== "playing") return run;
  let next: RunState = { ...run, elapsed };

  const stageIndex = tideStageIndexAt(elapsed);
  if (stageIndex > next.tideStageSeen) {
    const stage = TIDE_STAGES[stageIndex]!;
    next = { ...next, tideStageSeen: stageIndex };
    if (stage.toast !== null) next = pushToast(next, stage.toast);
  }

  if (next.carried !== null) {
    const job = jobById(next.carried.jobId);
    const deadline = next.carried.pickedUpAt + job.deadlineSeconds;
    if (elapsed > deadline) {
      const log: DeliveryLogEntry[] = [...next.log, { jobId: job.id, outcome: "expired", at: elapsed }];
      next = pushToast(
        { ...next, carried: null, log },
        `Too late — the parcel for ${villageById(job.destinationId).name} spoiled on the road.`,
      );
    }
  }

  next = pruneToasts(next);
  return withLoseCheck(next);
}

export function touchVillage(run: RunState, villageId: string): RunState {
  if (run.lastVillageId === villageId) return run;
  return { ...run, lastVillageId: villageId };
}

export function pickupPackage(run: RunState, villageId: string): RunState {
  if (run.status !== "playing" || run.carried !== null || run.queue.length === 0) return run;
  const nextJobId = run.queue[0]!;
  const job = jobById(nextJobId);
  if (job.originId !== villageId) return run;
  const carried: CarriedPackage = { jobId: nextJobId, pickedUpAt: run.elapsed };
  return pushToast(
    { ...run, carried, queue: run.queue.slice(1) },
    `Parcel for ${villageById(job.destinationId).name} — she floods first if you dawdle.`,
  );
}

export function deliverPackage(run: RunState, villageId: string): RunState {
  if (run.status !== "playing" || run.carried === null) return run;
  const job = jobById(run.carried.jobId);
  if (job.destinationId !== villageId) return run;

  const deadline = run.carried.pickedUpAt + job.deadlineSeconds;
  if (run.elapsed > deadline) {
    const log: DeliveryLogEntry[] = [...run.log, { jobId: job.id, outcome: "expired", at: run.elapsed }];
    return withLoseCheck(
      pushToast(
        { ...run, carried: null, log, lastVillageId: villageId },
        `Too late — the parcel for ${villageById(job.destinationId).name} spoiled on the road.`,
      ),
    );
  }

  const timeRemaining = Math.max(0, deadline - run.elapsed);
  const bonus = Math.round((timeRemaining / job.deadlineSeconds) * 50);
  const log: DeliveryLogEntry[] = [...run.log, { jobId: job.id, outcome: "delivered", at: run.elapsed }];
  const next: RunState = {
    ...run,
    carried: null,
    completed: run.completed + 1,
    score: run.score + 100 + bonus,
    lastVillageId: villageId,
    log,
  };
  return withLoseCheck(pushToast(next, `Delivered to ${villageById(job.destinationId).name}!`));
}

export function applyDrown(run: RunState): RunState {
  if (run.status !== "playing") return run;
  const respawnVillage = villageById(run.lastVillageId);
  let queue = run.queue;
  if (run.carried !== null) {
    queue = [run.carried.jobId, ...run.queue];
  }
  const drownCount = run.drownCount + 1;
  let next: RunState = pushToast(
    {
      ...run,
      carried: null,
      queue,
      drownCount,
      respawnFreezeUntil: run.elapsed + DROWN_PENALTY_SECONDS,
    },
    `Caught by the tide! ${respawnVillage.name} pulls you back.`,
  );

  if (drownCount >= MAX_DROWNS) {
    next = { ...next, status: "lost", loseReason: "tide" };
  }
  return next;
}

export function restartRun(seed: string): RunState {
  return createInitialRun(seed);
}

export function activeJobId(run: RunState): string | null {
  if (run.carried !== null) return run.carried.jobId;
  return run.queue[0] ?? null;
}

export function isFrozen(run: RunState): boolean {
  return run.respawnFreezeUntil !== null && run.elapsed < run.respawnFreezeUntil;
}

export function deadlineRemaining(run: RunState): number | null {
  if (run.carried === null) return null;
  const job = jobById(run.carried.jobId);
  return Math.max(0, run.carried.pickedUpAt + job.deadlineSeconds - run.elapsed);
}

export { DELIVERY_JOBS, REQUIRED_DELIVERIES, jobById, jobLabel };
