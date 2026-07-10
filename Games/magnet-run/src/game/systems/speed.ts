export interface SpeedTuning {
  base: number;
  accel: number;
  max: number;
  boostMultiplier: number;
  brakeMultiplier: number;
}

export function rampSpeed(elapsedSinceRespawn: number, tuning: SpeedTuning): number {
  const ramped = tuning.base + tuning.accel * Math.max(0, elapsedSinceRespawn);
  return Math.min(tuning.max, ramped);
}

export function applyFeather(baseSpeed: number, tuning: SpeedTuning, boosting: boolean, braking: boolean): number {
  if (boosting && !braking) return baseSpeed * tuning.boostMultiplier;
  if (braking && !boosting) return baseSpeed * tuning.brakeMultiplier;
  return baseSpeed;
}
