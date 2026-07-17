import type { Moodle, MoodleSeverity } from "./moodle";

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

/** Set of named survival meters (hunger/thirst/…) that drain and refill over game time. */
export interface DecayMeterSet {
  /** Drain/fill every meter by `rate * rateModifier * dt`. Call once per game tick. */
  tick(dt: number): void;
  value(id: string): number;
  state(id: string): DecayMeterState;
  /** Consumable/action refill: `refill("hunger", 40)` after eating. Negative drains. */
  refill(id: string, amount: number): void;
  /** Overwrite the base drain rate (e.g. a game mode with harsher hunger). */
  setRate(id: string, rate: number): void;
  /** Multiply drain until cleared via `setRateModifier(id, 1)` — cold biome, sprint, etc. */
  setRateModifier(id: string, multiplier: number): void;
  /** Moodles for every crossed threshold, worst-first per meter. */
  moodles(): Moodle[];
  /** True while any threshold with the given severity (or worse) is active — cheap game gate. */
  snapshot(): Record<string, DecayMeterState>;
  ids(): readonly string[];
}

/**
 * Plain-data meter values: `meter id → current value`. This is the whole serialized
 * form — it drops straight into a `defineGame` state record and round-trips through
 * save/load and multiplayer sync with no closure to rebuild.
 */
export type DecayMeterValues = Record<string, number>;

/**
 * Rate multiplier for {@link decayMeters}: one scalar applied to every meter (a member's
 * metabolism, a game-mode harshness dial) or a per-meter record (cold biome → warmth only).
 * `1` / omitted leaves the base rates unscaled.
 */
export type DecayModifier = number | Record<string, number>;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function meterMin(def: DecayMeterConfig): number {
  return def.min ?? 0;
}

function initialValue(def: DecayMeterConfig): number {
  return clamp(def.start ?? def.max, meterMin(def), def.max);
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
 * serialized state record with this instead of holding a {@link createDecayMeterSet} closure.
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
 * `dt <= 0`. The serializable counterpart to {@link DecayMeterSet.tick}.
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
    out[def.id] = clamp(
      valueOf(values, def) - def.rate * modifierFor(modifier, def.id) * dt,
      meterMin(def),
      def.max,
    );
  }
  return out;
}

/**
 * Refill (or drain, if negative) one meter by `amount`, clamped to its range. Returns a new
 * record; throws on an unknown id. The pure counterpart to {@link DecayMeterSet.refill}.
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
  return { ...values, [id]: clamp(valueOf(values, def) + amount, meterMin(def), def.max) };
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
 * Numeric state for every meter, keyed by id — the pure counterpart to {@link DecayMeterSet.snapshot}.
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

/**
 * Named decay meters — hunger, thirst, oxygen, sanity, warmth, stamina. Each drains
 * (or recovers) on game-time `dt` at a configurable rate, refills from consumables or
 * actions, and raises moodle statuses at thresholds. Rate modifiers let the environment
 * drive them (colder → faster warmth loss; toxic biome → oxygen drops), so a game reads
 * an environment field then calls `setRateModifier`.
 *
 * @capability decay-meter survival meters that drain/refill over game time (hunger, water, oxygen, stamina)
 */
export function createDecayMeterSet(configs: readonly DecayMeterConfig[]): DecayMeterSet {
  // Mutable copy so setRate can override a meter's base rate without mutating the caller's defs.
  const defs = configs.map((config) => ({ ...config }));
  const order = defs.map((def) => def.id);
  const modifiers: Record<string, number> = {};
  let values = initDecayMeters(defs);

  return {
    tick(dt) {
      values = decayMeters(values, defs, dt, modifiers);
    },
    value(id) {
      return decayMeterState(values, defs, id).value;
    },
    state(id) {
      return decayMeterState(values, defs, id);
    },
    refill(id, amount) {
      values = refillMeter(values, defs, id, amount);
    },
    setRate(id, rate) {
      findDef(defs, id).rate = rate;
    },
    setRateModifier(id, multiplier) {
      findDef(defs, id);
      modifiers[id] = multiplier;
    },
    moodles() {
      return decayMeterMoodles(values, defs);
    },
    snapshot() {
      return decayMeterSnapshot(values, defs);
    },
    ids() {
      return order;
    },
  };
}
