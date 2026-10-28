import type { HumanBody, HumanJointTorques, HumanSide } from "./humanBody";
import { momentArm, muscleLengthChange, muscleMetabolicPower, restingMuscle, stepMuscle, type MuscleSpec, type MuscleState } from "./muscleTendon";

const deg = Math.PI / 180;

/** The seven leg muscles of the Geyer & Herr model. */
export type LegMuscle = "SOL" | "TA" | "GAS" | "VAS" | "HAM" | "GLU" | "HFL";

/**
 * Muscle–tendon units of H. Geyer and H. Herr, "A muscle-reflex model that encodes principles of legged mechanics
 * produces human walking dynamics and muscle activities", *IEEE Trans. Neural Syst. Rehabil. Eng.* 18 (2010),
 * Tables II and III: soleus, tibialis anterior, gastrocnemius, vasti, hamstrings, glutei and hip flexors. Angles are
 * extension angles: hip and knee 180° straight, ankle 90° neutral and rising in plantarflexion.
 */
export const GEYER_HERR_MUSCLES: Record<LegMuscle, MuscleSpec> = {
  SOL: { name: "SOL", fmax: 4000, lopt: 0.04, lslack: 0.26, vmax: 6, spans: [{ joint: "ankle", direction: 1, r0: 0.05, phiMax: 110 * deg, phiRef: 80 * deg, rho: 0.5 }] },
  TA: { name: "TA", fmax: 800, lopt: 0.06, lslack: 0.24, vmax: 12, spans: [{ joint: "ankle", direction: -1, r0: 0.04, phiMax: 80 * deg, phiRef: 110 * deg, rho: 0.7 }] },
  GAS: {
    name: "GAS",
    fmax: 1500,
    lopt: 0.05,
    lslack: 0.4,
    vmax: 12,
    spans: [
      { joint: "ankle", direction: 1, r0: 0.05, phiMax: 110 * deg, phiRef: 80 * deg, rho: 0.7 },
      { joint: "knee", direction: -1, r0: 0.05, phiMax: 140 * deg, phiRef: 165 * deg, rho: 0.7 },
    ],
  },
  VAS: { name: "VAS", fmax: 6000, lopt: 0.08, lslack: 0.23, vmax: 12, spans: [{ joint: "knee", direction: 1, r0: 0.06, phiMax: 165 * deg, phiRef: 125 * deg, rho: 0.7 }] },
  HAM: {
    name: "HAM",
    fmax: 3000,
    lopt: 0.1,
    lslack: 0.31,
    vmax: 12,
    spans: [
      { joint: "knee", direction: -1, r0: 0.05, phiMax: 180 * deg, phiRef: 180 * deg, rho: 0.7 },
      { joint: "hip", direction: 1, r0: 0.08, phiMax: null, phiRef: 155 * deg, rho: 0.7 },
    ],
  },
  GLU: { name: "GLU", fmax: 1500, lopt: 0.11, lslack: 0.13, vmax: 12, spans: [{ joint: "hip", direction: 1, r0: 0.1, phiMax: null, phiRef: 150 * deg, rho: 0.5 }] },
  HFL: { name: "HFL", fmax: 2000, lopt: 0.11, lslack: 0.1, vmax: 12, spans: [{ joint: "hip", direction: -1, r0: 0.1, phiMax: null, phiRef: 180 * deg, rho: 0.5 }] },
};

const MUSCLES: readonly LegMuscle[] = ["SOL", "TA", "GAS", "VAS", "HAM", "GLU", "HFL"];

/**
 * Reflex parameters (Geyer & Herr 2010, Table I). Force gains are per `fmax` of the muscle, length offsets are in
 * optimal lengths, `kbw` is per body weight, the trunk lean reference and gains are in rad and rad/s.
 */
export interface ReflexParameters {
  gSol: number;
  gTa: number;
  loffTa: number;
  gSolTa: number;
  gGas: number;
  s0Vas: number;
  gVas: number;
  kPhi: number;
  phiKneeOff: number;
  s0Bal: number;
  kp: number;
  kd: number;
  thetaRef: number;
  kbw: number;
  deltaS: number;
  gHam: number;
  gGlu: number;
  gHfl: number;
  loffHfl: number;
  gHamHfl: number;
  loffHam: number;
  kLean: number;
  /**
   * Stance preparation (H. Song and H. Geyer, *J. Physiol.* 593, 2015): extra stimulation of the vasti and tibialis
   * anterior once the swing leg retracts, so the knee and ankle are braced for the coming heel strike. Zero in
   * Geyer & Herr (2010), whose model lacks it and slaps the forefoot down after heel strike.
   */
  prepVas: number;
  prepTa: number;
}

