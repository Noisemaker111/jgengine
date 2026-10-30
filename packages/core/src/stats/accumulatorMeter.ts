// @skill jgengine-combat
import { tierAt } from "../threshold/thresholds";
import { changeStatPool, createStatPool, type StatPool } from "./statPool";

export interface MeterTier {
  id: string;
  at: number;
}

export type MeterMode = "hold" | "reset";

export interface AccumulatorMeterConfig {
  max: number;
  mode?: MeterMode;
  decayPerSecond?: number | undefined;
  decayDelayMs?: number | undefined;
  tiers?: readonly MeterTier[] | undefined;
}

export interface MeterAddResult {
  value: number;
  fired: boolean;
  overflow: number;
  tier: string | null;
  tierChanged: boolean;
}

/** Mutable meter value, hold latch, and time since the last gain. */
export interface AccumulatorMeterState {
  value: number;
  broken: boolean;
  idleMs: number;
}

export interface AccumulatorMeter {
  /** Detached state for persistence and deterministic continuation. */
  state(): AccumulatorMeterState;
  /** Restore using the caller's existing configuration. */
  restore(next: AccumulatorMeterState): void;
  value(): number;
  fraction(): number;
  tier(): string | null;
  broke(): boolean;
  add(amount: number): MeterAddResult;
  drain(amount: number): void;
  reset(): void;
  tick(dtSeconds: number): void;
}

function sortedTiers(tiers: readonly MeterTier[] | undefined): readonly MeterTier[] {
  if (tiers === undefined) return [];
  return [...tiers].sort((a, b) => a.at - b.at);
}

function tierIdAt(value: number, tiers: readonly MeterTier[]): string | null {
  return tierAt(tiers, value)?.id ?? null;
}

/**
 * A raw accumulating gauge that crosses named tier thresholds as a value builds, with optional decay — the primitive under charge, rage, and combo meters.
 *
 * @capability charge-meter fill a gauge toward named tier thresholds as a value accumulates
 */
export function createAccumulatorMeter(config: AccumulatorMeterConfig): AccumulatorMeter {
  const mode = config.mode ?? "hold";
  const tiers = sortedTiers(config.tiers);
  const decayPerSecond = config.decayPerSecond ?? 0;
  const decayDelayMs = config.decayDelayMs ?? 0;

  let pool: StatPool = createStatPool({ current: 0, max: config.max, min: 0 });
  let broken = false;
  let idleMs = 0;

  return {
    state: () => ({ value: pool.current, broken, idleMs }),
    restore(next) {
      pool = createStatPool({ current: next.value, max: config.max, min: 0 });
      broken = next.broken;
      idleMs = Math.max(0, next.idleMs);
    },
    value() {
      return pool.current;
    },
    fraction() {
      return config.max <= 0 ? 0 : pool.current / config.max;
    },
    tier() {
      return tierIdAt(pool.current, tiers);
    },
    broke() {
      return broken;
    },
    add(amount) {
      idleMs = 0;
      const tierBefore = tierIdAt(pool.current, tiers);
      const change = changeStatPool(pool, amount);
      // A positive add reached the cap exactly when the pool comes to rest at max;
      // what did not fit is the amount to carry in reset mode.
      const atCap = amount > 0 && change.hitMax;
      const fired = atCap && !(mode === "hold" && broken);
      if (mode === "reset" && fired) {
        pool = createStatPool({ current: change.overflow, max: config.max, min: 0 });
      } else {
        pool = change.pool;
        if (fired && mode === "hold") broken = true;
      }
      const tierAfter = tierIdAt(pool.current, tiers);
      return {
        value: pool.current,
        fired,
        overflow: fired && mode === "reset" ? change.overflow : 0,
        tier: tierAfter,
        tierChanged: tierAfter !== tierBefore,
      };
    },
    drain(amount) {
      pool = changeStatPool(pool, -amount).pool;
      if (pool.current <= 0) broken = false;
    },
    reset() {
      pool = createStatPool({ current: 0, max: config.max, min: 0 });
      broken = false;
      idleMs = 0;
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0) return;
      idleMs += dtSeconds * 1000;
      if (broken || decayPerSecond <= 0 || idleMs < decayDelayMs) return;
      pool = changeStatPool(pool, -decayPerSecond * dtSeconds).pool;
    },
  };
}
