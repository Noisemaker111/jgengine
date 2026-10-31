// @skill jgengine-world
import { createHelicopterModel, type HelicopterDesign, type HelicopterModel, type HelicopterModelOptions } from "./helicopter";
import { naca23012RotorSection, type RotorDesign } from "./helicopterRotor";
import type { ReferenceGearLeg } from "./referenceAircraft";

const FT = 0.3048;
const DEG = Math.PI / 180;

/**
 * MBB Bo-105 main rotor from NASA TM-110356 (Peterson, 1995), table 1: hingeless, four blades, 16.11 ft radius,
 * 0.886 ft chord, −8° linear twist, 2.5° precone, 717 ft/s tip speed, NACA 23012. The hingeless blade is a centre
 * spring with Padfield's Bo-105 flap inertia (231.7 kg·m²) and stiffness (113 330 N·m/rad), a flap frequency of 1.12
 * per rev. The 20% root cutout is an estimate.
 */
export const BO105_MAIN_ROTOR: RotorDesign = {
  radius: 16.11 * FT,
  blades: 4,
  chord: 0.886 * FT,
  twist: -8 * DEG,
  rootCutout: 0.2,
  speed: 717 / 16.11,
  section: naca23012RotorSection,
  flap: { inertia: 231.7, stiffness: 113330, precone: 2.5 * DEG },
};

/** Bo-105 tail rotor: two blades, 0.95 m radius, 0.179 m chord, 233 rad/s, untwisted (Padfield's Bo-105 data). */
export const BO105_TAIL_ROTOR: RotorDesign = {
  radius: 0.95,
  blades: 2,
  chord: 0.179,
  twist: 0,
  rootCutout: 0.2,
  speed: 233.1,
  section: naca23012RotorSection,
  stations: 6,
  azimuths: 8,
};

function skid(name: string, x: number, y: number): ReferenceGearLeg {
  return { name, at: [x, y, 1.2], stiffness: 120000, damping: 12000, travel: 0.15, rollingFriction: 0.5, brakeFriction: 0, sideFriction: 0.5, corneringStiffness: 4, steering: 0 };
}

/**
 * The MBB Bo-105 at 2200 kg: Peterson's main rotor, Padfield's mass, inertia, hub and tail rotor placement (hub 1.48 m
 * above the centre of gravity, shaft tilted 3° forward, tail rotor 6 m aft), two Allison 250-C20B turboshafts at
 * 313 kW each, and a 1.2 m² drag area: the airframe drag the NASA wind-tunnel rotor was trimmed to carry in its
 * flight-matched runs (TM-110356 appendix D, propulsive force at μ ≥ 0.2). Control ranges, tail surfaces and skids
 * are estimates.
 */
export const BO105_DESIGN: HelicopterDesign = {
  name: "MBB Bo-105",
  mass: { massKg: 2200, ixx: 1433, iyy: 4973, izz: 4099, ixz: 660 },
  mainRotor: BO105_MAIN_ROTOR,
  hub: [0, 0, -1.48],
  shaftTilt: 3 * DEG,
  tailRotor: BO105_TAIL_ROTOR,
  tailHub: [-6.0, 0, -1.72],
  rotorInertia: 4 * 231.7,
  engine: { maxPower: 2 * 313000 },
  controls: {
    collective: [0, 16 * DEG],
    longitudinal: 10 * DEG,
    lateral: 8 * DEG,
    tailPitch: [7 * DEG, 14 * DEG],
    bandwidth: 25,
    rateLimit: 1,
  },
  fuselage: { dragArea: 1.2, sideArea: 6, verticalArea: 6 },
  tailplane: { area: 0.803, at: [-4.56, 0, 0], liftSlope: 4.5 },
  fin: { area: 0.805, at: [-5.42, 0, -0.98], liftSlope: 2.8, incidence: -4 * DEG },
  gear: [skid("left front", 1.0, -1.0), skid("right front", 1.0, 1.0), skid("left rear", -1.2, -1.0), skid("right rear", -1.2, 1.0)],
};