/** The hand-tuned walking reflexes of Geyer & Herr (2010), Table I. */
export const GEYER_HERR_REFLEXES: ReflexParameters = {
  gSol: 1.2,
  gTa: 1.1,
  loffTa: 0.71,
  gSolTa: 0.3,
  gGas: 1.1,
  s0Vas: 0.09,
  gVas: 1.15,
  kPhi: 2,
  phiKneeOff: 2.97,
  s0Bal: 0.05,
  kp: 1.91,
  kd: 0.25,
  thetaRef: 0.105,
  kbw: 1.2,
  deltaS: 0.25,
  gHam: 0.65,
  gGlu: 0.4,
  gHfl: 0.35,
  loffHfl: 0.6,
  gHamHfl: 4,
  loffHam: 0.85,
  kLean: 1.15,
  prepVas: 0,
  prepTa: 0,
};

/** A fixed-delay line over `delay` seconds of samples at `dt`. */
class Delay {
  private readonly buffer: Float64Array;
  private index = 0;
  constructor(delay: number, dt: number, initial = 0) {
    this.buffer = new Float64Array(Math.max(1, Math.round(delay / dt))).fill(initial);
  }
  /** Push the current value and return the one from `delay` ago. */
  push(value: number): number {
    const old = this.buffer[this.index] ?? 0;
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.buffer.length;
    return old;
  }
  values(): number[] {
    return [...this.buffer.subarray(this.index), ...this.buffer.subarray(0, this.index)];
  }
  load(values: readonly number[]): void {
    this.buffer.set(values.slice(0, this.buffer.length));
    this.index = 0;
  }
}

const DELAYS = {
  SOL: 0.02,
  GAS: 0.02,
  TA_L: 0.02,
  VAS: 0.01,
  KNEE: 0.01,
  KNEE_RATE: 0.01,
  CONTRA: 0.01,
  HAM: 0.005,
  GLU: 0.005,
  HFL_L: 0.005,
  HAM_L: 0.005,
  LEAN: 0.005,
  LEAN_RATE: 0.005,
  LOAD: 0.005,
} as const;
type DelayKey = keyof typeof DELAYS;
function perDelay<V>(make: (key: DelayKey) => V): Record<DelayKey, V> {
  return {
    SOL: make("SOL"),
    GAS: make("GAS"),
    TA_L: make("TA_L"),
    VAS: make("VAS"),
    KNEE: make("KNEE"),
    KNEE_RATE: make("KNEE_RATE"),
    CONTRA: make("CONTRA"),
    HAM: make("HAM"),
    GLU: make("GLU"),
    HFL_L: make("HFL_L"),
    HAM_L: make("HAM_L"),
    LEAN: make("LEAN"),
    LEAN_RATE: make("LEAN_RATE"),
    LOAD: make("LOAD"),
  };
}
const DELAY_KEYS: readonly DelayKey[] = Object.keys(perDelay(() => 0)).filter((key): key is DelayKey => key in DELAYS);

function perMuscle<V>(make: (name: LegMuscle) => V): Record<LegMuscle, V> {
  return { SOL: make("SOL"), TA: make("TA"), GAS: make("GAS"), VAS: make("VAS"), HAM: make("HAM"), GLU: make("GLU"), HFL: make("HFL") };
}

interface LegState {
  side: HumanSide;
  muscles: Record<LegMuscle, MuscleState>;
  stance: boolean;
  stanceSince: number;
  /** Trunk lean error captured at the last take-off. */
  leanAtTakeoff: number;
  delayed: Record<DelayKey, Delay>;
}

/** Live state of a {@link ReflexWalker}. */
export interface ReflexWalkerState {
  legs: { side: HumanSide; muscles: Record<LegMuscle, MuscleState>; stance: boolean; stanceSince: number; leanAtTakeoff: number; delayed: Record<string, number[]> }[];
  metabolicEnergy: number;
}

/** A muscle-reflex controller on a {@link HumanBody}. */
export interface ReflexWalker {
  params: ReflexParameters;
  /** Advance the muscles and the body by one body step. */
  step(): void;
  /** Muscle metabolic energy spent so far, J (resting excluded). */
  metabolicEnergy(): number;
  /** Activation of a muscle. */
  activation(side: HumanSide, muscle: LegMuscle): number;
  /** Called when a foot touches down. */
  onStrike?: (side: HumanSide, time: number) => void;
  snapshot(): ReflexWalkerState;
  restore(state: ReflexWalkerState): void;
}

/** Extension angles (rad) of a leg's joints in the Geyer convention, from the body's joint angles. */
function extensionAngles(body: HumanBody, side: HumanSide): Record<"hip" | "knee" | "ankle", number> {
  return { hip: Math.PI - body.joint(side, "hip").angle, knee: Math.PI + body.joint(side, "knee").angle, ankle: Math.PI / 2 - body.joint(side, "ankle").angle };
}

