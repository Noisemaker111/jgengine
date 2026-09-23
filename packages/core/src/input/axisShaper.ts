import type { AxisBinding, AxisRange } from "./axisInput";

/**
 * How one axis responds to one kind of source. Keys want ramps (a held key should feel like a pedal
 * being pressed, not a switch); sticks want deadzone and curve but no lag.
 */
export interface AxisShapeProfile {
  /** Inner deadzone `0..1`; the remaining travel is rescaled so output still starts at 0 (default `0`). */
  deadzone?: number;
  /** Raw magnitude at which output reaches full scale, `0..1` (default `1`). */
  saturation?: number;
  /** Response exponent applied after the deadzone: `1` linear, `>1` finer near centre (default `1`). */
  curve?: number;
  /** Units/s the output may move away from zero (default `Infinity`: no ramp). */
  riseRate?: number;
  /** Units/s the output may move back toward zero while the input keeps its sign (default `riseRate`). */
  fallRate?: number;
  /** Units/s the output moves when the input is released or reversed — self-centring (default `fallRate`). */
  returnRate?: number;
}

/** Shaping for one named axis. */
export interface AxisShapeConfig {
  /** Profile for keys and buttons (default: pass through). */
  digital?: AxisShapeProfile;
  /** Profile for sticks, triggers and other continuous sources (default: pass through). */
  analog?: AxisShapeProfile;
  /** Output range (default `[-1, 1]`; use `{ min: 0, max: 1 }` for pedals). */
  range?: AxisRange;
  /**
   * Multiplier from a caller-supplied signal, applied to the target before ramping — speed-sensitive
   * steering (`speed => 1 / (1 + speed / 30)`), weapon-sway-by-stamina, and similar. Default `1`.
   */
  scale?: (signal: number) => number;
}

/** Config for {@link createAxisShaper}: one entry per axis. */
export interface AxisShaperConfig<TAxes extends string> {
  axes: Record<TAxes, AxisShapeConfig>;
}

/** Per-sample options for {@link AxisShaper.shape}. */
export interface AxisShapeSample<TAxes extends string> {
  /** Axes whose raw value came from an analog source this frame; unlisted axes use the digital profile. */
  analog?: Partial<Record<TAxes, boolean>> | ReadonlySet<TAxes>;
  /** Signal passed to each axis's `scale` callback (speed, stamina, zoom). */
  signal?: number;
}

/** Shaped axis output, one number per axis. */
export type AxisValues<TAxes extends string> = Record<TAxes, number>;

/** Stateful per-axis response shaping between raw input and a sim. */
export interface AxisShaper<TAxes extends string> {
  /** Shape one frame of raw axis values (as returned by `ctx.input.axis`) and return the shaped output. */
  shape(dt: number, raw: Readonly<Record<TAxes, number>>, sample?: AxisShapeSample<TAxes>): AxisValues<TAxes>;
  /** The last shaped output. */
  value(): Readonly<AxisValues<TAxes>>;
  /** Replace the shaping config (settings screen, per-vehicle feel) without resetting the current output. */
  retune(next: AxisShaperConfig<TAxes>): void;
  snapshot(): AxisValues<TAxes>;
  restore(state: Readonly<AxisValues<TAxes>>): void;
  /** Zero every axis. */
  reset(): void;
}

const FULL_RANGE: AxisRange = { min: -1, max: 1 };

function clampTo(value: number, range: AxisRange): number {
  return value < range.min ? range.min : value > range.max ? range.max : value;
}

/** Deadzone, saturation and curve applied to one raw value; sign is preserved. */
export function shapeAxisValue(raw: number, profile: AxisShapeProfile | undefined): number {
  if (profile === undefined) return raw;
  const deadzone = Math.min(0.99, Math.max(0, profile.deadzone ?? 0));
  const saturation = Math.max(deadzone + 0.01, Math.min(1, profile.saturation ?? 1));
  const magnitude = Math.abs(raw);
  if (magnitude <= deadzone) return 0;
  const normalized = Math.min(1, (magnitude - deadzone) / (saturation - deadzone));
  const curved = normalized ** Math.max(0.1, profile.curve ?? 1);
  return Math.sign(raw) * curved;
}

