import { DE_LEVA_MALE, planarHumanSegments } from "./anthropometry";
import { flatGround, footContactForce, SHOE_ON_CONCRETE, type ContactParameters, type ContactPointState, type GroundProfile } from "./footContact";
import { maxJointTorque, YOUNG_MALE_STRENGTH, type LegJoint } from "./jointStrength";
import type { HumanValidationRow } from "./humanReferenceValidation";
import { createPlanarMultibody, type PlanarSegment } from "./planarMultibody";

/**
 * Buttock and trochanter soft tissue on a hard floor: about 2 kN at 50 mm of compression, the force–deflection of the
 * soft tissue over the pelvis in falls (S. N. Robinovitch, W. C. Hayes and T. A. McMahon, *J. Biomech. Eng.* 113, 1991).
 */
export const PELVIS_ON_FLOOR: ContactParameters = { stiffness: 1.5e5, damping: 0.15, friction: 0.6, stickStiffness: 5e4, stickDamping: 5e2 };

/** Scalp and skull on a hard floor: about 4 kN at 4 mm of compression, nearly elastic. */
export const HEAD_ON_FLOOR: ContactParameters = { stiffness: 1.6e7, damping: 0.2, friction: 0.5, stickStiffness: 5e5, stickDamping: 1e3 };

/**
 * How the faller holds their joints. `limp`: no muscle torque (a faint); `rigid`: every joint servoed to standing with
 * full strength; `landing`: knees and hips bent 15° and held by a compliant servo, as a person drops onto their feet.
 */
export type FallTone = "limp" | "rigid" | "landing";

/** Settings for {@link simulateFall}; every field has a default. */
export interface FallOptions {
  /** `backward` (default) or `forward`. */
  direction?: "backward" | "forward";
  tone?: FallTone;
  /** Body mass, kg (default 80) and stature, m (default 1.8). */
  mass?: number;
  stature?: number;
  /** Starting rotation rate about the ankles, rad/s (default 0.3: a slip or a shove). */
  push?: number;
  /** Height the feet start above the floor, m (default 0: falling from standing). */
  dropHeight?: number;
  ground?: GroundProfile;
}

/** What a fall does to the body. Speeds are m/s at first touch, forces N; `NaN` when that part never touched. */
export interface FallReport {
  /** Release to first touch of the pelvis and of the head, s. */
  pelvisTime: number;
  headTime: number;
  /** Downward speed of the pelvis and total speed of the head at first touch. */
  pelvisImpactSpeed: number;
  headImpactSpeed: number;
  /** Peak floor force on the pelvis, the head, and under one foot. */
  peakPelvisForce: number;
  peakHeadForce: number;
  peakFootForce: number;
  /** Head Injury Criterion over a 15 ms window, from the head's acceleration. */
  hic15: number;
  /** Peak axial force along the thigh (the femur load the injury criteria use). */
  peakFemurForce: number;
}

const SEG = { trunk: 0, rightThigh: 1, rightShank: 2, rightFoot: 3, leftThigh: 4, leftShank: 5, leftFoot: 6, head: 7 } as const;
const RANGE: Record<LegJoint | "neck", [number, number]> = { hip: [-0.6, 2.2], knee: [-2.5, 0], ankle: [-0.8, 0.45], neck: [-0.7, 0.9] };

interface BodyPoint {
  segment: number;
  local: readonly [number, number];
  contact: ContactParameters;
  part: "head" | "pelvis" | "trunk" | "knee" | "foot";
  state: ContactPointState;
}