/** Stimulation per leg muscle, 0.01–1. */
export type LegStimulation = Record<LegMuscle, number>;

/** Fresh muscle states for one leg at the body's current pose. @internal */
export function createLegMuscles(body: HumanBody, side: HumanSide): Record<LegMuscle, MuscleState> {
  const phi = extensionAngles(body, side);
  return perMuscle((name) => {
    const spec = GEYER_HERR_MUSCLES[name];
    return restingMuscle(spec, spec.lopt + spec.lslack + muscleLengthChange(spec, phi));
  });
}

/**
 * Step one leg's seven muscles under `stimulation` and write the joint torques they make into `out` (body
 * conventions). Returns their metabolic power, W.
 * @capability leg-muscles drive the reference human's leg with the seven Geyer–Herr muscles from stimulations
 */
export function actuateLegMuscles(body: HumanBody, side: HumanSide, muscles: Record<LegMuscle, MuscleState>, stimulation: LegStimulation, dt: number, out: HumanJointTorques): number {
  const phi = extensionAngles(body, side);
  let hip = 0;
  let knee = 0;
  let ankle = 0;
  let power = 0;
  for (const name of MUSCLES) {
    const spec = GEYER_HERR_MUSCLES[name];
    const state = muscles[name];
    const lmtu = spec.lopt + spec.lslack + muscleLengthChange(spec, phi);
    const force = stepMuscle(spec, state, lmtu, stimulation[name], dt);
    power += muscleMetabolicPower(spec, state);
    for (const span of spec.spans) {
      const torque = span.direction * momentArm(span, phi[span.joint]) * force;
      if (span.joint === "hip") hip += torque;
      else if (span.joint === "knee") knee += torque;
      else ankle += torque;
    }
  }
  // Extension torques → body conventions: hip flexion, knee extension and ankle dorsiflexion positive.
  if (side === "right") {
    out.rightHip = -hip;
    out.rightKnee = knee;
    out.rightAnkle = -ankle;
  } else {
    out.leftHip = -hip;
    out.leftKnee = knee;
    out.leftAnkle = -ankle;
  }
  return power * dt;
}

/**
 * Creates the Geyer & Herr (2010) muscle-reflex walker on a sagittal human: seven Hill muscles per leg, stance and
 * swing reflexes switched by foot contact, positive force feedback in the stance extensors, trunk balance through the
 * hip muscles in proportion to the load each leg bears, swing initiation in double support, and swing-leg retraction.
 * No central pattern: the gait self-organises from the interplay with the ground.
 * @capability muscle-reflex-walker Geyer–Herr muscle-reflex control of the multibody reference human (no central pattern generator)
 */