/**
 * Creates the Bo-105 reference helicopter.
 * @capability bo105-reference MBB Bo-105 reference helicopter validated against NASA TM-110356 rotor data
 */
export function createBo105Model(options: HelicopterModelOptions = {}): HelicopterModel {
  return createHelicopterModel(BO105_DESIGN, options);
}

/**
 * Bo-105 full-scale rotor hover data, NASA Ames 40×80 ft tunnel with the doors open, shaft at −10° (TM-110356
 * appendix B, run 12): advance ratio, `CT/σ` along the shaft and `CP/σ`.
 */
export const BO105_HOVER_DATA: readonly { advanceRatio: number; thrust: number; power: number }[] = [
  { advanceRatio: 0.004, thrust: 0.00891, power: 0.001216 },
  { advanceRatio: 0.007, thrust: 0.020515, power: 0.001638 },
  { advanceRatio: 0.0057, thrust: 0.029217, power: 0.002127 },
  { advanceRatio: 0.0064, thrust: 0.040033, power: 0.002796 },
  { advanceRatio: 0.0098, thrust: 0.048861, power: 0.003467 },
  { advanceRatio: 0.0064, thrust: 0.062266, power: 0.004456 },
  { advanceRatio: 0.0064, thrust: 0.070469, power: 0.00533 },
  { advanceRatio: 0.0133, thrust: 0.079549, power: 0.00629 },
  { advanceRatio: 0.018, thrust: 0.092887, power: 0.007722 },
  { advanceRatio: 0.0209, thrust: 0.101143, power: 0.008746 },
];

/**
 * Bo-105 full-scale rotor in the flight-matched wind-tunnel runs (TM-110356 appendix D, runs 43 and 46): advance ratio,
 * shaft angle (rad, aft positive), `CT/σ`, and `CP/σ` and longitudinal cyclic (rad) averaged over the repeat points.
 */
export const BO105_FORWARD_FLIGHT_DATA: readonly { advanceRatio: number; shaftAngle: number; thrust: number; power: number; longitudinalCyclic: number }[] = [
  { advanceRatio: 0.0975, shaftAngle: -2.5 * DEG, thrust: 0.07, power: 0.003167, longitudinalCyclic: -0.98 * DEG },
  { advanceRatio: 0.147, shaftAngle: -3.3 * DEG, thrust: 0.07, power: 0.002943, longitudinalCyclic: -1.53 * DEG },
  { advanceRatio: 0.1985, shaftAngle: -4.8 * DEG, thrust: 0.07, power: 0.003361, longitudinalCyclic: -2.39 * DEG },
  { advanceRatio: 0.2517, shaftAngle: -7.1 * DEG, thrust: 0.07, power: 0.004401, longitudinalCyclic: -3.6 * DEG },
  { advanceRatio: 0.3128, shaftAngle: -9.6 * DEG, thrust: 0.07, power: 0.006316, longitudinalCyclic: -5.43 * DEG },
  { advanceRatio: 0.1039, shaftAngle: -1.7 * DEG, thrust: 0.09, power: 0.004127, longitudinalCyclic: -1.18 * DEG },
  { advanceRatio: 0.1328, shaftAngle: -2.5 * DEG, thrust: 0.09, power: 0.003868, longitudinalCyclic: -1.64 * DEG },
  { advanceRatio: 0.1944, shaftAngle: -3.9 * DEG, thrust: 0.09, power: 0.004117, longitudinalCyclic: -2.93 * DEG },
];

/** Air density and tip Mach number of the TM-110356 runs. */
export const BO105_TUNNEL_AIR = { hoverDensity: 0.002404 * 515.379, forwardDensity: 0.00233 * 515.379, speedOfSound: (717 / 0.64) * FT };
