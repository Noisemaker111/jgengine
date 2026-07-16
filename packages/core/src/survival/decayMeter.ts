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

/** Live handle over a set of survival meters (hunger, thirst, oxygen) that drain or refill as game time advances. */
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

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

interface MeterRuntime {
  config: DecayMeterConfig;
  min: number;
  max: number;
  value: number;
  rate: number;
  modifier: number;
}

function toState(runtime: MeterRuntime): DecayMeterState {
  const span = runtime.max - runtime.min;
  return {
    id: runtime.config.id,
    value: runtime.value,
    max: runtime.max,
    min: runtime.min,
    fraction: span > 0 ? (runtime.value - runtime.min) / span : 0,
  };
}

function crossed(threshold: MeterThreshold, value: number): boolean {
  return threshold.when === "below" ? value < threshold.at : value > threshold.at;
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
  const meters = new Map<string, MeterRuntime>();
  const order: string[] = [];
  for (const config of configs) {
    const min = config.min ?? 0;
    const max = config.max;
    const value = clamp(config.start ?? max, min, max);
    meters.set(config.id, { config, min, max, value, rate: config.rate, modifier: 1 });
    order.push(config.id);
  }

  const getMeter = (id: string): MeterRuntime => {
    const runtime = meters.get(id);
    if (runtime === undefined) throw new Error(`unknown decay meter "${id}"`);
    return runtime;
  };

  return {
    tick(dt) {
      if (dt <= 0) return;
      for (const runtime of meters.values()) {
        runtime.value = clamp(
          runtime.value - runtime.rate * runtime.modifier * dt,
          runtime.min,
          runtime.max,
        );
      }
    },
    value(id) {
      return getMeter(id).value;
    },
    state(id) {
      return toState(getMeter(id));
    },
    refill(id, amount) {
      const runtime = getMeter(id);
      runtime.value = clamp(runtime.value + amount, runtime.min, runtime.max);
    },
    setRate(id, rate) {
      getMeter(id).rate = rate;
    },
    setRateModifier(id, multiplier) {
      getMeter(id).modifier = multiplier;
    },
    moodles() {
      const out: Moodle[] = [];
      for (const id of order) {
        const runtime = meters.get(id)!;
        for (const threshold of runtime.config.thresholds ?? []) {
          if (!crossed(threshold, runtime.value)) continue;
          out.push({
            id: threshold.id,
            label: threshold.label,
            severity: threshold.severity ?? "warning",
            source: "meter",
            stacks: 1,
            ...(threshold.icon === undefined ? {} : { icon: threshold.icon }),
            fraction: toState(runtime).fraction,
          });
        }
      }
      return out;
    },
    snapshot() {
      const out: Record<string, DecayMeterState> = {};
      for (const id of order) out[id] = toState(meters.get(id)!);
      return out;
    },
    ids() {
      return order;
    },
  };
}