/** The sagittal body of {@link planarHumanSegments} with its head split off at a neck joint, so a head strike decelerates the head alone. */
function fallBody(mass: number, stature: number): { segments: PlanarSegment[]; legLength: number; ankleHeight: number; points: BodyPoint[] } {
  const t = DE_LEVA_MALE;
  const ls = stature / t.stature;
  const geometry = planarHumanSegments(mass, stature);
  const trunkLen = t.trunk.length * ls;
  const headLen = t.head.length * ls;
  const headMass = t.head.massShare * mass;
  const headInertia = headMass * (t.head.gyrationShare * headLen) ** 2;
  const hat = geometry.segments[0];
  if (hat === undefined) throw new Error("no trunk segment");
  // Take the head out of the head-arms-trunk segment, keeping total mass and the combined centre of mass.
  const headComY = trunkLen + headLen * (1 - t.head.comShare);
  const restMass = hat.mass - headMass;
  const restComY = (hat.mass * hat.com[1] - headMass * headComY) / restMass;
  const restInertia = hat.inertia - headInertia - headMass * (headComY - hat.com[1]) ** 2 - restMass * (restComY - hat.com[1]) ** 2;
  const segments: PlanarSegment[] = [
    { ...hat, name: "trunk", mass: restMass, com: [0, restComY], inertia: restInertia },
    ...geometry.segments.slice(1),
    { name: "head", parent: SEG.trunk, joint: [0, trunkLen], com: [0, headLen * (1 - t.head.comShare)], mass: headMass, inertia: headInertia },
  ];
  const ankleHeight = t.ankleHeight * ls;
  const depth = 0.1 * ls;
  const point = (segment: number, local: readonly [number, number], contact: ContactParameters, part: BodyPoint["part"]): BodyPoint => ({ segment, local, contact, part, state: { anchor: null } });
  const points: BodyPoint[] = [
    point(SEG.head, [-0.09 * ls, 0.1 * ls], HEAD_ON_FLOOR, "head"),
    point(SEG.head, [0.1 * ls, 0.12 * ls], HEAD_ON_FLOOR, "head"),
    point(SEG.head, [0, headLen], HEAD_ON_FLOOR, "head"),
    point(SEG.trunk, [-depth, 0.02], PELVIS_ON_FLOOR, "pelvis"),
    point(SEG.trunk, [depth, 0.02], PELVIS_ON_FLOOR, "pelvis"),
    point(SEG.trunk, [-depth, trunkLen * 0.75], PELVIS_ON_FLOOR, "trunk"),
    point(SEG.trunk, [depth * 1.2, trunkLen * 0.7], PELVIS_ON_FLOOR, "trunk"),
  ];
  for (const [shank, foot] of [[SEG.rightShank, SEG.rightFoot], [SEG.leftShank, SEG.leftFoot]] as const) {
    points.push(point(shank, [0.05 * ls, 0], PELVIS_ON_FLOOR, "knee"));
    points.push(point(foot, geometry.heel, SHOE_ON_CONCRETE, "foot"));
    points.push(point(foot, geometry.toe, SHOE_ON_CONCRETE, "foot"));
  }
  return { segments, legLength: geometry.legLength, ankleHeight, points };
}

/** HIC over windows up to `window` s of an acceleration trace in g sampled every `dt` s. */
function headInjuryCriterion(accel: readonly number[], dt: number, window: number): number {
  const cumulative = new Float64Array(accel.length + 1);
  for (let i = 0; i < accel.length; i++) cumulative[i + 1] = (cumulative[i] ?? 0) + (accel[i] ?? 0) * dt;
  const span = Math.max(1, Math.round(window / dt));
  // Only windows that start near the peak matter; a stride keeps long traces cheap.
  let peak = 0;
  accel.forEach((a, i) => {
    if (a > (accel[peak] ?? 0)) peak = i;
  });
  let best = 0;
  const lo = Math.max(0, peak - span);
  const hi = Math.min(accel.length, peak + span);
  for (let i = lo; i < hi; i++) {
    for (let j = i + 1; j <= Math.min(accel.length, i + span); j++) {
      const t = (j - i) * dt;
      const mean = ((cumulative[j] ?? 0) - (cumulative[i] ?? 0)) / t;
      if (mean > 0) best = Math.max(best, t * mean ** 2.5);
    }
  }
  return best;
}

/**
 * Fall the reference human from standing (or drop it from a height onto its feet) onto a hard floor and measure the
 * impacts: an eight-segment
 * sagittal body (de Leva anthropometry with the head on its own neck joint) on Hunt–Crossley contacts at the head,
 * back, pelvis, knees and feet, limp, rigid or landing. Arms are folded into the trunk, so it is an unbroken fall. A
 * drop ends 0.4 s after the feet touch. Foot force is read through a 10 ms average, as a force plate reports it.
 * @capability human-fall-reference simulate a person falling from standing or a height and measure head and pelvis impact speed, floor forces and HIC
 */
