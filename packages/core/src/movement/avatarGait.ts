// @skill jgengine-world
export interface GaitTuning {
  stridesPerUnit: number;
  bobAmplitude: number;
  swayAmplitude: number;
  fullIntensitySpeed: number;
}

export const DEFAULT_GAIT_TUNING: GaitTuning = {
  stridesPerUnit: 0.95,
  bobAmplitude: 0.05,
  swayAmplitude: 0.035,
  fullIntensitySpeed: 4.5,
};

export function advanceGaitPhase(
  phase: number,
  speedUnitsPerSec: number,
  dtSec: number,
  tuning: GaitTuning = DEFAULT_GAIT_TUNING,
): number {
  return phase + speedUnitsPerSec * dtSec * tuning.stridesPerUnit * Math.PI * 2;
}

function gaitIntensity(speedUnitsPerSec: number, tuning: GaitTuning): number {
  return Math.min(1, Math.max(0, speedUnitsPerSec / tuning.fullIntensitySpeed));
}

export function gaitBobOffset(
  phase: number,
  speedUnitsPerSec: number,
  tuning: GaitTuning = DEFAULT_GAIT_TUNING,
): number {
  return Math.abs(Math.sin(phase)) * tuning.bobAmplitude * gaitIntensity(speedUnitsPerSec, tuning);
}

export function gaitSwayAngle(
  phase: number,
  speedUnitsPerSec: number,
  tuning: GaitTuning = DEFAULT_GAIT_TUNING,
): number {
  return Math.sin(phase) * tuning.swayAmplitude * gaitIntensity(speedUnitsPerSec, tuning);
}
