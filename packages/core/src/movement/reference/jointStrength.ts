/** Maximum voluntary torque of one exertion (one joint, one direction). */
export interface JointExertion {
  /** Peak isometric torque per body mass × stature, N·m/(kg·m). */
  isometric: number;
  /** Joint angle of the peak, rad, in the joint's own convention (see {@link HumanJointStrength}). */
  optimalAngle: number;
  /** Angle span over which the isometric torque falls to `e⁻¹` of its peak, rad. */
  angleWidth: number;
  /** Joint speed at which concentric torque reaches zero, rad/s. */
  maxVelocity: number;
}

/**
 * A torque generator per lower-limb joint and direction. Angles: hip = thigh relative to trunk (flexion positive),
 * knee = shank relative to thigh (flexion negative), ankle = foot relative to shank (dorsiflexion positive).
 */
export interface HumanJointStrength {
  hipFlexion: JointExertion;
  hipExtension: JointExertion;
  kneeFlexion: JointExertion;
  kneeExtension: JointExertion;
  ankleDorsiflexion: JointExertion;
  anklePlantarflexion: JointExertion;
  /** Eccentric torque plateau over isometric (lengthening under load). */
  eccentricRatio: number;
  /** Hill curvature `a/F₀` of the concentric torque–velocity hyperbola. */
  hillCurvature: number;
}

/**
 * Young adult male lower-limb strength. Isometric peaks, normalised to body mass × stature, sit in the middle of the
 * ranges gathered by the joint moment–angle–velocity meta-visualization of hip, knee and ankle datasets (bioRxiv
 * 10.1101/2024.06.22.600197, 2024: hip flexion 1.5–2.0, hip extension 1.0–1.6 and above 2.0 flexed, knee extension
 * 1.0–2.0 at 60–80° flexion, plantarflexion 0.5–2.0 N·m/(kg·m)) and with Anderson & Pandy (1999). Eccentric torque
 * plateaus near 1.25× isometric. Concentric torque follows Hill's hyperbola (A. V. Hill, *Proc. R. Soc. B* 126, 1938)
 * at joint level, where tendon compliance and moment arms flatten the muscle curve: `a/T₀ = 1` with an 18 rad/s knee
 * maximum gives 70% of isometric at 180°/s and 55% at 300°/s, as isokinetic knee-extension tests show
 * (A. Thorstensson, G. Grimby and J. Karlsson, *J. Appl. Physiol.* 40, 1976). Joint maximum velocities are those of
 * torque-generator models of jumping (M. A. King and M. R. Yeadon, *J. Appl. Biomech.* 18, 2002; 12–25 rad/s).
 */
export const YOUNG_MALE_STRENGTH: HumanJointStrength = {
  hipFlexion: { isometric: 1.5, optimalAngle: 0.2, angleWidth: 1.6, maxVelocity: 14 },
  hipExtension: { isometric: 1.8, optimalAngle: 1.2, angleWidth: 1.6, maxVelocity: 14 },
  kneeFlexion: { isometric: 0.9, optimalAngle: -0.6, angleWidth: 1.6, maxVelocity: 18 },
  kneeExtension: { isometric: 1.7, optimalAngle: -1.2, angleWidth: 1.4, maxVelocity: 18 },
  ankleDorsiflexion: { isometric: 0.4, optimalAngle: -0.2, angleWidth: 1.4, maxVelocity: 22 },
  anklePlantarflexion: { isometric: 1.4, optimalAngle: 0.2, angleWidth: 1.2, maxVelocity: 22 },
  eccentricRatio: 1.25,
  hillCurvature: 1,
};

/** Joints of the sagittal leg. */
export type LegJoint = "hip" | "knee" | "ankle";

function exertionFor(strength: HumanJointStrength, joint: LegJoint, positive: boolean): JointExertion {
  switch (joint) {
    case "hip":
      return positive ? strength.hipFlexion : strength.hipExtension;
    case "knee":
      return positive ? strength.kneeExtension : strength.kneeFlexion;
    case "ankle":
      return positive ? strength.ankleDorsiflexion : strength.anklePlantarflexion;
  }
}

/**
 * Largest torque magnitude the joint can produce in the direction of `sign` at `angle` (rad) and joint speed
 * `velocity` (rad/s), for a subject of `massTimesStature` (kg·m). Positive `sign` means the joint's positive
 * direction: hip flexion, knee extension, ankle dorsiflexion. Moving with the torque is concentric (Hill
 * hyperbola to zero at the maximum velocity); against it is eccentric (rising to the eccentric plateau).
 * @capability joint-torque-limits torque-angle-velocity strength of the human hip, knee and ankle from published dynamometry
 */
export function maxJointTorque(strength: HumanJointStrength, joint: LegJoint, sign: number, angle: number, velocity: number, massTimesStature: number): number {
  const exertion = exertionFor(strength, joint, sign > 0);
  const t0 = exertion.isometric * massTimesStature;
  const d = (angle - exertion.optimalAngle) / exertion.angleWidth;
  const angleFactor = Math.max(0.3, Math.exp(-d * d));
  const shortening = sign > 0 ? velocity : -velocity;
  let velocityFactor: number;
  if (shortening >= 0) {
    const r = Math.min(1, shortening / exertion.maxVelocity);
    velocityFactor = (1 - r) / (1 + r / strength.hillCurvature);
  } else {
    velocityFactor = 1 + (strength.eccentricRatio - 1) * (1 - Math.exp(-(-shortening) / (0.05 * exertion.maxVelocity)));
  }
  return t0 * angleFactor * velocityFactor;
}
