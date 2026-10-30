import {
  changeMeter,
  createMeter,
  createStatPool,
  statPoolFraction,
  tickMeter,
  type MeterRates,
  type MeterState,
} from "../stats/statPool";

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

function decayRates(config: { decayPerSecond?: number; decayDelayMs?: number }): MeterRates {
  return {
    decay: Math.max(0, config.decayPerSecond ?? 0),
    decayDelay: Math.max(0, config.decayDelayMs ?? 0) / 1000,
  };
}

/**
 * Build a stagger/poise gauge from landed hits toward a break threshold that staggers the target.
 *
 * @capability stagger-meter build toward a stagger/poise-break threshold from landed hits
 */
export function createStaggerMeter(config: StaggerMeterConfig): StaggerMeter {
  const rates = decayRates(config);
  let meter: MeterState = createMeter({ current: 0, max: config.max, min: 0 });
  let broken = false;

  return {
    add(amount) {
      const change = changeMeter(meter, amount);
      meter = change.meter;
      const fired = amount > 0 && change.change.hitMax && !broken;
      if (fired) broken = true;
      return fired;
    },
    broke() {
      return broken;
    },
    value() {
      return meter.pool.current;
    },
    fraction() {
      return statPoolFraction(meter.pool);
    },
    recover() {
      meter = createMeter({ current: 0, max: config.max, min: 0 });
      broken = false;
    },
    tick(dtSeconds) {
      // A broken gauge holds its value; the timers still advance so decay resumes from its delay.
      meter = tickMeter(meter, broken ? {} : rates, dtSeconds).meter;
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
  const rates = decayRates(config);
  let meter: MeterState = createMeter({ current: 0, max: config.max, min: 0 });

  return {
    add(amount) {
      const change = changeMeter(meter, amount);
      meter = change.meter;
      if (!(amount > 0 && change.change.hitMax)) return null;
      // The proc consumes the fill; whatever did not fit starts the next buildup.
      meter = {
        sinceDrop: meter.sinceDrop,
        sinceFill: meter.sinceFill,
        pool: createStatPool({ current: change.change.overflow, max: meter.pool.max, min: meter.pool.min }),
      };
      return { status: config.status, durationMs: config.durationMs };
    },
    value() {
      return meter.pool.current;
    },
    fraction() {
      return statPoolFraction(meter.pool);
    },
    tick(dtSeconds) {
      meter = tickMeter(meter, rates, dtSeconds).meter;
    },
  };
}
