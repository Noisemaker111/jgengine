import type { Moodle, MoodleSeverity } from "./moodle";
import { changeStatPool, createStatPool } from "../stats/statPool";

export interface MeterThreshold {
  /** Moodle id raised while the meter is on the wrong side of `at`. */
  id: string;
  label: string;
  /** Boundary value. */
  at: number;
  /** Raise the moodle when the meter is `below` (hunger/thirst) or `above` (temperature, radiation) this value. */
  when: "below" | "above";
  severity?: MoodleSeverity;
  icon?: string;
}

export interface DecayMeterConfig {
  id: string;
  max: number;
  min?: number;
  /** Starting value; defaults to `max` (a full stomach). */
  start?: number;
  /**
   * Units changed per game-second at rate-modifier 1. Positive drains toward `min`
   * (hunger, oxygen), negative fills toward `max` (a warmth meter recovering by a fire).
   */
  rate: number;
  /** Status thresholds → moodles, distinct from the raw numeric bar. */
  thresholds?: readonly MeterThreshold[];
}

export interface DecayMeterState {
  id: string;
  value: number;
  max: number;
  min: number;
  /** 0..1 fill. */
  fraction: number;
}

/**
 * Plain-data meter values: `meter id → current value`. The value half of a save — a tuned meter
 * also needs its rate and rate modifiers, which `createNeedSet` (`sim/needs`) snapshots and restores.
 */
export type DecayMeterValues = Record<string, number>;

/**
 * Rate multiplier for {@link decayMeters}: one scalar applied to every meter (a member's
 * metabolism, a game-mode harshness dial) or a per-meter record (cold biome → warmth only).
 * `1` / omitted leaves the base rates unscaled.
 */
export type DecayModifier = number | Record<string, number>;

function meterMin(def: DecayMeterConfig): number {
  return def.min ?? 0;
}

function bounded(def: DecayMeterConfig, value: number, amount: number): number {
  const pool = createStatPool({ current: value, max: def.max, min: meterMin(def) });
  return changeStatPool(pool, amount).pool.current;
}

function initialValue(def: DecayMeterConfig): number {
  return bounded(def, def.start ?? def.max, 0);
}

function valueOf(values: DecayMeterValues, def: DecayMeterConfig): number {
  const current = values[def.id];
  return current === undefined ? initialValue(def) : current;
}

function modifierFor(modifier: DecayModifier | undefined, id: string): number {
  if (modifier === undefined) return 1;
  if (typeof modifier === "number") return modifier;
  return modifier[id] ?? 1;
}

function findDef(defs: readonly DecayMeterConfig[], id: string): DecayMeterConfig {
  const def = defs.find((candidate) => candidate.id === id);
  if (def === undefined) throw new Error(`unknown decay meter "${id}"`);
  return def;
}

function stateOf(def: DecayMeterConfig, value: number): DecayMeterState {
  const min = meterMin(def);
  const span = def.max - min;
  return {
    id: def.id,
    value,
    max: def.max,
    min,
    fraction: span > 0 ? (value - min) / span : 0,
  };
}

function crossed(threshold: MeterThreshold, value: number): boolean {
  return threshold.when === "below" ? value < threshold.at : value > threshold.at;
}

/**
 * Starting values for `defs` — each meter's `start ?? max`, clamped to its range. Seed a
 * serialized state record with this instead of holding a `createNeedSet` closure.
 *
 * @capability decay-meter survival meters that drain/refill over game time (hunger, water, oxygen, stamina)
 */
export function initDecayMeters(defs: readonly DecayMeterConfig[]): DecayMeterValues {
  const out: DecayMeterValues = {};
  for (const def of defs) out[def.id] = initialValue(def);
  return out;
}

/**
 * Pure per-tick decay over plain data: drain (or fill) every meter by `rate * modifier * dt`,
 * clamped to its range, returning a new `id → value` record. Returns `values` unchanged when
 * `dt <= 0`. The serializable counterpart to `NeedSet.tick`.
 *
 * @capability decay-meter survival meters that drain/refill over game time (hunger, water, oxygen, stamina)
 */
export function decayMeters(
  values: DecayMeterValues,
  defs: readonly DecayMeterConfig[],
  dt: number,
  modifier?: DecayModifier,
): DecayMeterValues {
  if (dt <= 0) return values;
  const out: DecayMeterValues = {};
  for (const def of defs) {
    out[def.id] = bounded(def, valueOf(values, def), -def.rate * modifierFor(modifier, def.id) * dt);
  }
  return out;
}

/**
 * Refill (or drain, if negative) one meter by `amount`, clamped to its range. Returns a new
 * record; throws on an unknown id. The pure counterpart to `NeedSet.refill`.
 *
 * @capability decay-meter survival meters that drain/refill over game time (hunger, water, oxygen, stamina)
 */
export function refillMeter(
  values: DecayMeterValues,
  defs: readonly DecayMeterConfig[],
  id: string,
  amount: number,
): DecayMeterValues {
  const def = findDef(defs, id);
  return { ...values, [id]: bounded(def, valueOf(values, def), amount) };
}

/**
 * Numeric state (value, bounds, 0..1 fraction) for one meter. Throws on an unknown id.
 *
 * @capability decay-meter survival meters that drain/refill over game time (hunger, water, oxygen, stamina)
 */
export function decayMeterState(
  values: DecayMeterValues,
  defs: readonly DecayMeterConfig[],
  id: string,
): DecayMeterState {
  const def = findDef(defs, id);
  return stateOf(def, valueOf(values, def));
}

/**
 * Numeric state for every meter, keyed by id — the pure counterpart to `NeedSet.states`.
 *
 * @capability decay-meter survival meters that drain/refill over game time (hunger, water, oxygen, stamina)
 */
export function decayMeterSnapshot(
  values: DecayMeterValues,
  defs: readonly DecayMeterConfig[],
): Record<string, DecayMeterState> {
  const out: Record<string, DecayMeterState> = {};
  for (const def of defs) out[def.id] = stateOf(def, valueOf(values, def));
  return out;
}

/**
 * Moodles for every crossed threshold, worst-first per meter in declared order.
 *
 * @capability decay-meter survival meters that drain/refill over game time (hunger, water, oxygen, stamina)
 */
export function decayMeterMoodles(
  values: DecayMeterValues,
  defs: readonly DecayMeterConfig[],
): Moodle[] {
  const out: Moodle[] = [];
  for (const def of defs) {
    const value = valueOf(values, def);
    for (const threshold of def.thresholds ?? []) {
      if (!crossed(threshold, value)) continue;
      out.push({
        id: threshold.id,
        label: threshold.label,
        severity: threshold.severity ?? "warning",
        source: "meter",
        stacks: 1,
        ...(threshold.icon === undefined ? {} : { icon: threshold.icon }),
        fraction: stateOf(def, value).fraction,
      });
    }
  }
  return out;
}
