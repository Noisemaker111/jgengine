import {
  createAccumulatorMeter,
  type AccumulatorMeter,
  type MeterMode,
  type MeterTier,
} from "./accumulatorMeter";

export interface EventMeterConfig {
  max: number;
  mode?: MeterMode;
  decayPerSecond?: number;
  decayDelayMs?: number;
  tiers?: readonly MeterTier[];
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

export interface EventMeter {
  value(): number;
  fraction(): number;
  tier(): string | null;
  ready(): boolean;
  feed(tag: string, scale?: number): EventMeterFeedResult;
  consume(): boolean;
  drain(amount: number): void;
  reset(): void;
  tick(dtSeconds: number): void;
}

function readyOf(meter: AccumulatorMeter, mode: MeterMode): boolean {
  return mode === "hold" ? meter.broke() : meter.value() >= 0 && meter.fraction() >= 1;
}

/**
 * A heat/hype gauge that rises as tagged events land and cools between them, firing when it fills or breaks — the streak/overdrive meter shooters and fighters hand-roll.
 *
 * @capability event-meter a heat/streak gauge that builds from repeated hits and cools down over time
 */
export function createEventMeter(config: EventMeterConfig): EventMeter {
  const mode = config.mode ?? "hold";
  const resets = new Set(config.resets ?? []);
  const meter = createAccumulatorMeter({
    max: config.max,
    mode,
    decayPerSecond: config.decayPerSecond,
    decayDelayMs: config.decayDelayMs,
    tiers: config.tiers,
  });

  return {
    value() {
      return meter.value();
    },
    fraction() {
      return meter.fraction();
    },
    tier() {
      return meter.tier();
    },
    ready() {
      return readyOf(meter, mode);
    },
    feed(tag, scale = 1) {
      const tierBefore = meter.tier();
      if (resets.has(tag)) {
        meter.reset();
        return {
          tag,
          reset: true,
          amount: 0,
          value: meter.value(),
          fraction: meter.fraction(),
          fired: false,
          ready: readyOf(meter, mode),
          overflow: 0,
          tier: meter.tier(),
          tierChanged: meter.tier() !== tierBefore,
        };
      }
      const amount = (config.gains[tag] ?? 0) * scale;
      const result = meter.add(amount);
      return {
        tag,
        reset: false,
        amount,
        value: result.value,
        fraction: meter.fraction(),
        fired: result.fired,
        ready: readyOf(meter, mode),
        overflow: result.overflow,
        tier: result.tier,
        tierChanged: result.tierChanged,
      };
    },
    consume() {
      if (!readyOf(meter, mode)) return false;
      meter.reset();
      return true;
    },
    drain(amount) {
      meter.drain(amount);
    },
    reset() {
      meter.reset();
    },
    tick(dtSeconds) {
      meter.tick(dtSeconds);
    },
  };
}