export function simulateFall(options: FallOptions = {}): FallReport {
  const mass = options.mass ?? 80;
  const stature = options.stature ?? 1.8;
  const tone = options.tone ?? "limp";
  const sign = (options.direction ?? "backward") === "backward" ? 1 : -1;
  const ground = options.ground ?? flatGround();
  const body = fallBody(mass, stature);
  const model = createPlanarMultibody(body.segments);
  const dt = 1 / 8000;
  const q = new Float64Array(model.dofs);
  const u = new Float64Array(model.dofs);
  const Q = new Float64Array(model.dofs);
  const acc = new Float64Array(model.dofs);
  const p = new Float64Array(2);
  const v = new Float64Array(2);
  const f = new Float64Array(2);
  const push = (options.push ?? 0.3) * sign;
  const bend = tone === "landing" ? 0.26 : 0;
  // Landing: hips and knees bent, ankles pointed so the balls of the feet touch first.
  const pose: Record<LegJoint, number> = { hip: bend, knee: -2 * bend, ankle: tone === "landing" ? -0.35 : 0 };
  for (const [thigh, shank, foot] of [[SEG.rightThigh, SEG.rightShank, SEG.rightFoot], [SEG.leftThigh, SEG.leftShank, SEG.leftFoot]] as const) {
    q[2 + thigh] = pose.hip;
    q[2 + shank] = pose.hip + pose.knee;
    q[2 + foot] = pose.hip + pose.knee + pose.ankle;
  }
  let lowest = Number.POSITIVE_INFINITY;
  for (const point of body.points) lowest = Math.min(lowest, model.point(q, point.segment, point.local, p)[1] ?? 0);
  q[1] = (options.dropHeight ?? 0) - lowest + 0.002;
  if ((options.dropHeight ?? 0) === 0) {
    // Rotate as one rigid body about the ankles: every segment turns at `push`, the hip swings back over the heels.
    for (let s = 0; s < body.segments.length; s++) u[2 + s] = push;
    u[0] = -push * (body.legLength - body.ankleHeight);
  }
  const massStature = mass * stature;
  const report: FallReport = { pelvisTime: Number.NaN, headTime: Number.NaN, pelvisImpactSpeed: Number.NaN, headImpactSpeed: Number.NaN, peakPelvisForce: 0, peakHeadForce: 0, peakFootForce: 0, hic15: 0, peakFemurForce: 0 };
  const headAccel: number[] = [];
  const headVel = new Float64Array(2);
  const lastHeadVel = new Float64Array(2);
  const headCom = body.segments[SEG.head]?.com ?? [0, 0];
  let resting = 0;
  const distalForce = new Float64Array(4);
  const distalVel = new Float64Array(8);
  const steps = Math.round(3 / dt);
  const dropping = (options.dropHeight ?? 0) > 0;
  let footDown = Number.NaN;
  const window = Math.round(0.01 / dt);
  const footTrace = [new Float64Array(window), new Float64Array(window)];
  const footSum = [0, 0];
  for (let step = 0; step < steps; step++) {
    Q.fill(0);
    let headForce = 0;
    let pelvisForce = 0;
    const footForce = [0, 0];
    distalForce.fill(0);
    for (const point of body.points) {
      model.point(q, point.segment, point.local, p);
      if ((p[1] ?? 0) > 0.06 + Math.max(0, ground.vertices[0]?.[1] ?? 0) && point.state.anchor === null) continue;
      model.pointVelocity(q, u, point.segment, point.local, v);
      const normal = footContactForce(ground, point.contact, p, v, point.state, f);
      if (normal === 0) continue;
      const time = step * dt;
      if (point.part === "head" && Number.isNaN(report.headTime)) {
        report.headTime = time;
        report.headImpactSpeed = Math.hypot(v[0] ?? 0, v[1] ?? 0);
      }
      if (point.part === "pelvis" && Number.isNaN(report.pelvisTime)) {
        report.pelvisTime = time;
        report.pelvisImpactSpeed = -(v[1] ?? 0);
      }
      model.addPointForce(q, point.segment, p, f, Q);
      const total = Math.hypot(f[0] ?? 0, f[1] ?? 0);
      if (point.part === "head") headForce += total;
      if (point.part === "pelvis") pelvisForce += total;
      const leg = point.segment === SEG.rightShank || point.segment === SEG.rightFoot ? 0 : point.segment === SEG.leftShank || point.segment === SEG.leftFoot ? 1 : -1;
      if (leg >= 0) {
        distalForce[2 * leg] = (distalForce[2 * leg] ?? 0) + (f[0] ?? 0);
        distalForce[2 * leg + 1] = (distalForce[2 * leg + 1] ?? 0) + (f[1] ?? 0);
      }
      if (point.part === "foot") footForce[point.segment === SEG.rightFoot ? 0 : 1] = (footForce[point.segment === SEG.rightFoot ? 0 : 1] ?? 0) + total;
    }
    report.peakHeadForce = Math.max(report.peakHeadForce, headForce);
    report.peakPelvisForce = Math.max(report.peakPelvisForce, pelvisForce);
    // Force plates read the foot through a ~100 Hz filter: a 10 ms moving average.
    for (let leg = 0; leg < 2; leg++) {
      const trace = footTrace[leg];
      if (trace === undefined) continue;
      const slot = step % window;
      footSum[leg] = (footSum[leg] ?? 0) + (footForce[leg] ?? 0) - (trace[slot] ?? 0);
      trace[slot] = footForce[leg] ?? 0;
      report.peakFootForce = Math.max(report.peakFootForce, (footSum[leg] ?? 0) / window);
    }
    if (dropping && Number.isNaN(footDown) && (footForce[0] ?? 0) + (footForce[1] ?? 0) > 0) footDown = step * dt;
    if (dropping && step * dt > footDown + 0.4) break;
    for (let s = 1; s < body.segments.length; s++) {
      const segment = body.segments[s];
      if (segment === undefined) continue;
      const parent = segment.parent;
      const angle = (q[2 + s] ?? 0) - (q[2 + parent] ?? 0);
      const rate = (u[2 + s] ?? 0) - (u[2 + parent] ?? 0);
      const joint: LegJoint | "neck" = s === SEG.head ? "neck" : s === SEG.rightThigh || s === SEG.leftThigh ? "hip" : s === SEG.rightShank || s === SEG.leftShank ? "knee" : "ankle";
      let torque = 0;
      if (joint === "neck") torque = tone === "rigid" ? -60 * angle - 4 * rate : -8 * angle - 1 * rate;
      else if (tone !== "limp") {
        const target = pose[joint];
        const wanted = tone === "rigid" ? -3000 * (angle - target) - 120 * rate : -350 * (angle - target) - 25 * rate;
        const capacity = wanted === 0 ? 0 : maxJointTorque(YOUNG_MALE_STRENGTH, joint, Math.sign(wanted), angle, rate, massStature);
        torque = Math.sign(wanted) * Math.min(Math.abs(wanted), capacity);
      } else torque = -2 * rate;
      const range = RANGE[joint];
      if (angle < range[0]) torque += 2000 * (range[0] - angle) - 40 * Math.min(0, rate);
      else if (angle > range[1]) torque += -2000 * (angle - range[1]) - 40 * Math.max(0, rate);
      model.addJointTorque(s, torque, Q);
    }
    model.accelerations(q, u, Q, 9.81, acc);
    for (let k = 0; k < model.dofs; k++) {
      u[k] = (u[k] ?? 0) + (acc[k] ?? 0) * dt;
      q[k] = (q[k] ?? 0) + (u[k] ?? 0) * dt;
    }
    model.pointVelocity(q, u, SEG.head, headCom, headVel);
    if (step > 0) headAccel.push(Math.hypot((headVel[0] ?? 0) - (lastHeadVel[0] ?? 0), (headVel[1] ?? 0) - (lastHeadVel[1] ?? 0)) / dt / 9.81);
    lastHeadVel[0] = headVel[0] ?? 0;
    lastHeadVel[1] = headVel[1] ?? 0;
    for (let leg = 0; leg < 2; leg++) {
      // Knee reaction on the shank: the distal chain's momentum change plus its weight, less the floor's push on it.
      const chain = leg === 0 ? [SEG.rightShank, SEG.rightFoot] : [SEG.leftShank, SEG.leftFoot];
      let fx = -(distalForce[2 * leg] ?? 0);
      let fy = -(distalForce[2 * leg + 1] ?? 0);
      for (let c = 0; c < 2; c++) {
        const segment = chain[c] ?? SEG.rightShank;
        const seg = body.segments[segment];
        if (seg === undefined) continue;
        model.pointVelocity(q, u, segment, seg.com, v);
        const k = 2 * (2 * leg + c);
        if (step > 0) {
          fx += (seg.mass * ((v[0] ?? 0) - (distalVel[k] ?? 0))) / dt;
          fy += (seg.mass * ((v[1] ?? 0) - (distalVel[k + 1] ?? 0))) / dt + seg.mass * 9.81;
        }
        distalVel[k] = v[0] ?? 0;
        distalVel[k + 1] = v[1] ?? 0;
      }
      const thigh = leg === 0 ? SEG.rightThigh : SEG.leftThigh;
      const angle = q[2 + thigh] ?? 0;
      // The thigh points down its own −y axis; axial force is the reaction along it.
      const axial = Math.abs(-Math.sin(angle) * fx * -1 + Math.cos(angle) * fy);
      if (step > 0) report.peakFemurForce = Math.max(report.peakFemurForce, axial);
    }
    if (model.kineticEnergy(q, u) < 0.05 && step * dt > 0.5) {
      resting += 1;
      if (resting > 0.2 / dt) break;
    } else resting = 0;
  }
  report.hic15 = headInjuryCriterion(headAccel, dt, 0.015);
  return report;
}

