import { applyStatRate, type StatRateModifier } from "../progression/statGraph";
import { changeStatPool, createStatPool, statPoolFraction, type StatPool } from "./statPool";

/** A per-second change one vital applies to another while a condition holds. */
export interface VitalLink {
  /** The vital that changes. */
  vital: string;
  /** Units per second; negative drains (starving takes health), positive fills. */
  rate: number;
}

/** A named condition a vital raises from its value, with optional hysteresis. */
export interface VitalFlag {
  /** Flag id the game reads (`unconscious`, `exhausted`, `starving`). */
  id: string;
  /** Raise the flag when the value is `atLeast` or `atMost` the `on` level. */
  when: "atLeast" | "atMost";
  /** Level as a fraction of the vital's max (0..1). */
  on: number;
  /** Clear level as a fraction of max; defaults to `on` (no hysteresis). A knocked-out body stays down until torpor falls to `off`. */
  off?: number;
}

/** One survival vital: its range, how it moves on its own, what it costs and what it does when empty. */
export interface VitalDef {
  id: string;
  max: number;
  /** Floor; default 0. */
  min?: number;
  /** Starting value; default `max`. Torpor starts at 0. */
  start?: number;
  /**
   * Passive change per second at multiplier 1: negative drains (food, water, torpor wearing off),
   * positive regenerates (stamina, health).
   */
  rate?: number;
  /** Seconds after a {@link Vitals.spend} or a drop through {@link Vitals.change} before a positive rate resumes. */
  regenDelay?: number;
  /** Regenerating this vital draws other vitals: `perPoint` of `vital` per point regained (health regen eats food). Regen stops while a payer is empty. */
  regenCost?: readonly { vital: string; perPoint: number }[];
  /** While this vital sits at its floor, these links apply every second (no food: health drains, torpor rises). */
  whenEmpty?: readonly VitalLink[];
  /** Conditions this vital raises. */
  flags?: readonly VitalFlag[];
}

/**
 * A change to one vital: all at once, or spread evenly over `seconds`. With `upTo` it stops at that value
 * (a ceiling for a gain, a floor for a loss), so a small shield potion fills only to 50 and a big one to 100.
 * A meal, a potion, a narcotic, a tranquilizer dart and a hit are all doses; what a source gives each
 * kind of receiver is a {@link DoseTable}'s job.
 */
export interface VitalDose {
  vital: string;
  /** Units added; negative takes away. Over `seconds`, the amount still to land. */
  amount: number;
  /** Seconds to spread it over; absent or 0 lands it now. Over time, the seconds still to go. */
  seconds?: number;
  /** Stop at this value: no higher for a gain, no lower for a loss. */
  upTo?: number;
  /** What gave it (an item id, an attack), for reading back what is still working. */
  source?: string;
}

/** Plain, JSON-safe vitals state: current values, current maxes (levelled), regen cooldowns, raised flags and doses still landing. */
export interface VitalsState {
  values: Record<string, number>;
  maxes: Record<string, number>;
  cooldowns: Record<string, number>;
  flags: string[];
  doses: VitalDose[];
}

/** Per-tick rate scaling: one scalar for every vital, or per vital id (a cold body burns food twice as fast). */
export type VitalRateModifier = StatRateModifier;

/** Options for {@link Vitals.tick}. */
export interface VitalsTickOptions {
  /** Multiplies negative (drain) rates. */
  drain?: VitalRateModifier;
  /** Multiplies positive (regen) rates. */
  regen?: VitalRateModifier;
  /** Extra per-second changes this tick (sprinting spends stamina, a fire warms, a heat stroke hurts). */
  extra?: readonly VitalLink[];
}

/** A flag that changed this tick. */
export interface VitalFlagChange {
  id: string;
  raised: boolean;
}

/** One body's survival vitals over plain data; every write is bounded and every value retunable. */
export interface Vitals {
  value(id: string): number;
  max(id: string): number;
  fraction(id: string): number;
  /** Flags currently raised. */
  flags(): readonly string[];
  has(flag: string): boolean;
  /** Spend `amount` only when that much is available; returns false and changes nothing otherwise. Starts the regen delay. */
  spend(id: string, amount: number): boolean;
  /** Add `delta` (clamped); a negative delta starts the regen delay. Returns the applied amount. */
  change(id: string, delta: number): number;
  /** Take doses: each lands now or over its seconds, a loss starting the regen delay like {@link change}. */
  dose(...doses: readonly VitalDose[]): void;
  /** Doses still landing, with what is left of each. */
  doses(): readonly VitalDose[];
  /** Set a vital's max (a level-up point, a buff). `fill` raises current by the same amount. */
  setMax(id: string, max: number, fill?: boolean): void;
  /** Advance `dt` seconds; returns flags raised or cleared since the last tick (a change between ticks raises its flag at once, and is reported here). */
  tick(dt: number, options?: VitalsTickOptions): readonly VitalFlagChange[];
  /** Replace the definitions in play (rates, flags, links) keeping current values. */
  retune(defs: readonly VitalDef[]): void;
  state(): VitalsState;
  restore(state: VitalsState): void;
  /** Back to the definitions' starting values and maxes. */
  reset(): void;
}

