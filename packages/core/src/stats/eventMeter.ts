import { tierAt, type ThresholdBoundary } from "../threshold/thresholds";
import {
  changeMeter,
  createMeter,
  createStatPool,
  statPoolFraction,
  tickMeter,
  type MeterRates,
  type MeterState,
} from "./statPool";

/** What a full meter does with the next gain: hold the fill until consumed, or carry the excess into a fresh cycle. */
export type EventMeterMode = "hold" | "reset";

export interface EventMeterConfig {
  max: number;
  mode?: EventMeterMode;
  decayPerSecond?: number;
  decayDelayMs?: number;
  tiers?: readonly ThresholdBoundary[];
  gains: Record<string, number>;
  resets?: readonly string[];
}

export interface EventMeterFeedResult {
  tag: string;
  reset: boolean;
  amount: number;
  value: number;
  fraction: number;
  fired: boolean;
  ready: boolean;
  overflow: number;
  tier: string | null;
  tierChanged: boolean;
}

/** Event meter persistence: the meter's bounded value and timing, plus its `hold` latch. */
export interface EventMeterState {
  meter: MeterState;
  held: boolean;
}

export interface EventMeter {
  /** Detached value, hold latch, and decay-delay timers. */
  state(): EventMeterState;
  /** Restore using the caller's existing event and decay configuration. */
  restore(next: EventMeterState): void;
  value(): number;
  fraction(): number;
  tier(): string | null;
  ready(): boolean;
  feed(tag: string, scale?: number): EventMeterFeedResult;
  consume(): boolean;
  drain(amount: number): void;
  reset(): void;
  /** Advance decay and its delay; pass false to pause both while a source is visible. */
  tick(dtSeconds: number, decayEnabled?: boolean): void;
}

/**
 * A heat/hype gauge that rises as tagged events land and cools between them, firing when it fills or breaks — the streak/overdrive meter shooters and fighters hand-roll.
 *
 * @capability event-meter a heat/streak/alert gauge (wanted level, rage, combo) that builds from repeated events and cools down over time
 */
export function createEventMeter(config: EventMeterConfig): EventMeter {
  const mode = config.mode ?? "hold";
  const resets = new Set(config.resets ?? []);
  const tiers = config.tiers ?? [];
  const rates: MeterRates = {
    decay: config.decayPerSecond ?? 0,
    decayDelay: Math.max(0, config.decayDelayMs ?? 0) / 1000,
  };
  let meter = createMeter({ current: 0, max: config.max, min: 0 });
  let held = false;

  const tierId = (): string | null => tierAt(tiers, meter.pool.current)?.id ?? null;
  const ready = (): boolean =>
    mode === "hold" ? held : meter.pool.current >= 0 && statPoolFraction(meter.pool) >= 1;

  /** Fill by `amount`; report the fill and, in `reset` mode, carry what did not fit into the next cycle. */
  function add(amount: number): { value: number; fired: boolean; overflow: number; tierChanged: boolean } {
    const before = tierId();
    const change = changeMeter(meter, amount);
    meter = change.meter;
    const fired = amount > 0 && change.change.hitMax && !(mode === "hold" && held);
    let overflow = 0;
    if (fired && mode === "reset") {
      overflow = change.change.overflow;
      meter = {
        sinceDrop: meter.sinceDrop,
        sinceFill: meter.sinceFill,
        pool: createStatPool({ current: overflow, max: meter.pool.max, min: meter.pool.min }),
      };
    } else if (fired) {
      held = true;
    }
    return { value: meter.pool.current, fired, overflow, tierChanged: tierId() !== before };
  }

  function reset(): void {
    meter = createMeter({ current: 0, max: config.max, min: 0 });
    held = false;
  }

  return {
    state: () => ({
      meter: {
        pool: { ...meter.pool },
        sinceDrop: meter.sinceDrop,
        sinceFill: meter.sinceFill,
      },
      held,
    }),
    restore(next) {
      meter = {
        pool: createStatPool({ current: next.meter.pool.current, max: config.max, min: 0 }),
        sinceDrop: Math.max(0, next.meter.sinceDrop),
        sinceFill: Math.max(0, next.meter.sinceFill),
      };
      held = next.held;
    },
    value() {
      return meter.pool.current;
    },
    fraction() {
      return statPoolFraction(meter.pool);
    },
    tier: tierId,
    ready,
    feed(tag, scale = 1) {
      const tierBefore = tierId();
      if (resets.has(tag)) {
        reset();
        return {
          tag,
          reset: true,
          amount: 0,
          value: meter.pool.current,
          fraction: statPoolFraction(meter.pool),
          fired: false,
          ready: ready(),
          overflow: 0,
          tier: tierId(),
          tierChanged: tierId() !== tierBefore,
        };
      }
      const amount = (config.gains[tag] ?? 0) * scale;
      const result = add(amount);
      return {
        tag,
        reset: false,
        amount,
        value: result.value,
        fraction: statPoolFraction(meter.pool),
        fired: result.fired,
        ready: ready(),
        overflow: result.overflow,
        tier: tierId(),
        tierChanged: result.tierChanged,
      };
    },
    consume() {
      if (!ready()) return false;
      reset();
      return true;
    },
    drain(amount) {
      meter = changeMeter(meter, -amount).meter;
      if (meter.pool.current <= 0) held = false;
    },
    reset,
    tick(dtSeconds, decayEnabled = true) {
      if (!decayEnabled) return;
      // A held fill neither decays nor loses the clock; the timers still advance so decay resumes
      // from the configured delay once the value drops.
      meter = tickMeter(meter, held ? {} : rates, dtSeconds).meter;
    },
  };
}
