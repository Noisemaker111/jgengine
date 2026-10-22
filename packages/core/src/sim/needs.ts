import {
  decayMeters,
  initDecayMeters,
  type DecayMeterConfig,
  type DecayMeterValues,
} from "../survival/decayMeter";
import { clamp } from "../math/scalar";

/**
 * A decaying need is a survival decay meter (`max`/`min`/`start`/`rate`, optional moodle
 * thresholds) whose satisfaction an agent brain reads to score actions. The meter owns the
 * numbers; per-need appeal lives in the game's utility options.
 */
export type NeedDefinition = DecayMeterConfig;

/** One need's current satisfaction, worst-first ready: `fraction` is 0 (empty) … 1 (full). */
export interface NeedReading {
  id: string;
  value: number;
  fraction: number;
}

/** Serializable need state: values plus any in-play retuning, so a save keeps the dials. */
export interface NeedSnapshot {
  /** Satisfaction per need id; undeclared ids are ignored on restore. */
  values: Record<string, number>;
  /** Base rates after `setRate`; absent entries keep the definition's rate. */
  rates: Record<string, number>;
  /** Active per-need rate multipliers from `setRateModifier`. */
  modifiers: Record<string, number>;
}

/**
 * Named needs that drain or recover on game time — hunger, energy, hygiene, bladder, fun.
 * Reads are index-addressed (`indexOf` once, `fractionAt` per tick) so a thousand-agent loop
 * never re-resolves ids; the whole set round-trips through {@link NeedSnapshot}.
 */
export interface NeedSet {
  /** Drain every need by `rate * modifier * dt` in place. Call once per game tick. */
  tick(dt: number): void;
  /** Declared ids in definition order. */
  ids(): readonly string[];
  /** Stable index for a declared need, or `-1`. Resolve once, then use the `*At` readers. */
  indexOf(id: string): number;
  /** Raw value at `indexOf(id)` — no allocation, no lookup. */
  valueAt(index: number): number;
  /** 0..1 fill at `indexOf(id)` — what response curves sample. */
  fractionAt(index: number): number;
  value(id: string): number;
  fraction(id: string): number;
  /** Consumable/action refill; negative drains. Throws on an unknown id. */
  refill(id: string, amount: number): void;
  /** Overwrite one need's base rate (a harsher game mode). Throws on an unknown id. */
  setRate(id: string, rate: number): void;
  /** Multiply one need's drain until cleared with `1`; `null` sets every need at once. */
  setRateModifier(id: string | null, multiplier: number): void;
  /** Least-satisfied need by fraction, declared order breaking ties; `null` when none declared. */
  mostUrgent(): NeedReading | null;
  snapshot(): NeedSnapshot;
  restore(next: NeedSnapshot): void;
}

/**
 * Create the needs an agent or a park guest carries. Decay reuses the survival meter formulas
 * (`survival/decayMeter`), so moodle thresholds, clamping and rate modifiers behave exactly like
 * every other meter; this set adds index-addressed reads and single-need retuning for hot AI loops.
 * Score these needs into an action with `createUtilityBrain` (`@jgengine/core/world`).
 *
 * @capability needs decaying needs an agent reads by index to decide what it wants next
 */
export function createNeedSet(definitions: readonly NeedDefinition[]): NeedSet {
  const defs = definitions.map((definition) => ({ ...definition }));
  const index = new Map<string, number>();
  const ids: string[] = [];
  const spans = new Float64Array(defs.length);
  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i]!;
    index.set(def.id, i);
    ids.push(def.id);
    spans[i] = def.max - (def.min ?? 0);
  }

  let values: DecayMeterValues = initDecayMeters(defs);
  let modifiers: Record<string, number> = {};
  const lookup = (id: string): number => {
    const at = index.get(id);
    if (at === undefined) throw new Error(`unknown need "${id}"`);
    return at;
  };
  const readValue = (at: number): number => {
    const current = values[ids[at]!];
    return current === undefined ? defs[at]!.start ?? defs[at]!.max : current;
  };
  const readFraction = (at: number): number => {
    const span = spans[at]!;
    return span > 0 ? clamp((readValue(at) - (defs[at]!.min ?? 0)) / span, 0, 1) : 0;
  };

  return {
    tick(dt) {
      if (dt > 0) values = decayMeters(values, defs, dt, modifiers);
    },
    ids: () => ids,
    indexOf: (id) => index.get(id) ?? -1,
    valueAt: (at) => (at >= 0 && at < defs.length ? readValue(at) : 0),
    fractionAt: (at) => (at >= 0 && at < defs.length ? readFraction(at) : 0),
    value: (id) => readValue(lookup(id)),
    fraction: (id) => readFraction(lookup(id)),
    refill(id, amount) {
      const at = lookup(id);
      const def = defs[at]!;
      const min = def.min ?? 0;
      values = { ...values, [id]: clamp(readValue(at) + amount, min, def.max) };
    },
    setRate(id, rate) {
      defs[lookup(id)]!.rate = rate;
    },
    setRateModifier(id, multiplier) {
      if (id === null) {
        for (const needId of ids) modifiers[needId] = multiplier;
        return;
      }
      lookup(id);
      modifiers = { ...modifiers, [id]: multiplier };
    },
    mostUrgent() {
      let worst = -1;
      let worstFraction = Infinity;
      for (let at = 0; at < defs.length; at += 1) {
        const fraction = readFraction(at);
        if (fraction < worstFraction) {
          worst = at;
          worstFraction = fraction;
        }
      }
      if (worst < 0) return null;
      const id = ids[worst]!;
      return { id, value: readValue(worst), fraction: worstFraction };
    },
    snapshot() {
      const out: Record<string, number> = {};
      const rates: Record<string, number> = {};
      for (let at = 0; at < defs.length; at += 1) {
        const id = ids[at]!;
        out[id] = readValue(at);
        rates[id] = defs[at]!.rate;
      }
      return { values: out, rates, modifiers: { ...modifiers } };
    },
    restore(next) {
      const restored: DecayMeterValues = {};
      for (let at = 0; at < defs.length; at += 1) {
        const def = defs[at]!;
        const id = ids[at]!;
        const min = def.min ?? 0;
        const saved = next.values[id];
        restored[id] = saved === undefined || !Number.isFinite(saved) ? readValue(at) : clamp(saved, min, def.max);
        const rate = next.rates[id];
        if (rate !== undefined && Number.isFinite(rate)) def.rate = rate;
      }
      values = restored;
      modifiers = { ...next.modifiers };
    },
  };
}