/**
 * Survival vitals for one body — health, stamina, food, water, oxygen, torpor or anything the game
 * names. Each vital drains or regenerates per second, regen can wait out a delay and charge other
 * vitals (health regen eats food), an empty vital pushes on others (starving drains health), and
 * thresholds raise flags with hysteresis (torpor full knocks out until it wears off), and doses land
 * now or over time up to a cap (a narcotic's torpor over 16 seconds, a shield potion to 50). Not only
 * survival: a creature being tamed, a sim's needs and a shooter's shield are each one body of vitals.
 * Plain data, deterministic, bounded by the number of vitals and doses.
 *
 * @capability survival-vitals a body's linked meters — drain, delayed regen that costs other vitals, starvation links, knockout-style flags, and doses that land now or over time up to a cap
 */
export function createVitals(initial: readonly VitalDef[]): Vitals {
  let defs = [...initial];
  let byId = new Map(defs.map((def) => [def.id, def]));
  const pools = new Map<string, StatPool>();
  const cooldowns = new Map<string, number>();
  const raised = new Set<string>();
  let active: VitalDose[] = [];
  /** Flags a change between ticks raised or cleared, for the next tick to report. */
  let pending: VitalFlagChange[] = [];
  const settle = (): void => {
    pending.push(...refreshFlags());
  };

  const def = (id: string): VitalDef => {
    const found = byId.get(id);
    if (found === undefined) throw new Error(`unknown vital "${id}"`);
    return found;
  };
  const minOf = (id: string): number => def(id).min ?? 0;
  const freshPool = (entry: VitalDef): StatPool =>
    createStatPool({ current: entry.start ?? entry.max, max: entry.max, min: entry.min ?? 0 });
  const poolOf = (id: string): StatPool => {
    const existing = pools.get(id);
    if (existing !== undefined) return existing;
    const created = freshPool(def(id));
    pools.set(id, created);
    return created;
  };
  const maxOf = (id: string): number => poolOf(id).max;
  const valueOf = (id: string): number => poolOf(id).current;
  const write = (id: string, next: number): number => {
    const change = changeStatPool(poolOf(id), next - poolOf(id).current);
    pools.set(id, change.pool);
    return change.applied;
  };

  /** Add `delta` toward a dose's `upTo` (never past it, never backwards from beyond it); a loss starts the regen delay. */
  const land = (id: string, delta: number, upTo: number | undefined): number => {
    const current = valueOf(id);
    let next = current + delta;
    if (upTo !== undefined) next = delta >= 0 ? Math.min(next, Math.max(current, upTo)) : Math.max(next, Math.min(current, upTo));
    const applied = write(id, next);
    if (applied < 0 && def(id).regenDelay !== undefined) cooldowns.set(id, def(id).regenDelay ?? 0);
    return applied;
  };

  const tickDoses = (dt: number): void => {
    const still: VitalDose[] = [];
    for (const entry of active) {
      const seconds = entry.seconds ?? 0;
      const step = seconds <= dt ? entry.amount : entry.amount * (dt / seconds);
      if (byId.has(entry.vital)) land(entry.vital, step, entry.upTo);
      const left = seconds - dt;
      if (left > 1e-9 && Math.abs(entry.amount - step) > 1e-12) still.push({ ...entry, amount: entry.amount - step, seconds: left });
    }
    active = still;
  };

  const seed = (): void => {
    pools.clear();
    cooldowns.clear();
    raised.clear();
    active = [];
    pending = [];
    for (const entry of defs) pools.set(entry.id, freshPool(entry));
    refreshFlags();
  };

  function flagLevel(entry: VitalDef, flag: VitalFlag, on: boolean): boolean {
    const min = minOf(entry.id);
    const span = maxOf(entry.id) - min;
    const fraction = span > 0 ? (valueOf(entry.id) - min) / span : 0;
    const level = on ? (flag.off ?? flag.on) : flag.on;
    return flag.when === "atLeast" ? fraction >= level - 1e-9 : fraction <= level + 1e-9;
  }

  function refreshFlags(): VitalFlagChange[] {
    const changes: VitalFlagChange[] = [];
    for (const entry of defs) {
      for (const flag of entry.flags ?? []) {
        const on = raised.has(flag.id);
        const holds = flagLevel(entry, flag, on);
        if (holds && !on) {
          raised.add(flag.id);
          changes.push({ id: flag.id, raised: true });
        } else if (!holds && on) {
          raised.delete(flag.id);
          changes.push({ id: flag.id, raised: false });
        }
      }
    }
    return changes;
  }

  seed();

  return {
    value: valueOf,
    max: maxOf,
    fraction: (id) => statPoolFraction(poolOf(id)),
    flags: () => [...raised],
    has: (flag) => raised.has(flag),
    spend(id, amount) {
      if (!(amount > 0)) return true;
      if (valueOf(id) - minOf(id) < amount) return false;
      write(id, valueOf(id) - amount);
      cooldowns.set(id, def(id).regenDelay ?? 0);
      settle();
      return true;
    },
    change(id, delta) {
      const applied = land(id, delta, undefined);
      settle();
      return applied;
    },
    dose(...doses) {
      for (const entry of doses) {
        def(entry.vital);
        if ((entry.seconds ?? 0) > 0) active.push({ ...entry });
        else land(entry.vital, entry.amount, entry.upTo);
      }
      settle();
    },
    doses: () => active.map((entry) => ({ ...entry })),
    setMax(id, max, fill = false) {
      const before = maxOf(id);
      const current = valueOf(id);
      pools.set(id, { current, max: Math.max(minOf(id), max), min: poolOf(id).min });
      write(id, fill ? current + (max - before) : current);
      settle();
    },
    tick(dt, options = {}) {
      if (!(dt > 0)) return [];
      tickDoses(dt);
      for (const entry of defs) {
        const id = entry.id;
        const rate = entry.rate ?? 0;
        if (rate < 0) {
          write(id, valueOf(id) + applyStatRate(rate, options.drain, id) * dt);
        } else if (rate > 0) {
          const wait = cooldowns.get(id) ?? 0;
          if (wait > 0) {
            cooldowns.set(id, Math.max(0, wait - dt));
            continue;
          }
          let gain = Math.min(applyStatRate(rate, options.regen, id) * dt, maxOf(id) - valueOf(id));
          if (gain <= 0) continue;
          for (const cost of entry.regenCost ?? []) {
            const available = valueOf(cost.vital) - minOf(cost.vital);
            if (cost.perPoint > 0) gain = Math.min(gain, available / cost.perPoint);
          }
          if (gain <= 0) continue;
          for (const cost of entry.regenCost ?? []) write(cost.vital, valueOf(cost.vital) - gain * cost.perPoint);
          write(id, valueOf(id) + gain);
        }
      }
      for (const entry of defs) {
        if (entry.whenEmpty === undefined || valueOf(entry.id) > minOf(entry.id)) continue;
        for (const link of entry.whenEmpty) write(link.vital, valueOf(link.vital) + link.rate * dt);
      }
      for (const link of options.extra ?? []) {
        const applied = write(link.vital, valueOf(link.vital) + link.rate * dt);
        const wait = byId.get(link.vital)?.regenDelay;
        if (applied < 0 && wait !== undefined) cooldowns.set(link.vital, wait);
      }
      const changes = [...pending, ...refreshFlags()];
      pending = [];
      return changes;
    },
    retune(next) {
      defs = [...next];
      byId = new Map(defs.map((entry) => [entry.id, entry]));
      for (const entry of defs) {
        if (!pools.has(entry.id)) pools.set(entry.id, freshPool(entry));
      }
      refreshFlags();
    },
    state() {
      return {
        values: Object.fromEntries([...pools].map(([id, pool]) => [id, pool.current])),
        maxes: Object.fromEntries([...pools].map(([id, pool]) => [id, pool.max])),
        cooldowns: Object.fromEntries(cooldowns),
        flags: [...raised],
        doses: active.map((entry) => ({ ...entry })),
      };
    },
    restore(state) {
      seed();
      for (const [id, max] of Object.entries(state.maxes)) {
        if (byId.has(id) && Number.isFinite(max)) {
          const pool = poolOf(id);
          pools.set(id, { current: pool.current, max, min: pool.min });
        }
      }
      for (const [id, value] of Object.entries(state.values)) {
        if (byId.has(id) && Number.isFinite(value)) write(id, value);
      }
      for (const [id, wait] of Object.entries(state.cooldowns)) if (byId.has(id) && Number.isFinite(wait)) cooldowns.set(id, wait);
      raised.clear();
      for (const flag of state.flags) raised.add(flag);
      active = (state.doses ?? []).filter((entry) => byId.has(entry.vital) && Number.isFinite(entry.amount)).map((entry) => ({ ...entry }));
      refreshFlags();
    },
    reset: seed,
  };
}
