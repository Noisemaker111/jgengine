import type { PlanarSegment } from "./planarMultibody";

/** One segment row of a body-segment-parameter table: shares of body mass and of segment length. */
export interface SegmentParameters {
  /** Segment mass over body mass. */
  massShare: number;
  /** Segment length for the reference subject, m (between the endpoints below). */
  length: number;
  /** Centre of mass from the proximal endpoint over segment length. */
  comShare: number;
  /** Sagittal-axis radius of gyration about the centre of mass over segment length. */
  gyrationShare: number;
}

/** A body-segment-parameter table for one reference subject. */
export interface AnthropometricTable {
  /** Reference subject's body mass, kg. */
  mass: number;
  /** Reference subject's stature, m. */
  stature: number;
  /** Vertex to cervicale (C7). */
  head: SegmentParameters;
  /** Cervicale to mid-hip (the hip joint centres' midpoint). */
  trunk: SegmentParameters;
  /** Shoulder joint centre to elbow joint centre. */
  upperArm: SegmentParameters;
  /** Elbow joint centre to wrist joint centre. */
  forearm: SegmentParameters;
  /** Wrist joint centre to the third metacarpale. */
  hand: SegmentParameters;
  /** Hip joint centre to knee joint centre. */
  thigh: SegmentParameters;
  /** Knee joint centre to ankle joint centre. */
  shank: SegmentParameters;
  /** Heel to the tip of the longest toe. */
  foot: SegmentParameters;
  /** Ankle joint centre above the sole, m (Winter: 0.039 × stature). */
  ankleHeight: number;
  /** Heel behind the ankle joint centre, m. */
  heelBehindAnkle: number;
  /** Shoulder joint centre below cervicale, m. */
  shoulderBelowCervicale: number;
}

/**
 * Adult male body-segment parameters of P. de Leva, "Adjustments to Zatsiorsky–Seluyanov's segment inertia
 * parameters", *J. Biomech.* 29 (1996) 1223–1230, Table 4 (73.0 kg, 1.741 m), referenced to joint centres. The ankle
 * height and heel position follow D. A. Winter, *Biomechanics and Motor Control of Human Movement*, 4th ed. (2009),
 * Fig. 4.1 (ankle 0.039 H above the sole; heel about 0.2 foot lengths behind the ankle).
 */
export const DE_LEVA_MALE: AnthropometricTable = {
  mass: 73.0,
  stature: 1.741,
  head: { massShare: 0.0694, length: 0.2033, comShare: 0.5002, gyrationShare: 0.303 },
  trunk: { massShare: 0.4346, length: 0.6033, comShare: 0.5138, gyrationShare: 0.328 },
  upperArm: { massShare: 0.0271, length: 0.2817, comShare: 0.5772, gyrationShare: 0.285 },
  forearm: { massShare: 0.0162, length: 0.2689, comShare: 0.4574, gyrationShare: 0.276 },
  hand: { massShare: 0.0061, length: 0.0862, comShare: 0.79, gyrationShare: 0.628 },
  thigh: { massShare: 0.1416, length: 0.4222, comShare: 0.4095, gyrationShare: 0.329 },
  shank: { massShare: 0.0433, length: 0.4403, comShare: 0.4395, gyrationShare: 0.251 },
  foot: { massShare: 0.0137, length: 0.2581, comShare: 0.4415, gyrationShare: 0.257 },
  ankleHeight: 0.039 * 1.741,
  heelBehindAnkle: 0.05,
  shoulderBelowCervicale: 0.06,
};

/** Sagittal-plane human segment indices in a {@link planarHumanSegments} body. */
export const HUMAN_SEGMENT = { hat: 0, rightThigh: 1, rightShank: 2, rightFoot: 3, leftThigh: 4, leftShank: 5, leftFoot: 6 } as const;

/** Geometry of a sagittal human built by {@link planarHumanSegments}, scaled to the subject. */
export interface PlanarHumanGeometry {
  segments: PlanarSegment[];
  mass: number;
  stature: number;
  thighLength: number;
  shankLength: number;
  /** Hip joint centre to the sole when standing straight, m: the leg length Froude numbers use. */
  legLength: number;
  /** Heel and ball-of-foot contact points in the foot frame (relative to the ankle joint), m. */
  heel: readonly [number, number];
  toe: readonly [number, number];
  /** Standing height of the head-arms-trunk centre of mass above the hip, m. */
  hatComHeight: number;
}

