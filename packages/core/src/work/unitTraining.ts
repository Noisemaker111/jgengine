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

export type ResourceCost = Readonly<Record<string, number>>;

export interface TrainableUnitDef {
  readonly id: string;
  /** Seconds to train. */
  readonly trainSeconds: number;
  readonly cost?: ResourceCost;
  readonly population?: number;
}

export interface UnitTrainingSpec {
  readonly unitId: string;
}

export interface UnitReservation {
  readonly cost: ResourceCost;
  readonly population: number;
}

export interface UnitSpawnOrder {
  readonly unitId: string;
  readonly reservation: UnitReservation;
}

export interface UnitTrainingOptions {
  readonly units: Record<string, TrainableUnitDef>;
  readonly concurrency?: number;
  readonly capacity?: number;
  /** Refund fraction of cost on cancel (0 = none, 1 = full). Defaults to 1. */
  readonly refundFraction?: number;
  readonly canEnqueue?: (spec: UnitTrainingSpec, state: WorkQueueState<UnitTrainingSpec, UnitReservation>) => JobValidation;
}

function scaleCost(cost: ResourceCost, fraction: number): ResourceCost {
  if (fraction >= 1) return cost;
  if (fraction <= 0) return {};
  const out: Record<string, number> = {};
  for (const [resource, amount] of Object.entries(cost)) out[resource] = Math.floor(amount * fraction);
  return out;
}

/** @capability unit-training compose a timed work queue that trains catalog units into spawn orders */
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
