/**
 * Suspension kinematics as a car effect: roll-centre heights split each axle's lateral load transfer into the part
 * the links carry (through the roll centre, at once) and the part the springs carry (by each axle's share of roll
 * stiffness), body roll acts about the roll axis instead of the ground, and the wheels lean with the body by each
 * axle's camber gain. Numbers come from a linkage solve (`scripts/reference/physics/suspensionKinematics.ts`).
 */
export interface VehicleSuspensionKinematicsEffect {
  /**
   * Multiplier on the effect: `0` off (lateral transfer split by `lateralLoadTransfer.frontShare`, roll about the
   * ground, wheels lean by `camber.rollFollow`), `1` the linkage as solved (default), past `1` higher roll centres
   * (capped below the centre of mass) and more camber gain; sane over `0..4`.
   */
  strength?: number;
  /** Front and rear roll-centre height above the ground, m (default `0.12`, `0.09`: the reference MX-5's linkages). */
  rollCentreFront?: number;
  rollCentreRear?: number;
  /** Front axle's share of the car's roll stiffness, springs and bar together (default `0.54`). */
  rollStiffnessFront?: number;
  /** Share of body roll each axle's wheels lean with, from its camber gain (default `0.67` front, `0.9` rear; `1` a beam axle). */
  rollFollowFront?: number;
  rollFollowRear?: number;
}

/** What {@link suspensionKinematics} works out for one lateral acceleration. */
export interface SuspensionKinematicsLoads {
  /** Load moved to the outside wheel of each axle, N. */
  transferFront: number;
  transferRear: number;
  /** Lever from the roll axis to the centre of mass, m: body roll is `m·ay·arm / rollStiffness`. */
  rollArm: number;
  rollFollowFront: number;
  rollFollowRear: number;
}

/**
 * Lateral load transfer, roll lever and camber gain for one lateral acceleration `ay` (m/s², either sign), blended
 * from the simple split by `strength`.
 * @capability vehicle-suspension-kinematics roll centres, roll-stiffness distribution and camber gain splitting a car's lateral load transfer
 */
export function suspensionKinematics(
  effect: VehicleSuspensionKinematicsEffect,
  car: { massKg: number; comHeight: number; frontWeight: number; trackWidth: number },
  ay: number,
  simple: { frontShare: number; rollFollow: number },
  strength: number,
): SuspensionKinematicsLoads {
  const h = Math.max(0.05, car.comHeight);
  const track = Math.max(0.3, car.trackWidth);
  const front = Math.min(1, Math.max(0, car.frontWeight));
  const lift = Math.max(1, strength);
  const blend = Math.min(1, Math.max(0, strength));
  const cap = 0.9 * h;
  const rcF = Math.min(cap, Math.max(-cap, (effect.rollCentreFront ?? 0.12) * lift)) * blend;
  const rcR = Math.min(cap, Math.max(-cap, (effect.rollCentreRear ?? 0.09) * lift)) * blend;
  const axis = rcF + (rcR - rcF) * (1 - front);
  const arm = h - axis;
  const share = simple.frontShare + ((effect.rollStiffnessFront ?? 0.54) - simple.frontShare) * blend;
  const total = (car.massKg * Math.abs(ay)) / track;
  const follow = (kinematic: number) => Math.min(1, Math.max(-1, simple.rollFollow + (1 + lift * (kinematic - 1) - simple.rollFollow) * blend));
  return {
    transferFront: total * (front * rcF + share * arm),
    transferRear: total * ((1 - front) * rcR + (1 - share) * arm),
    rollArm: arm,
    rollFollowFront: follow(effect.rollFollowFront ?? 0.67),
    rollFollowRear: follow(effect.rollFollowRear ?? 0.9),
  };
}