/**
 * The seven-segment sagittal human of Winter's gait model — head-arms-trunk (HAT), and per leg thigh, shank and
 * foot — built from a segment table scaled to `mass` (kg) and `stature` (m): lengths with stature, masses with
 * mass, inertias with mass × stature². The HAT lumps head, trunk and both arms hanging at the sides, each with its
 * own parallel-axis term. Reference pose: standing upright, hip joint centre at the origin, feet flat.
 * @capability human-anthropometry scale published body-segment parameters (de Leva 1996) to a subject and build a sagittal multibody human
 */
export function planarHumanSegments(mass = DE_LEVA_MALE.mass, stature = DE_LEVA_MALE.stature, table: AnthropometricTable = DE_LEVA_MALE): PlanarHumanGeometry {
  const ls = stature / table.stature;
  const len = (p: SegmentParameters) => p.length * ls;
  const m = (p: SegmentParameters) => p.massShare * mass;
  const izz = (p: SegmentParameters) => m(p) * (p.gyrationShare * len(p)) ** 2;

  // HAT parts as [mass, height of COM above the hip, own inertia about its COM].
  const trunkLen = len(table.trunk);
  const shoulder = trunkLen - table.shoulderBelowCervicale * ls;
  const parts: [number, number, number][] = [
    [m(table.trunk), trunkLen * (1 - table.trunk.comShare), izz(table.trunk)],
    [m(table.head), trunkLen + len(table.head) * (1 - table.head.comShare), izz(table.head)],
    [2 * m(table.upperArm), shoulder - len(table.upperArm) * table.upperArm.comShare, 2 * izz(table.upperArm)],
    [2 * m(table.forearm), shoulder - len(table.upperArm) - len(table.forearm) * table.forearm.comShare, 2 * izz(table.forearm)],
    [2 * m(table.hand), shoulder - len(table.upperArm) - len(table.forearm) - len(table.hand) * table.hand.comShare, 2 * izz(table.hand)],
  ];
  const hatMass = parts.reduce((sum, [pm]) => sum + pm, 0);
  const hatCom = parts.reduce((sum, [pm, y]) => sum + pm * y, 0) / hatMass;
  const hatInertia = parts.reduce((sum, [pm, y, i]) => sum + i + pm * (y - hatCom) ** 2, 0);

  const thighLength = len(table.thigh);
  const shankLength = len(table.shank);
  const footLength = len(table.foot);
  const ankleHeight = table.ankleHeight * ls;
  const heelX = -table.heelBehindAnkle * ls;
  // The forefoot contact is the ball of the foot (first metatarsal head), about 0.73 foot lengths from the heel.
  const toeX = heelX + 0.73 * footLength;
  const footCom: [number, number] = [heelX + footLength * table.foot.comShare, -ankleHeight * 0.55];

  const segments: PlanarSegment[] = [{ name: "hat", parent: -1, joint: [0, 0], com: [0, hatCom], mass: hatMass, inertia: hatInertia }];
  for (const side of ["right", "left"] as const) {
    const thigh = segments.length;
    segments.push({ name: `${side}Thigh`, parent: 0, joint: [0, 0], com: [0, -thighLength * table.thigh.comShare], mass: m(table.thigh), inertia: izz(table.thigh) });
    segments.push({ name: `${side}Shank`, parent: thigh, joint: [0, -thighLength], com: [0, -shankLength * table.shank.comShare], mass: m(table.shank), inertia: izz(table.shank) });
    segments.push({ name: `${side}Foot`, parent: thigh + 1, joint: [0, -shankLength], com: footCom, mass: m(table.foot), inertia: izz(table.foot) });
  }
  return {
    segments,
    mass,
    stature,
    thighLength,
    shankLength,
    legLength: thighLength + shankLength + ankleHeight,
    heel: [heelX, -ankleHeight],
    toe: [toeX, -ankleHeight],
    hatComHeight: hatCom,
  };
}
