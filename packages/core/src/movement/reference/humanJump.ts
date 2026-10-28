import { createHumanBody, type HumanBodyOptions, type HumanJointTorques } from "./humanBody";
import { maxJointTorque, type LegJoint } from "./jointStrength";

/**
 * A vertical jump by torque generators, as in the jump simulations of D. Selbie and G. Caldwell (*J. Biomech.* 29,
 * 1996) and M. A. King and M. R. Yeadon (*J. Appl. Biomech.* 18, 2002). The joints first servo, within their strength,
 * from quiet stance down toward a squat (the countermovement); then each joint's drive ramps to full extension at its
 * own onset. Torque at every instant is limited by the joint's torque–angle–velocity strength, so jump height comes
 * from strength, not a set takeoff speed.
 */
export interface JumpParameters {
  /** Squat the countermovement aims for: hip flexion, knee angle (negative flexed), ankle dorsiflexion, rad. */
  squat: { hip: number; knee: number; ankle: number };
  /** Stiffness and damping of the countermovement servo, per body mass × stature (N·m/rad, N·m·s/rad per kg·m). */
  sinkStiffness: number;
  sinkDamping: number;
  /** Start of the push, s after leaving quiet stance. */
  sink: number;
  /** Onset of each joint's ramp to full extension, s after the push starts. */
  onset: Record<LegJoint, number>;
  /** Time the drive takes to rise to full, s. */
  rise: number;
  /** Flight pose the joints servo to after takeoff, legs reaching for the ground: hip, knee and ankle, rad. */
  reach: Record<LegJoint, number>;
}

/** Fitted by CMA-ES maximising the reference human's jump height with the trunk within 0.25 rad of upright at takeoff and the push force under 3 body weights. */
export const COUNTERMOVEMENT_JUMP: JumpParameters = {
  squat: { hip: 1.966, knee: -1.365, ankle: 0.45 },
  sinkStiffness: 1.366,
  sinkDamping: 0.3903,
  sink: 0.8582,
  onset: { hip: 0.02678, knee: 0.2293, ankle: 0.2591 },
  rise: 0.05978,
  reach: { hip: 0.3, knee: -0.3, ankle: 0 },
};

/** Result of {@link simulateJump}. */
export interface JumpReport {
  /** Rise of the centre of mass above standing at the apex, m. */
  height: number;
  /** Takeoff to touchdown, s. */
  airTime: number;
  /** Vertical centre-of-mass speed at takeoff, m/s. */
  takeoffSpeed: number;
  /** Depth of the countermovement below standing, m. */
  countermovement: number;
  /** Highest vertical ground force during the push (10 ms average), body weights. */
  pushPeak: number;
  /** Trunk world angle at takeoff, rad (positive leans back). */
  takeoffTrunk: number;
  /** Vertical centre-of-mass speed at touchdown, downward positive, m/s: what a landing has to absorb. */
  landingSpeed: number;
}

const JOINTS: readonly LegJoint[] = ["hip", "knee", "ankle"];

/** A 10 ms moving average, the low-pass a force plate's analysis applies, so a single contact-spring spike is not a peak. */
function forcePlateFilter(dt: number): (value: number) => number {
  const window = new Float64Array(Math.max(1, Math.round(0.01 / dt)));
  let index = 0;
  let sum = 0;
  return (value) => {
    sum += value - (window[index] ?? 0);
    window[index] = value;
    index = (index + 1) % window.length;
    return sum / window.length;
  };
}
/** Direction of extension in each joint's own convention. */
const EXTEND: Record<LegJoint, number> = { hip: -1, knee: 1, ankle: -1 };

/**
 * Jump the reference human (both legs together) from quiet stance with a countermovement, to touchdown. A long `sink`
 * with no motion at its end is a squat jump.
 * @capability human-jump torque-driven countermovement jump of the reference human: height, airtime, push force, touchdown speed
 */
