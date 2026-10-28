import { HUMAN_SEGMENT, planarHumanSegments, type PlanarHumanGeometry } from "./anthropometry";
import { flatGround, footContactForce, groundHeight, SHOE_ON_CONCRETE, type ContactParameters, type ContactPointState, type GroundProfile } from "./footContact";
import { maxJointTorque, YOUNG_MALE_STRENGTH, type HumanJointStrength, type LegJoint } from "./jointStrength";
import { createPlanarMultibody, type PlanarMultibody } from "./planarMultibody";

/** A leg of the sagittal human. */
export type HumanSide = "right" | "left";

/** Joint torques commanded for one step, N·m, in the joint conventions of {@link HumanJointStrength}. */
export interface HumanJointTorques {
  rightHip: number;
  rightKnee: number;
  rightAnkle: number;
  leftHip: number;
  leftKnee: number;
  leftAnkle: number;
}

/** Options for {@link createHumanBody}. */
export interface HumanBodyOptions {
  mass?: number;
  stature?: number;
  strength?: HumanJointStrength;
  contact?: ContactParameters;
  ground?: GroundProfile;
  /** Gravity, m/s² (default 9.81). */
  gravity?: number;
  /** Resting metabolic rate, W/kg (default 1.16: about 1750 kcal/day for a 73 kg man). */
  basalMetabolism?: number;
  /** Fixed integration step, s (default 1/4000). */
  dt?: number;
}

/** Serializable state of a {@link HumanBody}. */
export interface HumanBodyState {
  time: number;
  q: number[];
  u: number[];
  anchors: ([number, number] | null)[];
  positiveWork: number;
  negativeWork: number;
}

/** Ground force on each foot after the last step, world N. */
export interface FootForces {
  right: [number, number];
  left: [number, number];
}

/** The sagittal human body: a seven-segment multibody on compliant foot contact, driven by torque-limited joints. */
export interface HumanBody {
  readonly geometry: PlanarHumanGeometry;
  readonly model: PlanarMultibody;
  readonly strength: HumanJointStrength;
  readonly dt: number;
  readonly gravity: number;
  ground: GroundProfile;
  readonly q: Float64Array;
  readonly u: Float64Array;
  time: number;
  /** Ground forces from the last step. */
  readonly feet: FootForces;
  /** Muscle (actuator) work done so far, J: concentric positive, eccentric negative (as a positive number). */
  positiveWork: number;
  negativeWork: number;
  /** Resting metabolic rate, W/kg. */
  readonly basalMetabolism: number;
  /** Relative joint angle and rate. */
  joint(side: HumanSide, joint: LegJoint): { angle: number; rate: number };
  /** Whole-body centre of mass `[x, y, vx, vy]`. */
  centerOfMass(): Float64Array;
  /** World position of a foot's heel, toe or ankle. */
  footPoint(side: HumanSide, which: "heel" | "toe" | "ankle", out?: Float64Array): Float64Array;
  /** Advance one step with the commanded torques (clamped to strength); returns the applied torques. */
  step(torques: HumanJointTorques): HumanJointTorques;
  /**
   * Advance one step with joint torques applied as given: for muscle-driven control, where the muscles' own
   * force–length–velocity limits and energetics replace the torque generators.
   */
  stepMuscles(torques: HumanJointTorques): void;
  /** Stand still at `x`, feet flat on the ground, with joint angles from `pose` (default straight). */
  reset(x?: number, pose?: Partial<Record<`${HumanSide}${"Hip" | "Knee" | "Ankle"}`, number>> & { trunk?: number }, velocity?: number): void;
  snapshot(): HumanBodyState;
  restore(state: HumanBodyState): void;
}

const S = HUMAN_SEGMENT;
const SEG: Record<HumanSide, { thigh: number; shank: number; foot: number }> = {
  right: { thigh: S.rightThigh, shank: S.rightShank, foot: S.rightFoot },
  left: { thigh: S.leftThigh, shank: S.leftShank, foot: S.leftFoot },
};

