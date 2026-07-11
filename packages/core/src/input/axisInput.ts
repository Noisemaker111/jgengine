import { pointerAxisValue, type PointerAxisBinding, type PointerAxisState } from "./pointerAxis";

export interface AxisInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: number;
}

export const NEUTRAL_AXIS: AxisInput = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

export type AxisName = keyof AxisInput;

export interface AxisBinding {
  positive: readonly string[];
  negative?: readonly string[];
  /** Pointer-position source for this axis (#293) — takes over from the key lists whenever a pointer is active. */
  pointer?: PointerAxisBinding;
}

export type AxisBindingMap = Record<AxisName, AxisBinding>;

export interface AxisChannelConfig {
  bindings: AxisBindingMap;
  smoothing?: number;
}

export interface AxisRange {
  min: number;
  max: number;
}

export const AXIS_RANGE: Record<AxisName, AxisRange> = {
  throttle: { min: 0, max: 1 },
  brake: { min: 0, max: 1 },
  steer: { min: -1, max: 1 },
  handbrake: { min: 0, max: 1 },
};

export function clampAxis(value: number, range: AxisRange): number {
  return value < range.min ? range.min : value > range.max ? range.max : value;
}

export function rampToward(current: number, target: number, rate: number, dt: number): number {
  if (!Number.isFinite(rate)) return target;
  const delta = target - current;
  const step = rate * dt;
  if (Math.abs(delta) <= step) return target;
  return current + Math.sign(delta) * step;
}

function digitalTarget(binding: AxisBinding, isDown: (code: string) => boolean): number {
  const positive = binding.positive.some(isDown) ? 1 : 0;
  const negative = binding.negative !== undefined && binding.negative.some(isDown) ? 1 : 0;
  return positive - negative;
}

/**
 * Analog control channel — distinct from the digital action bindings. Throttle/brake/steer/handbrake
 * are continuous values ramped from held keys (a keyboard feels like a pedal) or driven directly from
 * a gamepad axis via `setAnalog`. `sample(dt, isDown, pointer?)` folds the current held-key state into
 * the smoothed value; a binding's `pointer` source takes over from its keys while a pointer is active,
 * and a `setAnalog` override replaces both for that axis until cleared.
 */
export class AxisChannel {
  private readonly bindings: AxisBindingMap;
  private readonly smoothing: number;
  private readonly current: AxisInput = { ...NEUTRAL_AXIS };
  private readonly overrides: Partial<Record<AxisName, number>> = {};

  constructor(config: AxisChannelConfig) {
    this.bindings = config.bindings;
    this.smoothing = config.smoothing ?? 6;
  }

  setAnalog(axis: AxisName, value: number): void {
    this.overrides[axis] = clampAxis(value, AXIS_RANGE[axis]);
  }

  clearAnalog(axis: AxisName): void {
    delete this.overrides[axis];
  }

  reset(): void {
    this.current.throttle = 0;
    this.current.brake = 0;
    this.current.steer = 0;
    this.current.handbrake = 0;
  }

  get value(): AxisInput {
    return this.current;
  }

  sample(dt: number, isDown: (code: string) => boolean, pointer?: PointerAxisState | null): AxisInput {
    for (const axis of Object.keys(this.bindings) as AxisName[]) {
      const range = AXIS_RANGE[axis];
      const override = this.overrides[axis];
      const binding = this.bindings[axis];
      const fromPointer = binding.pointer === undefined ? null : pointerAxisValue(binding.pointer, pointer);
      const target =
        override !== undefined
          ? override
          : clampAxis(fromPointer ?? digitalTarget(binding, isDown), range);
      this.current[axis] = clampAxis(rampToward(this.current[axis], target, this.smoothing, dt), range);
    }
    return this.current;
  }
}

export const DRIVE_AXIS_BINDINGS: AxisBindingMap = {
  throttle: { positive: ["KeyW", "ArrowUp"] },
  brake: { positive: ["KeyS", "ArrowDown"] },
  steer: { positive: ["KeyD", "ArrowRight"], negative: ["KeyA", "ArrowLeft"] },
  handbrake: { positive: ["Space"] },
};

export interface GenericAxisConfig<TAxes extends string> {
  bindings: Record<TAxes, AxisBinding>;
  /** Per-axis value range; unlisted axes default to bipolar `[-1, 1]` (use `{ min: 0, max: 1 }` for pedals). */
  ranges?: Partial<Record<TAxes, AxisRange>>;
  smoothing?: number;
}

/**
 * The held-key-ramping analog channel for any axis schema (#282.7) — drones (pitch/roll/strafe),
 * boats, mechs — not just the four car axes `AxisChannel` hardcodes. Same semantics: keys ramp,
 * `setAnalog` overrides, a binding's `pointer` source takes over while a pointer is active.
 */
export interface GenericAxisChannel<TAxes extends string> {
  sample(dt: number, isDown: (code: string) => boolean, pointer?: PointerAxisState | null): Record<TAxes, number>;
  setAnalog(axis: TAxes, value: number): void;
  clearAnalog(axis: TAxes): void;
  reset(): void;
  readonly value: Record<TAxes, number>;
}

const BIPOLAR_RANGE: AxisRange = { min: -1, max: 1 };

export function createAxisChannel<TAxes extends string>(config: GenericAxisConfig<TAxes>): GenericAxisChannel<TAxes> {
  const axes = Object.keys(config.bindings) as TAxes[];
  const smoothing = config.smoothing ?? 6;
  const current = Object.fromEntries(axes.map((axis) => [axis, 0])) as Record<TAxes, number>;
  const overrides: Partial<Record<TAxes, number>> = {};

  function rangeOf(axis: TAxes): AxisRange {
    return config.ranges?.[axis] ?? BIPOLAR_RANGE;
  }

  return {
    value: current,
    setAnalog(axis, value) {
      overrides[axis] = clampAxis(value, rangeOf(axis));
    },
    clearAnalog(axis) {
      delete overrides[axis];
    },
    reset() {
      for (const axis of axes) current[axis] = 0;
    },
    sample(dt, isDown, pointer) {
      for (const axis of axes) {
        const range = rangeOf(axis);
        const override = overrides[axis];
        const binding = config.bindings[axis];
        const fromPointer = binding.pointer === undefined ? null : pointerAxisValue(binding.pointer, pointer);
        const target =
          override !== undefined ? override : clampAxis(fromPointer ?? digitalTarget(binding, isDown), range);
        current[axis] = clampAxis(rampToward(current[axis], target, smoothing, dt), range);
      }
      return current;
    },
  };
}
