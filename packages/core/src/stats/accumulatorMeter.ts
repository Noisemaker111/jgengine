// @skill jgengine-combat
import { tierAt } from "../threshold/thresholds";

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

  let value = 0;
  let broken = false;
  let idleMs = 0;

  function clamp(next: number): number {
    return Math.max(0, Math.min(config.max, next));
  }

  return {
    state: () => ({ value, broken, idleMs }),
    restore(next) {
      value = clamp(next.value);
      broken = next.broken;
      idleMs = Math.max(0, next.idleMs);
    },
    value() {
      return value;
    },
    fraction() {
      return config.max <= 0 ? 0 : value / config.max;
    },
    tier() {
      return tierIdAt(value, tiers);
    },
    broke() {
      return broken;
    },
    add(amount) {
      idleMs = 0;
      const tierBefore = tierIdAt(value, tiers);
      const raw = value + amount;
      const fired = amount > 0 && raw >= config.max && !(mode === "hold" && broken);
      if (mode === "reset" && fired) {
        value = clamp(raw - config.max);
      } else {
        value = clamp(raw);
        if (fired && mode === "hold") broken = true;
      }
      const tierAfter = tierIdAt(value, tiers);
      return {
        value,
        fired,
        overflow: fired && mode === "reset" ? Math.max(0, raw - config.max) : 0,
        tier: tierAfter,
        tierChanged: tierAfter !== tierBefore,
      };
    },
    drain(amount) {
      value = clamp(value - amount);
      if (value <= 0) broken = false;
    },
    reset() {
      value = 0;
      broken = false;
      idleMs = 0;
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0) return;
      idleMs += dtSeconds * 1000;
      if (broken || decayPerSecond <= 0 || idleMs < decayDelayMs) return;
      value = clamp(value - decayPerSecond * dtSeconds);
    },
  };
}
