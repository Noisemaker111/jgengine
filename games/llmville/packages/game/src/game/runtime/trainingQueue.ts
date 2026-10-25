import {
  activeJobs,
  createWorkQueue,
  enqueue,
  jobProgress,
  pauseJob,
  resumeJob,
  tick,
  type Job,
  type WorkQueueConfig,
  type WorkQueueState,
} from "@jgengine/core/work/jobQueue";
import { markPlayerDirty } from "@jgengine/core/runtime/snapshot";
import type { GameRuntimeSnapshot, RuntimePlayerRow } from "@jgengine/core/runtime/snapshot";
import {
  computeTrainingDurationMs,
  TRAINED_MODEL_RNG_UNIT_COUNT,
  type TrainingJobSpec,
} from "@llmville/game/models/trainingTransition";

export type { TrainingJobSpec };

export const TRAINING_CONCURRENCY = 1;

/** Longest stretch of wall-clock a single advance may bill and drain, in seconds. */
export const TRAINING_TICK_MAX_SECONDS = 30;

export interface TrainingReservation {
  dataTokens: number;
}

export type TrainingJob = Job<TrainingJobSpec, TrainingReservation>;
export type TrainingQueueState = WorkQueueState<TrainingJobSpec, TrainingReservation>;

export const trainingQueueConfig: WorkQueueConfig<TrainingJobSpec, TrainingReservation, TrainingJobSpec> = {
  duration: (spec) => computeTrainingDurationMs(spec.workTokens, spec.drainTokensPerSecond, spec.durationMultiplier) / 1000,
  concurrency: TRAINING_CONCURRENCY,
  reserve: (spec) => ({ dataTokens: spec.reservedDataTokens }),
  output: (job) => job.spec,
};

export function createTrainingQueue(): TrainingQueueState {
  return createWorkQueue<TrainingJobSpec, TrainingReservation>();
}

export function enqueueTraining(state: TrainingQueueState, spec: TrainingJobSpec) {
  return enqueue(state, trainingQueueConfig, spec);
}

export function trainingTokensRemaining(job: TrainingJob): number {
  return Math.max(0, Math.round(job.spec.workTokens * (1 - jobProgress(job))));
}

export function trainingEndTime(job: TrainingJob, now: number): number {
  return now + Math.max(0, job.duration - job.elapsed) * 1000;
}

export function vendorCostForElapsed(
  spec: TrainingJobSpec,
  dtSeconds: number,
  shopPriceMultiplier: number,
): number {
  if (spec.vendorHourlyUsd <= 0) return 0;
  return Math.ceil(((dtSeconds * 1000) / 3_600_000) * spec.vendorHourlyUsd * shopPriceMultiplier);
}

export interface TrainingTickInput {
  state: TrainingQueueState;
  dtSeconds: number;
  money: number;
  shopPriceMultiplier: number;
}

export interface TrainingTickResult {
  state: TrainingQueueState;
  moneySpent: number;
  completed: readonly TrainingJob[];
  stalled: readonly TrainingJob[];
}

export function tickTraining(input: TrainingTickInput): TrainingTickResult {
  let resumed = input.state;
  for (const job of resumed.jobs) {
    if (job.status === "paused") resumed = resumeJob(resumed, job.id);
  }

  const result = tick(resumed, trainingQueueConfig, input.dtSeconds);

  const ranIds = new Set(activeJobs(resumed).map((job) => job.id));
  for (const event of result.events) {
    if (event.type === "started") ranIds.add(event.job.id);
  }

  let moneySpent = 0;
  const stalled: TrainingJob[] = [];
  for (const id of ranIds) {
    const job = resumed.jobs.find((entry) => entry.id === id);
    if (job === undefined) continue;
    const owed = vendorCostForElapsed(job.spec, input.dtSeconds, input.shopPriceMultiplier);
    if (owed > input.money - moneySpent) {
      stalled.push(job);
      continue;
    }
    moneySpent += owed;
  }

  if (stalled.length > 0) {
    let paused = resumed;
    for (const job of stalled) paused = pauseJob(paused, job.id);
    return { state: paused, moneySpent: 0, completed: [], stalled };
  }

  const completed = result.events.flatMap((event) => (event.type === "completed" ? [event.job] : []));
  return { state: result.state, moneySpent, completed, stalled };
}

export interface TrainingState {
  queue: TrainingQueueState;
  lastTickAtMs: number;
}

type PlayerRowWithTraining = RuntimePlayerRow & { training?: TrainingState };

/** Wall-clock milliseconds in, work-queue seconds out. */
export function trainingTickSeconds(lastTickAtMs: number, nowMs: number): number {
  return Math.min(TRAINING_TICK_MAX_SECONDS, Math.max(0, (nowMs - lastTickAtMs) / 1000));
}

function isTrainingState(value: unknown): value is TrainingState {
  if (value === null || typeof value !== "object") return false;
  const state = value as Partial<TrainingState>;
  if (typeof state.lastTickAtMs !== "number") return false;
  const queue = state.queue;
  return (
    queue !== undefined &&
    Array.isArray(queue.jobs) &&
    typeof queue.nextId === "number" &&
    typeof queue.seq === "number"
  );
}

export function normalizeTrainingState(value: unknown, nowMs: number): TrainingState {
  return isTrainingState(value) ? value : { queue: createTrainingQueue(), lastTickAtMs: nowMs };
}

export function readTrainingState(
  snapshot: GameRuntimeSnapshot,
  userId: string,
  nowMs: number,
): TrainingState {
  return normalizeTrainingState((snapshot.players[userId] as PlayerRowWithTraining | undefined)?.training, nowMs);
}

export function writeTrainingState(
  snapshot: GameRuntimeSnapshot,
  userId: string,
  state: TrainingState,
): GameRuntimeSnapshot {
  const player = snapshot.players[userId];
  if (player === undefined) return snapshot;
  const next: PlayerRowWithTraining = { ...player, training: state };
  return markPlayerDirty({ ...snapshot, players: { ...snapshot.players, [userId]: next } }, userId);
}

export function trainingRngUnits(seed: string): number[] {
  const units: number[] = [];
  for (let index = 0; index < TRAINED_MODEL_RNG_UNIT_COUNT; index += 1) {
    let hash = 2166136261;
    const source = `${seed}:roll:${index}`;
    for (let cursor = 0; cursor < source.length; cursor += 1) {
      hash = Math.imul(hash ^ source.charCodeAt(cursor), 16777619);
    }
    units.push((hash >>> 0) * 2 ** -32);
  }
  return units;
}
