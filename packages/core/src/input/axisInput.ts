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
 * a gamepad axis via `setAnalog`. `sample(dt, isDown)` folds the current held-key state into the
 * smoothed value; a `setAnalog` override replaces the digital target for that axis until cleared.
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

  sample(dt: number, isDown: (code: string) => boolean): AxisInput {
    for (const axis of Object.keys(this.bindings) as AxisName[]) {
      const range = AXIS_RANGE[axis];
      const override = this.overrides[axis];
      const target =
        override !== undefined ? override : clampAxis(digitalTarget(this.bindings[axis], isDown), range);
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