function rateFor(current: number, target: number, profile: AxisShapeProfile | undefined): number {
  const rise = profile?.riseRate ?? Number.POSITIVE_INFINITY;
  const fall = profile?.fallRate ?? rise;
  const back = profile?.returnRate ?? fall;
  if (target === 0 || (current !== 0 && Math.sign(target) !== Math.sign(current))) return back;
  return Math.abs(target) >= Math.abs(current) ? rise : fall;
}

function isAnalog<TAxes extends string>(axis: TAxes, analog: AxisShapeSample<TAxes>["analog"]): boolean {
  if (analog === undefined) return false;
  if (analog instanceof Set) return analog.has(axis);
  return (analog as Partial<Record<TAxes, boolean>>)[axis] === true;
}

/**
 * Creates an {@link AxisShaper}: deadzone, curve and ramp rates per axis, chosen per frame by whether the
 * source was a key or a stick. It sits between `ctx.input.axis(...)` and any sim (a vehicle, an aircraft,
 * aim), so a held key eases in and self-centres while a stick stays direct. Deterministic and serializable.
 * @capability axis-shaping shape raw input per axis — deadzone, response curve, keyboard ramp, self-centring, speed-sensitive scaling
 */
export function createAxisShaper<TAxes extends string>(initial: AxisShaperConfig<TAxes>): AxisShaper<TAxes> {
  let config = initial;
  const names = Object.keys(config.axes) as TAxes[];
  const current = {} as AxisValues<TAxes>;
  for (const name of names) current[name] = 0;

  return {
    shape(dt, raw, sample) {
      const step = Math.max(0, dt);
      for (const name of Object.keys(config.axes) as TAxes[]) {
        const axis = config.axes[name];
        const range = axis.range ?? FULL_RANGE;
        const profile = isAnalog(name, sample?.analog) ? axis.analog : axis.digital;
        const scale = axis.scale === undefined ? 1 : axis.scale(sample?.signal ?? 0);
        const target = clampTo(shapeAxisValue(raw[name] ?? 0, profile) * scale, range);
        const from = current[name] ?? 0;
        const rate = rateFor(from, target, profile);
        let next: number;
        if (!Number.isFinite(rate)) next = target;
        else if (target !== 0 && from !== 0 && Math.sign(target) !== Math.sign(from)) {
          // A reversal returns to centre at the return rate, then builds the other way at the rise rate.
          const toZero = Math.min(Math.abs(from), rate * step);
          const left = step - toZero / Math.max(rate, 1e-9);
          next = Math.abs(from) > toZero ? from - Math.sign(from) * toZero : Math.sign(target) * Math.min(Math.abs(target), (profile?.riseRate ?? Number.POSITIVE_INFINITY) * left);
        } else {
          const delta = target - from;
          const move = rate * step;
          next = Math.abs(delta) <= move ? target : from + Math.sign(delta) * move;
        }
        current[name] = clampTo(next, range);
      }
      return current;
    },
    value: () => current,
    retune(next) {
      config = next;
      for (const name of Object.keys(next.axes) as TAxes[]) current[name] ??= 0;
    },
    snapshot: () => ({ ...current }),
    restore(state) {
      Object.assign(current, state);
    },
    reset() {
      for (const name of Object.keys(current) as TAxes[]) current[name] = 0;
    },
  };
}

/**
 * Which axes an analog source is driving this frame: an axis counts as analog when any action bound to it
 * has a published analog magnitude (`ctx.input.analog()`). Feed the result to {@link AxisShaper.shape}.
 */
export function analogAxes<TAxes extends string>(
  bindings: Readonly<Record<TAxes, AxisBinding>>,
  analog: Readonly<Record<string, number>> | null,
): Set<TAxes> {
  const out = new Set<TAxes>();
  if (analog === null) return out;
  for (const name of Object.keys(bindings) as TAxes[]) {
    const binding = bindings[name];
    const codes = binding.negative === undefined ? binding.positive : [...binding.positive, ...binding.negative];
    if (codes.some((code) => analog[code] !== undefined)) out.add(name);
  }
  return out;
}
