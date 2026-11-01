import { magicFormulaTrail, TNO_205_60R15_TIRE, type MagicFormulaTireCoefficients } from "./tireMagicFormula";

/**
 * Self-aligning torque through the steering: each front tyre's lateral force acts a pneumatic trail behind its
 * contact centre plus the caster trail, so the summed kingpin torque turns the road wheels against the steering
 * system's compliance toward the way the car is travelling. On a road car that is understeer and steering feel; in a
 * slide it steers the front into the slide (counter-steer), which is the effect a drift game dials up.
 */
export interface VehicleAligningTorqueEffect {
  /** Multiplier on the effect: `0` off (the wheels sit at the rack), `1` as the reference measures it (default), past `1` more self-steer into a slide; sane over `0..4`. */
  strength?: number;
  /** Road-wheel rad per N·m of summed kingpin torque (default `0.4°` per 100 N·m, a road car's rack and column). */
  compliance?: number;
  /** Caster trail at the ground, m (default `0.016`, the reference MX-5's front linkage). */
  casterTrail?: number;
  /** Tyre coefficients for the pneumatic trail (default the `magicFormula` effect's, else the TNO 205/60 R15). */
  tire?: Partial<MagicFormulaTireCoefficients>;
}

/** Steering-system compliance of a road car's rack and column, road-wheel rad per N·m. */
export const ROAD_CAR_STEERING_COMPLIANCE = (0.4 * Math.PI) / 180 / 100;

/**
 * Road-wheel steer, rad, the front axle's self-aligning torque produces: compliance × Σ(pneumatic + caster trail) ×
 * lateral force, with the axle's force `axleForce` shared between its wheels by their loads. Signed like the force,
 * so a caller adds it the way compliance steer moves the wheels away from the force.
 * @capability vehicle-aligning-torque the front tyres' self-aligning torque steering the road wheels through the steering compliance — understeer on the road, counter-steer in a slide
 */
export function aligningSteer(
  effect: VehicleAligningTorqueEffect,
  tire: Readonly<MagicFormulaTireCoefficients> | undefined,
  outerLoad: number,
  innerLoad: number,
  slip: number,
  axleForce: number,
  strength: number,
): number {
  const total = outerLoad + innerLoad;
  if (!(total > 0) || strength <= 0) return 0;
  const p = tire ?? { ...TNO_205_60R15_TIRE, ...effect.tire };
  const caster = effect.casterTrail ?? 0.016;
  const trailOuter = magicFormulaTrail(p, outerLoad, slip) + caster;
  const trailInner = magicFormulaTrail(p, innerLoad, slip) + caster;
  const moment = axleForce * ((trailOuter * outerLoad + trailInner * innerLoad) / total);
  return (effect.compliance ?? ROAD_CAR_STEERING_COMPLIANCE) * moment * strength;
}
