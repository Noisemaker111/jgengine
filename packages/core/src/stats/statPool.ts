import { clamp } from "../math/scalar";

/** Serializable state for any bounded named resource. The caller defines what the resource means. */
export interface StatPool {
  current: number;
  max: number;
  min: number;
}

/** Input used to create a normalized pool. `current` defaults to `max`; `min` defaults to zero. */
export interface StatPoolInput {
  current?: number | undefined;
  max: number;
  min?: number | undefined;
}

/** Partial update applied without mutating the previous pool. */
export interface StatPoolPatch {
  current?: number;
  max?: number;
  min?: number;
}

/**
 * Structural bridge to caller-owned resource state. Implement it over an ECS,
 * Redux/Zustand store, plain object, database-backed model, or JGengine's native
 * entity stats without moving ownership into the SDK.
 */
export interface StatPoolAccess<TOwnerId extends string = string, TStatId extends string = string> {
  get(ownerId: TOwnerId, statId: TStatId): StatPool | null;
  set(ownerId: TOwnerId, statId: TStatId, next: StatPool): unknown;
}

/** Inspectable result of a bounded pool change. */
export interface StatPoolChange {
  previous: StatPool;
  pool: StatPool;
  /** Actual applied amount after clamping. */
  applied: number;
  /** Requested amount that did not fit: `amount - applied`. */
  overflow: number;
  hitMin: boolean;
  hitMax: boolean;
}

/** Outcome of changing a pool through {@link StatPoolAccess}. */
export type StatPoolAccessResult =
  | ({ status: "ok" } & StatPoolChange)
  | { status: "rejected"; reason: string };

/**
 * Normalize caller data into a complete plain-data pool.
 *
 * @capability stat-pool create a serializable current/min/max pool for any caller-named resource
 */
export function createStatPool(input: StatPoolInput): StatPool {
  const min = input.min ?? 0;
  return {
    current: clamp(input.current ?? input.max, min, input.max),
    max: input.max,
    min,
  };
}

/**
 * Apply new bounds/current to a pool, clamping the result and leaving the input untouched.
 *
 * @capability stat-pool-patch immutably retune a bounded resource's current value or bounds
 */
export function patchStatPool(pool: StatPool, patch: StatPoolPatch): StatPool {
  const max = patch.max ?? pool.max;
  const min = patch.min ?? pool.min;
  return {
    current: clamp(patch.current ?? pool.current, min, max),
    max,
    min,
  };
}

/**
 * Pure bounded delta transition with the exact applied amount and boundary flags.
 *
 * @capability stat-pool-change immutably increase or decrease any named bounded resource with clamp evidence
 */
export function changeStatPool(pool: StatPool, amount: number): StatPoolChange {
  const next = patchStatPool(pool, { current: pool.current + amount });
  const applied = next.current - pool.current;
  return {
    previous: pool,
    // Preserve the input reference on a no-op change (regen at max, damage at 0,
    // clamp to a bound) so reference-equality guards in HUD hooks don't churn.
    pool: applied === 0 ? pool : next,
    applied,
    overflow: amount - applied,
    hitMin: next.current === next.min,
    hitMax: next.current === next.max,
  };
}

/**
 * Read, transition, and write a caller-owned pool through the structural
 * adapter. Positive amounts increase the resource; negative amounts decrease
 * it. The adapter receives a complete replacement value, never a hidden
 * mutation.
 *
 * @capability portable-stat-pool apply deterministic bounded resource changes through a caller-owned stat adapter
 */
export function applyStatPoolDelta<TOwnerId extends string, TStatId extends string>(
  access: StatPoolAccess<TOwnerId, TStatId>,
  ownerId: TOwnerId,
  statId: TStatId,
  amount: number,
): StatPoolAccessResult {
  const pool = access.get(ownerId, statId);
  if (pool === null) return { status: "rejected", reason: `unknown stat "${statId}"` };
  const change = changeStatPool(pool, amount);
  access.set(ownerId, statId, change.pool);
  return { status: "ok", ...change };
}

/** How a meter changes by itself over time. All per second; every field optional. */
export interface MeterRates {
  /** Toward max, only once `regenDelay` seconds have passed since the last drop. */
  regen?: number | undefined;
  /** Toward min, only once `decayDelay` seconds have passed since the last fill. */
  decay?: number | undefined;
  /** Seconds after a drop before regen starts. Default 0. */
  regenDelay?: number | undefined;
  /** Seconds after a fill before decay starts. Default 0. */
  decayDelay?: number | undefined;
}

/** Plain JSON meter: the pool, seconds since its last drop and seconds since its last fill. */
export interface MeterState {
  pool: StatPool;
  sinceDrop: number;
  sinceFill: number;
}

/** A new meter, full unless `current` says otherwise.
 *
 * @capability meter create a ticking bounded value
 */
export function createMeter(input: StatPoolInput): MeterState {
  return { pool: createStatPool(input), sinceDrop: 0, sinceFill: 0 };
}

/** Advance `dt` seconds: decay if its delay has passed, then regen if its delay has passed.
 *
 * @capability meter-rates tick a bounded value's regen, decay and their delays over time
 */
export function tickMeter(
  meter: MeterState,
  rates: MeterRates,
  dt: number,
): { meter: MeterState; change: StatPoolChange } {
  // Draining is not a drop, so it leaves the regen delay alone; filling does count as a fill.
  const sinceDrop = meter.sinceDrop + dt;
  const elapsed = meter.sinceFill + dt;
  const decayAmount =
    rates.decay !== undefined && elapsed >= (rates.decayDelay ?? 0) ? -rates.decay * dt : 0;
  const decay = changeStatPool(meter.pool, decayAmount);
  const regenAmount =
    rates.regen !== undefined && sinceDrop >= (rates.regenDelay ?? 0) ? rates.regen * dt : 0;
  const regen = changeStatPool(decay.pool, regenAmount);
  const pool = regen.pool;
  const sinceFill = regen.applied > 0 ? 0 : elapsed;
  const next: MeterState =
    pool === meter.pool && sinceDrop === meter.sinceDrop && sinceFill === meter.sinceFill
      ? meter
      : { pool, sinceDrop, sinceFill };
  return {
    meter: next,
    change: {
      previous: meter.pool,
      pool,
      applied: decay.applied + regen.applied,
      overflow: decay.overflow + regen.overflow,
      hitMin: pool.current === pool.min,
      hitMax: pool.current === pool.max,
    },
  };
}

/** Add `amount` now (negative drains). A drop (applied < 0) resets sinceDrop to 0, a fill (applied > 0) resets sinceFill to 0.
 *
 * @capability meter-change drain or fill a ticking meter, restarting its regen delay on a drop
 */
export function changeMeter(
  meter: MeterState,
  amount: number,
): { meter: MeterState; change: StatPoolChange } {
  const change = changeStatPool(meter.pool, amount);
  const sinceDrop = change.applied < 0 ? 0 : meter.sinceDrop;
  const sinceFill = change.applied > 0 ? 0 : meter.sinceFill;
  const next: MeterState =
    change.pool === meter.pool && sinceDrop === meter.sinceDrop && sinceFill === meter.sinceFill
      ? meter
      : { pool: change.pool, sinceDrop, sinceFill };
  return { meter: next, change };
}
