import { SPORT_FRONT_120_70_ZR17, SPORT_REAR_180_55_ZR17 } from "./motorcycleTire";
import type { ReferenceMotorcycleSpec } from "./referenceMotorcycle";

/** Published figures a reference motorcycle is checked against, with where each came from. */
export interface PublishedMotorcyclePerformance {
  zeroTo100: number;
  zeroTo200: number;
  /** 100–0 km/h braking distance, m. */
  brake100: number;
  /** Mass as tested (full tank, no rider), kg. */
  testedMass: number;
  sources: readonly string[];
}

/** A real motorcycle: the multibody spec and its published performance. */
export interface RealMotorcycle {
  name: string;
  spec: ReferenceMotorcycleSpec;
  published: PublishedMotorcyclePerformance;
  /** Which spec values are estimates rather than published. */
  estimates: readonly string[];
}

/**
 * Suzuki GSX-R1000 K1 (2001) with a prone rider, the machine of Sharp, Evangelou & Limebeer, "Advances in the
 * modelling of motorcycle dynamics", *Multibody System Dynamics* 12 (2004) 251–283, Appendix tables A.I–A.VIII:
 * masses, inertias, geometry, stops, stiffness, damping and aerodynamics as published, tyres from their section 3.
 * This is their nominal machine (250.65 kg with the rider, no extra fuel).
 */
export const GSXR1000_SHARP_2004: ReferenceMotorcycleSpec = {
  rake: 0.4189,
  steerAxisPoint: [1.164, -0.77],
  twistAxisPoint: [1.173, -0.749],
  forkSlidePoint: [1.342, -0.426],
  swingArmPivot: [0.549, -0.3608],
  riderLeanPivot: [0.364, -0.8438],
  aeroPoint: [0.7, 0],
  mainFrame: { mass: 165.13, com: [0.6779, -0.4724], ixx: 11.085, iyy: 22.013, izz: 14.982, ixz: -3.691 },
  riderUpperBody: { mass: 33.68, com: [0.415, -1.14], ixx: 1.428, iyy: 1.347, izz: 0.916, ixz: 0.443 },
  steering: { mass: 9.99, com: [1.164, -0.77], ixx: 1.341, iyy: 1.584, izz: 0.4125, ixz: 0, axes: "steer" },
  lowerFork: { mass: 7.25, com: [1.365, -0.324] },
  swingArm: { mass: 8, com: [0.196, -0.3113], ixx: 0.02, iyy: 0.259, izz: 0.259, ixz: 0 },
  front: { mass: 11.9, center: [1.41, -0.282], ixx: 0.27, iyy: 0.484, tire: SPORT_FRONT_120_70_ZR17, crownRadius: 0.06, radialStiffness: 130000 },
  rear: { mass: 14.7, center: [0, -0.297], ixx: 0.383, iyy: 0.638, tire: SPORT_REAR_180_55_ZR17, crownRadius: 0.095, radialStiffness: 141000 },
  frontSuspension: { stiffness: 25000, damping: 2134, extension: 0.03, compression: 0.07, stopStiffness: 1e11 },
  rearSuspension: {
    shockTop: [0.487, -0.4888],
    rockerPivot: [0.539, -0.1878],
    rockerToRod: [0.4946, -0.1522],
    rockerToShock: [0.4443, -0.1782],
    rodToSwingArm: [0.3722, -0.2748],
    freeLength: 0.3435,
    stiffness: 58570,
    damping: 11650,
    minLength: 0.2735,
    maxLength: 0.3385,
    bumpStop: 1e11,
    reboundStop: 1e15,
  },
  steeringSystem: { damping: 6.944, stiffness: 0, lock: 0.5061, stopStiffness: 3e9 },
  frameTwist: { stiffness: 1e5, damping: 100 },
  riderLean: { stiffness: 380, damping: 34 },
  aero: { drag: 0.48, lift: 0.078, pitch: 0.189, area: 0.65, density: 1.225 },
  powertrain: {
    // Peaks as claimed (160 PS at 10,800 rpm, 110 N·m at 8,500 rpm); the curve between them is an estimate.
    torqueCurve: [
      [1000, 45],
      [3000, 70],
      [5000, 86],
      [7000, 100],
      [8500, 110],
      [10000, 107],
      [10800, 104],
      [12000, 93],
      [13000, 80],
    ],
    idleRpm: 1200,
    redlineRpm: 12800,
    inertia: 0.03,
    primary: 1.553,
    ratios: [2.687, 2.052, 1.681, 1.45, 1.304, 1.208],
    finalDrive: 42 / 17,
  },
  brakes: { front: 3200, rear: 700 },
};

/** Real motorcycles with published tests, each with its reference multibody spec. */
export const REAL_MOTORCYCLES: readonly RealMotorcycle[] = [
  {
    name: "Suzuki GSX-R1000 K1",
    // Fuel and fluids beyond Sharp et al.'s machine, up to MOTORRAD's 201 kg wet weight, carried at the tank.
    spec: { ...GSXR1000_SHARP_2004, payload: { mass: 24, position: [0.8, -0.8] } },
    published: {
      zeroTo100: 2.9,
      zeroTo200: 7.3,
      brake100: 38.6,
      testedMass: 201,
      sources: [
        "MOTORRAD Top-Test Suzuki GSX-R 1000 (W. Koch, 13.02.2001): 0-100 2.9 s, 0-200 7.3 s, 100-0 38.6 m, 201 kg, 52/48",
        "Sharp, Evangelou & Limebeer, Multibody System Dynamics 12 (2004) Appendix: machine and rider",
        "Suzuki GSX-R1000 K1 service data (bikeswiki): primary 1.553, gears 2.687/2.052/1.681/1.450/1.304/1.208, final 17/42",
      ],
    },
    estimates: ["torque curve between the claimed peaks", "engine and clutch inertia 0.03 kg·m²", "brake torque capacity", "aero centre (Figure 1)", "24 kg fuel and fluids at the tank", "tyre longitudinal relaxation 0.1 m"],
  },
];
