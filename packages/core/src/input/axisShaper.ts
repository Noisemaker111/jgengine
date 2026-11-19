import { clamp } from "../math/scalar";
import type { AxisBinding, AxisRange } from "./axisInput";

export interface AxisShapeProfile {
  /** Inner deadzone `0..1`; the remaining travel is rescaled so output still starts at 0 (default `0`). */
  deadzone?: number;
  /** Raw magnitude at which output reaches full scale, `0..1` (default `1`). */
  saturation?: number;
  /** Response exponent applied after the deadzone: `1` linear, `>1` finer near centre (default `1`). */
  curve?: number;
  riseRate?: number;
  fallRate?: number;
  returnRate?: number;
}

export interface AxisShapeConfig {
  /** Profile for keys and buttons (default: pass through). */
  digital?: AxisShapeProfile;
  /** Profile for sticks, triggers and other continuous sources (default: pass through). */
  analog?: AxisShapeProfile;
  /** Output range (default `[-1, 1]`; use `{ min: 0, max: 1 }` for pedals). */
  range?: AxisRange;
  scale?: (signal: number) => number;
}

export interface AxisShaperConfig<TAxes extends string> {
  axes: Record<TAxes, AxisShapeConfig>;
}

export interface AxisShapeSample<TAxes extends string> {
  analog?: Partial<Record<TAxes, boolean>> | ReadonlySet<TAxes>;
  signal?: number;
}

export type AxisValues<TAxes extends string> = Record<TAxes, number>;

export interface AxisShaper<TAxes extends string> {
  shape(dt: number, raw: Readonly<Record<TAxes, number>>, sample?: AxisShapeSample<TAxes>): AxisValues<TAxes>;
  value(): Readonly<AxisValues<TAxes>>;
  retune(next: AxisShaperConfig<TAxes>): void;
  snapshot(): AxisValues<TAxes>;
  restore(state: Readonly<AxisValues<TAxes>>): void;
  reset(): void;
}

const FULL_RANGE: AxisRange = { min: -1, max: 1 };

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
        const target = clamp(shapeAxisValue(raw[name] ?? 0, profile) * scale, range.min, range.max);
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
        current[name] = clamp(next, range.min, range.max);
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