/** Passive range-of-motion stops (rad) of the hip, knee and ankle, as stiff joint end-stops. */
const RANGE: Record<LegJoint, [number, number]> = { hip: [-0.6, 2.2], knee: [-2.5, 0], ankle: [-0.8, 0.45] };
const LEG_JOINTS: readonly LegJoint[] = ["hip", "knee", "ankle"];
const TORQUE_KEYS: readonly (keyof HumanJointTorques)[] = ["rightHip", "rightKnee", "rightAnkle", "leftHip", "leftKnee", "leftAnkle"];

/**
 * Creates the sagittal reference human (Winter's seven-segment gait model with de Leva anthropometry), stepping its
 * exact multibody dynamics with semi-implicit Euler at a fixed step. Commanded torques are clamped to the
 * torque-angle-velocity strength of each joint; passive end-stops hold the range of motion.
 * @capability human-reference-body sagittal multibody human with published anthropometry, torque-limited joints and compliant foot contact
 */
export function createHumanBody(options: HumanBodyOptions = {}): HumanBody {
  const geometry = planarHumanSegments(options.mass, options.stature);
  const model = createPlanarMultibody(geometry.segments);
  const strength = options.strength ?? YOUNG_MALE_STRENGTH;
  const contact = options.contact ?? SHOE_ON_CONCRETE;
  const gravity = options.gravity ?? 9.81;
  const basalMetabolism = options.basalMetabolism ?? 1.16;
  const dt = options.dt ?? 1 / 4000;
  const massStature = geometry.mass * geometry.stature;
  const q = new Float64Array(model.dofs);
  const u = new Float64Array(model.dofs);
  const Q = new Float64Array(model.dofs);
  const acc = new Float64Array(model.dofs);
  const com = new Float64Array(4);
  const p = new Float64Array(2);
  const v = new Float64Array(2);
  const f = new Float64Array(2);
  const contacts: ContactPointState[] = [{ anchor: null }, { anchor: null }, { anchor: null }, { anchor: null }];
  const feet: FootForces = { right: [0, 0], left: [0, 0] };
  let rawTorques = false;
  const applied: HumanJointTorques = { rightHip: 0, rightKnee: 0, rightAnkle: 0, leftHip: 0, leftKnee: 0, leftAnkle: 0 };

  const angleOf = (segment: number) => q[2 + segment] ?? 0;
  const rateOf = (segment: number) => u[2 + segment] ?? 0;
  const proximal = (side: HumanSide, joint: LegJoint): [number, number] => {
    const s = SEG[side];
    return joint === "hip" ? [s.thigh, S.hat] : joint === "knee" ? [s.shank, s.thigh] : [s.foot, s.shank];
  };

  const body: HumanBody = {
    geometry,
    model,
    strength,
    dt,
    gravity,
    ground: options.ground ?? flatGround(),
    q,
    u,
    time: 0,
    feet,
    positiveWork: 0,
    negativeWork: 0,
    basalMetabolism,
    joint(side, joint) {
      const [child, parent] = proximal(side, joint);
      return { angle: angleOf(child) - angleOf(parent), rate: rateOf(child) - rateOf(parent) };
    },
    centerOfMass() {
      return model.centerOfMass(q, u, com);
    },
    footPoint(side, which, out = new Float64Array(2)) {
      const local = which === "heel" ? geometry.heel : which === "toe" ? geometry.toe : ([0, 0] as const);
      return model.point(q, SEG[side].foot, local, out);
    },
    stepMuscles(torques) {
      rawTorques = true;
      body.step(torques);
      rawTorques = false;
    },
    step(torques) {
      Q.fill(0);
      for (let side = 0; side < 2; side++) {
        const force = side === 0 ? feet.right : feet.left;
        force[0] = 0;
        force[1] = 0;
        const foot = side === 0 ? S.rightFoot : S.leftFoot;
        for (let k = 0; k < 2; k++) {
          const local = k === 0 ? geometry.heel : geometry.toe;
          const state = contacts[2 * side + k];
          if (state === undefined) continue;
          model.point(q, foot, local, p);
          // Cheap reject: far above the ground.
          if ((p[1] ?? 0) > groundHeight(body.ground, p[0] ?? 0) + 0.05) {
            state.anchor = null;
            continue;
          }
          model.pointVelocity(q, u, foot, local, v);
          footContactForce(body.ground, contact, p, v, state, f);
          if (f[0] === 0 && f[1] === 0) continue;
          model.addPointForce(q, foot, p, f, Q);
          force[0] += f[0] ?? 0;
          force[1] += f[1] ?? 0;
        }
        const thigh = side === 0 ? S.rightThigh : S.leftThigh;
        for (let j = 0; j < 3; j++) {
          const child = thigh + j;
          const parent = j === 0 ? S.hat : child - 1;
          const joint = LEG_JOINTS[j] ?? "hip";
          const key = TORQUE_KEYS[3 * side + j] ?? "rightHip";
          const angle = (q[2 + child] ?? 0) - (q[2 + parent] ?? 0);
          const rate = (u[2 + child] ?? 0) - (u[2 + parent] ?? 0);
          const wanted = torques[key];
          let torque = wanted;
          if (!rawTorques) {
            const capacity = wanted === 0 ? 0 : maxJointTorque(strength, joint, Math.sign(wanted), angle, rate, massStature);
            torque = Math.sign(wanted) * Math.min(Math.abs(wanted), capacity);
          }
          applied[key] = torque;
          const power = torque * rate * dt;
          if (power > 0) body.positiveWork += power;
          else body.negativeWork -= power;
          const range = RANGE[joint];
          let passive = 0;
          if (angle < range[0]) passive = 2000 * (range[0] - angle) - 40 * Math.min(0, rate);
          else if (angle > range[1]) passive = -2000 * (angle - range[1]) - 40 * Math.max(0, rate);
          model.addJointTorque(child, torque + passive, Q);
        }
      }
      model.accelerations(q, u, Q, gravity, acc);
      for (let k = 0; k < model.dofs; k++) {
        u[k] = (u[k] ?? 0) + (acc[k] ?? 0) * dt;
        q[k] = (q[k] ?? 0) + (u[k] ?? 0) * dt;
      }
      body.time += dt;
      return applied;
    },
    reset(x = 0, pose = {}, velocity = 0) {
      q.fill(0);
      u.fill(0);
      for (const c of contacts) c.anchor = null;
      const trunk = pose.trunk ?? 0;
      q[2 + S.hat] = trunk;
      for (const side of ["right", "left"] as const) {
        const cap = side === "right" ? "right" : "left";
        const hip = pose[`${cap}Hip`] ?? 0;
        const knee = pose[`${cap}Knee`] ?? 0;
        const ankle = pose[`${cap}Ankle`] ?? 0;
        const s = SEG[side];
        q[2 + s.thigh] = trunk + hip;
        q[2 + s.shank] = trunk + hip + knee;
        q[2 + s.foot] = trunk + hip + knee + ankle;
      }
      // Place the lowest sole point on the ground at a light preload.
      let lowest = Number.POSITIVE_INFINITY;
      for (const side of ["right", "left"] as const) {
        for (const which of ["heel", "toe"] as const) {
          const point = body.footPoint(side, which, p);
          lowest = Math.min(lowest, (point[1] ?? 0) - groundHeight(body.ground, point[0] ?? 0));
        }
      }
      q[0] = x;
      q[1] = -lowest - 0.004;
      for (let k = 0; k < model.dofs; k++) u[k] = 0;
      u[0] = velocity;
      body.time = 0;
      body.positiveWork = 0;
      body.negativeWork = 0;
    },
    snapshot() {
      return {
        time: body.time,
        q: Array.from(q),
        u: Array.from(u),
        anchors: contacts.map((c) => (c.anchor === null ? null : [c.anchor[0], c.anchor[1]])),
        positiveWork: body.positiveWork,
        negativeWork: body.negativeWork,
      };
    },
    restore(state) {
      q.set(state.q);
      u.set(state.u);
      state.anchors.forEach((anchor, i) => {
        const c = contacts[i];
        if (c !== undefined) c.anchor = anchor === null ? null : [anchor[0], anchor[1]];
      });
      body.time = state.time;
      body.positiveWork = state.positiveWork;
      body.negativeWork = state.negativeWork;
    },
  };
  body.reset();
  return body;
}
