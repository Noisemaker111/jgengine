export interface IdleWindowConfig {
  maxSeconds?: number;
  efficiency?: number;
}

export interface IdleWindow {
  elapsedSeconds: number;
  effectiveSeconds: number;
  capped: boolean;
}

/** @internal */
export function idleWindow(lastSeenMs: number, nowMs: number, config: IdleWindowConfig = {}): IdleWindow {
  const elapsedSeconds = Math.max(0, (nowMs - lastSeenMs) / 1000);
  const capped = config.maxSeconds !== undefined && elapsedSeconds > config.maxSeconds;
  const boundedSeconds = Math.min(elapsedSeconds, config.maxSeconds ?? Number.POSITIVE_INFINITY);
  const efficiency = Math.max(0, config.efficiency ?? 1);
  return {
    elapsedSeconds,
    effectiveSeconds: boundedSeconds * efficiency,
    capped,
  };
}

export interface LinearCatchUpInput {
  current: number;
  ratePerSecond: number;
  min?: number;
  max?: number;
}

/** @internal */
export function linearCatchUp(seconds: number, input: LinearCatchUpInput): number {
  const clampedSeconds = Math.max(0, seconds);
  const value = input.current + input.ratePerSecond * clampedSeconds;
  return Math.min(input.max ?? Number.POSITIVE_INFINITY, Math.max(input.min ?? Number.NEGATIVE_INFINITY, value));
}

export interface ExponentialCatchUpInput {
  current: number;
  factorPerSecond: number;
  min?: number;
  max?: number;
}

/** @internal */
export function exponentialCatchUp(seconds: number, input: ExponentialCatchUpInput): number {
  const clampedSeconds = Math.max(0, seconds);
  const factor = Math.max(0, input.factorPerSecond);
  const value = input.current * factor ** clampedSeconds;
  return Math.min(input.max ?? Number.POSITIVE_INFINITY, Math.max(input.min ?? Number.NEGATIVE_INFINITY, value));
}

export interface SteppedCatchUpResult {
  steps: number;
  remainderSeconds: number;
}

/** @internal */
export function steppedCatchUp(
  seconds: number,
  stepSeconds: number,
  step: (index: number) => void,
  maxSteps?: number,
): SteppedCatchUpResult {
  if (stepSeconds <= 0 || seconds <= 0) {
    return { steps: 0, remainderSeconds: Math.max(0, seconds) };
  }
  const steps = Math.min(Math.floor(seconds / stepSeconds), maxSteps ?? Number.POSITIVE_INFINITY);
  for (let index = 0; index < steps; index++) step(index);
  return { steps, remainderSeconds: seconds - steps * stepSeconds };
}