export function createReflexWalker(body: HumanBody, params: ReflexParameters = GEYER_HERR_REFLEXES): ReflexWalker {
  const dt = body.dt;
  const weight = body.geometry.mass * body.gravity;
  const makeLeg = (side: HumanSide): LegState => {
    const muscles = createLegMuscles(body, side);
    const delayed = perDelay((key) => new Delay(DELAYS[key], dt));
    return { side, muscles, stance: false, stanceSince: 0, leanAtTakeoff: 0, delayed };
  };
  const legs: LegState[] = [makeLeg("right"), makeLeg("left")];
  let metabolic = 0;
  const torques: HumanJointTorques = { rightHip: 0, rightKnee: 0, rightAnkle: 0, leftHip: 0, leftKnee: 0, leftAnkle: 0 };

  const walker: ReflexWalker = {
    params,
    step() {
      const p = walker.params;
      const lean = -(body.q[2] ?? 0);
      const leanRate = -(body.u[2] ?? 0);
      const forces = legs.map((leg) => {
        const f = leg.side === "right" ? body.feet.right : body.feet.left;
        return Math.hypot(f[0] ?? 0, f[1] ?? 0);
      });
      for (let i = 0; i < 2; i++) {
        const leg = legs[i];
        if (leg === undefined) continue;
        const inContact = (forces[i] ?? 0) > 1;
        if (inContact && !leg.stance) {
          leg.stance = true;
          leg.stanceSince = body.time;
          walker.onStrike?.(leg.side, body.time);
        } else if (!inContact && leg.stance) {
          leg.stance = false;
          leg.leanAtTakeoff = lean - p.thetaRef;
        }
      }
      for (let i = 0; i < 2; i++) {
        const leg = legs[i];
        const contra = legs[1 - i];
        if (leg === undefined || contra === undefined) continue;
        const m = leg.muscles;
        const d = leg.delayed;
        const phi = extensionAngles(body, leg.side);
        const kneeRate = body.joint(leg.side, "knee").rate;
        const lTa = m.TA.lce / GEYER_HERR_MUSCLES.TA.lopt;
        const lHfl = m.HFL.lce / GEYER_HERR_MUSCLES.HFL.lopt;
        const lHam = m.HAM.lce / GEYER_HERR_MUSCLES.HAM.lopt;
        const fSol = d.SOL.push(m.SOL.force);
        const fGas = d.GAS.push(m.GAS.force);
        const taL = d.TA_L.push(lTa);
        const fVas = d.VAS.push(m.VAS.force);
        const knee = d.KNEE.push(phi.knee);
        const kneeR = d.KNEE_RATE.push(kneeRate);
        const contraLoad = (d.CONTRA.push(forces[1 - i] ?? 0)) / weight;
        const fHam = d.HAM.push(m.HAM.force);
        const fGlu = d.GLU.push(m.GLU.force);
        const hflL = d.HFL_L.push(lHfl);
        const hamL = d.HAM_L.push(lHam);
        const leanD = d.LEAN.push(lean);
        const leanRateD = d.LEAN_RATE.push(leanRate);
        const load = (d.LOAD.push(forces[i] ?? 0)) / weight;
        const s: Record<LegMuscle, number> = { SOL: 0.01, TA: 0.01, GAS: 0.01, VAS: 0.01, HAM: 0.01, GLU: 0.01, HFL: 0.01 };
        const fm = (name: LegMuscle) => GEYER_HERR_MUSCLES[name].fmax;
        if (leg.stance) {
          const doubleSupport = contra.stance && leg.stanceSince < contra.stanceSince ? 1 : 0;
          s.SOL = 0.01 + (p.gSol / fm("SOL")) * fSol;
          s.TA = 0.01 + p.gTa * Math.max(0, taL - p.loffTa) - (p.gSolTa / fm("SOL")) * fSol;
          s.GAS = 0.01 + (p.gGas / fm("GAS")) * fGas;
          const kneeOver = knee > p.phiKneeOff && kneeR > 0 ? p.kPhi * (knee - p.phiKneeOff) : 0;
          s.VAS = p.s0Vas + (p.gVas / fm("VAS")) * fVas - kneeOver - p.kbw * contraLoad * doubleSupport;
          const balance = p.kp * (leanD - p.thetaRef) + p.kd * leanRateD;
          const share = p.kbw * load;
          s.HAM = p.s0Bal + Math.max(0, balance) * share;
          s.GLU = p.s0Bal + Math.max(0, 0.68 * p.kp * (leanD - p.thetaRef) + p.kd * leanRateD) * share - p.deltaS * doubleSupport;
          s.HFL = p.s0Bal + Math.max(0, -balance) * share + p.deltaS * doubleSupport;
        } else {
          s.TA = 0.01 + p.gTa * Math.max(0, taL - p.loffTa);
          s.HAM = 0.01 + (p.gHam / fm("HAM")) * fHam;
          s.GLU = 0.01 + (p.gGlu / fm("GLU")) * fGlu;
          s.HFL = 0.01 + p.kLean * leg.leanAtTakeoff + p.gHfl * Math.max(0, hflL - p.loffHfl) - p.gHamHfl * Math.max(0, hamL - p.loffHam);
          const thigh = leg.side === "right" ? 1 : 4;
          if ((body.u[2 + thigh] ?? 0) < 0) {
            s.VAS += p.prepVas;
            s.TA += p.prepTa;
          }
        }
        metabolic += actuateLegMuscles(body, leg.side, m, s, dt, torques);
      }
      body.stepMuscles(torques);
    },
    metabolicEnergy: () => metabolic,
    activation: (side, muscle) => (side === "right" ? legs[0] : legs[1])?.muscles[muscle].activation ?? 0,
    snapshot() {
      return {
        legs: legs.map((leg) => ({
          side: leg.side,
          muscles: perMuscle((name) => ({ ...leg.muscles[name] })),
          stance: leg.stance,
          stanceSince: leg.stanceSince,
          leanAtTakeoff: leg.leanAtTakeoff,
          delayed: Object.fromEntries(Object.entries(leg.delayed).map(([key, line]) => [key, line.values()])),
        })),
        metabolicEnergy: metabolic,
      };
    },
    restore(state) {
      state.legs.forEach((saved, i) => {
        const leg = legs[i];
        if (leg === undefined) return;
        for (const name of MUSCLES) Object.assign(leg.muscles[name], saved.muscles[name]);
        leg.stance = saved.stance;
        leg.stanceSince = saved.stanceSince;
        leg.leanAtTakeoff = saved.leanAtTakeoff;
        for (const key of DELAY_KEYS) {
          const values = saved.delayed[key];
          if (values !== undefined) leg.delayed[key].load(values);
        }
      });
      metabolic = state.metabolicEnergy;
    },
  };
  return walker;
}
