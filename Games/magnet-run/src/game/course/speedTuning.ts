import type { SpeedTuning } from "../systems/speed";

export const speedTuningPerSector: readonly SpeedTuning[] = [
  { base: 9, accel: 0.16, max: 15, boostMultiplier: 1.22, brakeMultiplier: 0.68 },
  { base: 10, accel: 0.18, max: 16.5, boostMultiplier: 1.22, brakeMultiplier: 0.68 },
  { base: 11, accel: 0.2, max: 18, boostMultiplier: 1.22, brakeMultiplier: 0.68 },
];
