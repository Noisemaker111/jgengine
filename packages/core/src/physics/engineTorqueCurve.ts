import type { VehicleGearboxTuning } from "./vehicleDynamics";
import { sampleGripCurve } from "./gripCurve";

/**
 * The engine as a published torque curve: full-throttle crank torque by rpm, closed-throttle friction that rises with
 * rpm, part throttle between the two, and shifts that open the clutch for their whole duration. Runs on a `gearbox`
 * powertrain; without it the powertrain's own normalised curve, constant engine braking and part-drive shifts apply.
 */
export interface VehicleTorqueCurveEffect {
  /**
   * Multiplier on the effect: `0` off (the powertrain's own normalised curve, constant engine braking and part-drive
   * shifts), up to `1` blending into the published curve, friction and shift time (default), past `1` deeper dips off
   * the peak, more friction and longer shifts; sane over `0..4`.
   */
  strength?: number;
  /** Full-throttle crank torque, `[rpm, N·m]` points in rising rpm (default the powertrain's curve × `peakTorque`). */
  curve?: readonly (readonly [number, number])[];
  /** Closed-throttle friction torque at redline, N·m (default 18% of peak torque); falls linearly to a third of it at 0 rpm. */
  friction?: number;
  /** Seconds the clutch is open per shift, no drive at all (default the powertrain's `shiftSeconds`). */
  shiftSeconds?: number;
  /** Multiplier on the whole full-throttle curve: an engine tune or a detuned fleet car (default `1`). */
  scale?: number;
}

function tableAt(curve: readonly (readonly [number, number])[], rpm: number): number {
  const first = curve[0];
  if (first === undefined) return 0;
  if (rpm <= first[0]) return first[1];
  for (let i = 1; i < curve.length; i += 1) {
    const hi = curve[i];
    const lo = curve[i - 1];
    if (hi === undefined || lo === undefined) break;
    if (rpm <= hi[0]) return lo[1] + ((hi[1] - lo[1]) * (rpm - lo[0])) / Math.max(1e-9, hi[0] - lo[0]);
  }
  return curve[curve.length - 1]?.[1] ?? 0;
}

/** Peak of the effect's full-throttle curve, N·m. */
function torqueCurvePeak(effect: VehicleTorqueCurveEffect, powertrain: VehicleGearboxTuning): number {
  const curve = effect.curve;
  if (curve === undefined) return powertrain.peakTorque;
  let peak = 0;
  for (const [, torque] of curve) peak = Math.max(peak, torque);
  return peak;
}

/**
 * Crank torque at `rpm` and pedal `pedal` (`0..1`), N·m: `pedal·T(rpm) − (1 − pedal)·friction(rpm)`, with the curve's
 * dips and the friction scaled by `strength`.
 * @capability engine-torque-curve an engine's published torque curve, rpm-rising friction and part throttle, with a strength dial from flat torque up
 */
export function engineTorque(effect: VehicleTorqueCurveEffect, powertrain: VehicleGearboxTuning, rpm: number, pedal: number, strength: number): number {
  const peak = torqueCurvePeak(effect, powertrain);
  const full =
    effect.curve === undefined
      ? powertrain.peakTorque * sampleGripCurve(powertrain.torqueCurve, (rpm - powertrain.idleRpm) / Math.max(1, powertrain.redlineRpm - powertrain.idleRpm))
      : tableAt(effect.curve, rpm);
  const scale = Math.max(0, effect.scale ?? 1);
  const shaped = (strength === 1 ? full : Math.max(0.05 * peak, peak - strength * (peak - full))) * scale;
  const friction = (effect.friction ?? 0.18 * peak) * strength * (1 / 3 + ((2 / 3) * Math.max(0, rpm)) / Math.max(1, powertrain.redlineRpm));
  return pedal * shaped - (1 - pedal) * friction;
}

/**
 * Seconds a shift keeps the clutch open at `strength`.
 * @internal
 */
export function torqueCurveShiftSeconds(effect: VehicleTorqueCurveEffect, powertrain: VehicleGearboxTuning, strength: number): number {
  return (effect.shiftSeconds ?? powertrain.shiftSeconds) * strength;
}
