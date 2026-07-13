import { type AccumulatorMeter, createAccumulatorMeter } from "../stats/accumulatorMeter";

export interface StaggerMeterConfig {
  max: number;
  decayPerSecond?: number;
  decayDelayMs?: number;
}

export interface StaggerMeter {
  add(amount: number): boolean;
  broke(): boolean;
  value(): number;
  fraction(): number;
  recover(): void;
  tick(dtSeconds: number): void;
}

/**
 * Build a stagger/poise gauge from landed hits toward a break threshold that staggers the target.
 *
 * @capability stagger-meter build toward a stagger/poise-break threshold from landed hits
 */
export function createStaggerMeter(config: StaggerMeterConfig): StaggerMeter {
  const meter: AccumulatorMeter = createAccumulatorMeter({
    max: config.max,
    mode: "hold",
    decayPerSecond: config.decayPerSecond ?? 0,
    decayDelayMs: config.decayDelayMs ?? 0,
  });

  return {
    add(amount) {
      return meter.add(amount).fired;
    },
    broke() {
      return meter.broke();
    },
    value() {
      return meter.value();
    },
    fraction() {
      return meter.fraction();
    },
    recover() {
      meter.reset();
    },
    tick(dtSeconds) {
      meter.tick(dtSeconds);
    },
  };
}

export interface BuildupMeterConfig {
  status: string;
  max: number;
  durationMs: number;
  decayPerSecond?: number;
  decayDelayMs?: number;
}

export interface BuildupProc {
  status: string;
  durationMs: number;
}

export interface BuildupMeter {
  add(amount: number): BuildupProc | null;
  value(): number;
  fraction(): number;
  tick(dtSeconds: number): void;
}

/**
 * Accumulate an ailment buildup — bleed, freeze, poison — that procs a status once it fills, then decays.
 *
 * @capability stagger-meter accumulate an ailment buildup (bleed, freeze) until it procs
 */
export function createBuildupMeter(config: BuildupMeterConfig): BuildupMeter {
  const meter: AccumulatorMeter = createAccumulatorMeter({
    max: config.max,
    mode: "reset",
    decayPerSecond: config.decayPerSecond ?? 0,
    decayDelayMs: config.decayDelayMs ?? 0,
  });

  return {
    add(amount) {
      return meter.add(amount).fired ? { status: config.status, durationMs: config.durationMs } : null;
    },
    value() {
      return meter.value();
    },
    fraction() {
      return meter.fraction();
    },
    tick(dtSeconds) {
      meter.tick(dtSeconds);
    },
  };
}
