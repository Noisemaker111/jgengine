export interface GaitTuning {
  /** Stride cycles per world unit travelled — ties step cadence to actual speed. */
  stridesPerUnit: number;
  bobAmplitude: number;
  swayAmplitude: number;
  /** Speed at which bob/sway reach full intensity. */
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

/** Vertical hop per footfall — two peaks per stride cycle. */
export function gaitBobOffset(
  phase: number,
  speedUnitsPerSec: number,
  tuning: GaitTuning = DEFAULT_GAIT_TUNING,
): number {
  return Math.abs(Math.sin(phase)) * tuning.bobAmplitude * gaitIntensity(speedUnitsPerSec, tuning);
}

/** Signed side-to-side lean alternating with each footfall. */
export function gaitSwayAngle(
  phase: number,
  speedUnitsPerSec: number,
  tuning: GaitTuning = DEFAULT_GAIT_TUNING,
): number {
  return Math.sin(phase) * tuning.swayAmplitude * gaitIntensity(speedUnitsPerSec, tuning);
}
