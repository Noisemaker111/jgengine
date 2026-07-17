/**
 * Thin unit-training composition over the generic {@link WorkQueueConfig}. Turns a
 * catalog of trainable units into a queue config whose reservation is the unit's
 * cost/population, whose duration is its train time, and whose completion output is
 * a plain spawn descriptor. The queue never spawns or moves anything: routing the
 * descriptor to a spawn primitive (and rally movement) is the caller's completion
 * adapter, keeping this genre-agnostic across RTS producers, respawn bays, and any
 * "make one of X after T seconds" flow.
 */

import type { Job, JobValidation, WorkQueueConfig, WorkQueueState } from "./jobQueue";

/** Resource costs keyed by currency/resource id. */
export type ResourceCost = Readonly<Record<string, number>>;

/** A unit the producer can train. */
export interface TrainableUnitDef {
  /** Catalog id of the produced unit. */
  readonly id: string;
  /** Seconds to train. */
  readonly trainSeconds: number;
  /** Resources reserved at enqueue. */
  readonly cost?: ResourceCost;
  /** Population/supply reserved at enqueue. */
  readonly population?: number;
}

/** What the caller asks the queue to build. */
export interface UnitTrainingSpec {
  readonly unitId: string;
}

/** Reservation stored on a training job — the inputs to charge and refund. */
export interface UnitReservation {
  readonly cost: ResourceCost;
  readonly population: number;
}

/** Completion payload: everything a spawn/rally adapter needs, and nothing it doesn't. */
export interface UnitSpawnOrder {
  readonly unitId: string;
  readonly reservation: UnitReservation;
}

/** Config knobs for {@link unitTrainingConfig}. */
export interface UnitTrainingOptions {
  /** Trainable units by id. */
  readonly units: Record<string, TrainableUnitDef>;
  /** Producers building at once (default 1 — a classic single build queue). */
  readonly concurrency?: number;
  /** Max queued+building units. */
  readonly capacity?: number;
  /** Refund fraction of cost on cancel (0 = none, 1 = full). Defaults to 1. */
  readonly refundFraction?: number;
  /** Extra pre-enqueue gate (affordability, tech, population cap). */
  readonly canEnqueue?: (spec: UnitTrainingSpec, state: WorkQueueState<UnitTrainingSpec, UnitReservation>) => JobValidation;
}

function scaleCost(cost: ResourceCost, fraction: number): ResourceCost {
  if (fraction >= 1) return cost;
  if (fraction <= 0) return {};
  const out: Record<string, number> = {};
  for (const [resource, amount] of Object.entries(cost)) out[resource] = Math.floor(amount * fraction);
  return out;
}

/**
 * Build a {@link WorkQueueConfig} for training units from a catalog. Reservation is
 * the unit's cost + population; duration is its train time; completion output is a
 * {@link UnitSpawnOrder} for the caller to route to its spawn primitive.
 *
 * @capability unit-training compose a timed work queue that trains catalog units into spawn orders
 */
export function unitTrainingConfig(
  options: UnitTrainingOptions,
): WorkQueueConfig<UnitTrainingSpec, UnitReservation, UnitSpawnOrder> {
  const refundFraction = options.refundFraction ?? 1;
  const unitFor = (unitId: string): TrainableUnitDef | undefined => options.units[unitId];
  return {
    concurrency: options.concurrency,
    capacity: options.capacity,
    duration: (spec) => Math.max(0, unitFor(spec.unitId)?.trainSeconds ?? 0),
    reserve: (spec) => {
      const def = unitFor(spec.unitId);
      return { cost: def?.cost ?? {}, population: def?.population ?? 0 };
    },
    validate: (spec, state) => {
      if (unitFor(spec.unitId) === undefined) return { ok: false, reason: "unknown-unit" };
      return options.canEnqueue?.(spec, state) ?? { ok: true };
    },
    output: (job: Job<UnitTrainingSpec, UnitReservation>) => ({
      unitId: job.spec.unitId,
      reservation: job.reservation,
    }),
    refund: (job: Job<UnitTrainingSpec, UnitReservation>) => ({
      cost: scaleCost(job.reservation.cost, refundFraction),
      population: job.reservation.population,
    }),
  };
}