export function simulateJump(params: JumpParameters = COUNTERMOVEMENT_JUMP, options: HumanBodyOptions = {}): JumpReport {
  const body = createHumanBody({ mass: 80, stature: 1.8, ...options });
  body.reset(0);
  const standing = body.centerOfMass()[1] ?? 0;
  const massStature = body.geometry.mass * body.geometry.stature;
  const weight = body.geometry.mass * body.gravity;
  const torques: HumanJointTorques = { rightHip: 0, rightKnee: 0, rightAnkle: 0, leftHip: 0, leftKnee: 0, leftAnkle: 0 };
  const vertical = () => (body.feet.right[1] ?? 0) + (body.feet.left[1] ?? 0);
  const filtered = forcePlateFilter(body.dt);
  const rise = Math.max(0.02, params.rise);
  const squat: Record<LegJoint, number> = params.squat;
  const setTorque = (side: "right" | "left", joint: LegJoint, value: number) => {
    if (joint === "hip") torques[side === "right" ? "rightHip" : "leftHip"] = value;
    else if (joint === "knee") torques[side === "right" ? "rightKnee" : "leftKnee"] = value;
    else torques[side === "right" ? "rightAnkle" : "leftAnkle"] = value;
  };

  let lowest = standing;
  let pushPeak = 0;
  let takeoff = Number.NaN;
  let takeoffSpeed = 0;
  let takeoffTrunk = 0;
  const failed = (): JumpReport => ({ height: 0, airTime: 0, takeoffSpeed: 0, countermovement: standing - lowest, pushPeak, takeoffTrunk, landingSpeed: 0 });
  while (body.time < 1.5) {
    for (const side of ["right", "left"] as const) {
      for (const joint of JOINTS) {
        const state = body.joint(side, joint);
        const sign = EXTEND[joint];
        const ramp = Math.min(1, Math.max(0, (body.time - params.sink - params.onset[joint]) / rise));
        const hold = massStature * (params.sinkStiffness * (squat[joint] - state.angle) - params.sinkDamping * state.rate);
        const full = sign * maxJointTorque(body.strength, joint, sign, state.angle, state.rate, massStature);
        setTorque(side, joint, (1 - ramp) * hold + ramp * full);
      }
    }
    body.step(torques);
    const com = body.centerOfMass();
    lowest = Math.min(lowest, com[1] ?? 0);
    pushPeak = Math.max(pushPeak, filtered(vertical()) / weight);
    if ((com[1] ?? 0) < 0.5 * standing) return failed();
    if (body.time > params.sink && vertical() < 1 && (com[3] ?? 0) > 0) {
      takeoff = body.time;
      takeoffSpeed = com[3] ?? 0;
      takeoffTrunk = body.q[2] ?? 0;
      break;
    }
  }
  if (Number.isNaN(takeoff)) return failed();

  // Flight: each joint servos to the reach pose within its strength, until a foot touches down.
  const reach = params.reach;
  let apex = standing;
  let touchdown = Number.NaN;
  let landingSpeed = 0;
  while (body.time < takeoff + 2) {
    for (const side of ["right", "left"] as const) {
      for (const joint of JOINTS) {
        const state = body.joint(side, joint);
        setTorque(side, joint, massStature * (4 * (reach[joint] - state.angle) - 0.4 * state.rate));
      }
    }
    body.step(torques);
    const com = body.centerOfMass();
    apex = Math.max(apex, com[1] ?? 0);
    if (vertical() > 1 && (com[3] ?? 0) < 0) {
      touchdown = body.time;
      landingSpeed = -(com[3] ?? 0);
      break;
    }
  }
  return {
    height: apex - standing,
    airTime: Number.isNaN(touchdown) ? Number.POSITIVE_INFINITY : touchdown - takeoff,
    takeoffSpeed,
    countermovement: standing - lowest,
    pushPeak,
    takeoffTrunk,
    landingSpeed,
  };
}
