import { OUTER_BAND_METERS } from "./catalog";

export const EXPOSURE_MAX = 100;
export const EXPOSURE_RISE_BASE = 16;
export const EXPOSURE_DECAY_RATE = 26;

export function exposureRatePerSecond(lead: number): number {
  if (lead >= OUTER_BAND_METERS) return -EXPOSURE_DECAY_RATE;
  const depth = Math.max(0, OUTER_BAND_METERS - lead) / OUTER_BAND_METERS;
  return EXPOSURE_RISE_BASE * (1 + depth);
}

export function advanceExposure(current: number, lead: number, dt: number): number {
  const next = current + exposureRatePerSecond(lead) * dt;
  return Math.max(0, Math.min(EXPOSURE_MAX, next));
}