/** Peak force under one foot landing from `height` m, body weights: `0.49·√(height in cm) + 0.37` (Niu et al. 2014). */
function niuLandingForce(height: number): number {
  return 0.49 * Math.sqrt(height * 100) + 0.37;
}

/**
 * Validate the fall reference against published falls and landings: backward-fall pelvis and head impact speeds over
 * the range of leg stiffness ("Leg joint stiffness affects dynamics of backward falling from standing height",
 * *J. Biomech. Eng.* 142, 2020: head 2.65–7.88 m/s, hip 0.35–3.36 m/s), peak pelvis force in reconstructed real
 * backward falls (4.4–7.3 kN, "Impact forces in backward falls: subject-specific video-based rigid body simulation",
 * PMC10685694, 2023), and peak force under one foot in drop landings, within one RMSE (0.83 BW) of the pooled fit of
 * 26 studies (W. Niu, T. Feng, C. Jiang and M. Zhang, *Biomed Res. Int.* 2014, 126860).
 * @capability human-fall-validation check the fall and landing reference against published impact speeds and forces
 */
export function validateHumanFall(): HumanValidationRow[] {
  const row = (metric: string, label: string, unit: string, reference: number, low: number, high: number, source: string): HumanValidationRow => ({ metric, label, unit, reference, low, high, source, pass: reference >= low && reference <= high });
  const limp = simulateFall({ tone: "limp" });
  const rigid = simulateFall({ tone: "rigid" });
  const rows = [
    row("limpPelvis", "Limp backward fall: pelvis impact speed", "m/s", limp.pelvisImpactSpeed, 0.35, 3.36, "J. Biomech. Eng. 2020 (falls across leg stiffness)"),
    row("limpHead", "Limp backward fall: head impact speed", "m/s", limp.headImpactSpeed, 2.65, 7.88, "J. Biomech. Eng. 2020"),
    row("rigidHead", "Rigid backward fall: head impact speed", "m/s", rigid.headImpactSpeed, 2.65, 7.88, "J. Biomech. Eng. 2020"),
    row("limpPelvisForce", "Limp backward fall: peak pelvis force", "kN", limp.peakPelvisForce / 1000, 4.4, 7.3, "Reconstructed real falls, PMC10685694"),
  ];
  for (const height of [0.3, 0.6, 1]) {
    const landing = simulateFall({ tone: "landing", dropHeight: height });
    const published = niuLandingForce(height);
    const bw = landing.peakFootForce / (80 * 9.81);
    rows.push(row(`landing${height}`, `Drop landing from ${height} m: peak force under one foot`, "BW", bw, Math.round((published - 0.83) * 100) / 100, Math.round((published + 0.83) * 100) / 100, "Niu et al. 2014, ±1 RMSE"));
  }
  return rows;
}
