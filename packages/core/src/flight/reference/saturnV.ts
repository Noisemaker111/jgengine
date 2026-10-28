// @skill jgengine-world
import type { GravityTurnProgram, RocketDesign, RocketEngine, RocketLaunch } from "./rocket";

const DEG = Math.PI / 180;

/**
 * Rocketdyne F-1 as flown on AS-506, read from the flight evaluation report's S-IC stage performance (MPR-SAT-FE-69-9,
 * figure 5-3): 34.0 MN stage thrust at liftoff and about 39.8 MN near vacuum give 6.80 MN per engine at sea level and
 * 7.955 MN in vacuum, so an 11.4 m² exit area; the 2655 kg/s propellant flow per engine that empties the stage at
 * 161.6 s gives a vacuum specific impulse of 305.5 s.
 */
export const F1_ENGINE: RocketEngine = { thrust: [[0, 7.955e6], [300, 7.955e6]], specificImpulse: 305.5, exitArea: 11.4 };

/**
 * Saturn V AS-506 (Apollo 11) through the S-IC burn, from its flight evaluation report (MPR-SAT-FE-69-9, 1969, public
 * domain), tables 20-1 and 5-1: 2 899 008 kg at hold-down release, the S-IC's 2 071 716 kg of propellant used to
 * outboard engine cutoff and its 168 015 kg at cutoff (structure and residuals), the 659 277 kg upper stack, centre
 * engine cutoff at 135.2 s. Stage size is the published 42 m by 10.06 m; the axial-force coefficient through Mach,
 * normal-force slope, centre of pressure and gimbal station are estimates for a finned cylinder of this shape, not
 * measured Saturn V data.
 */
export const SATURN_V_AS506: RocketDesign = {
  name: "Saturn V AS-506 (S-IC flight)",
  stages: [
    {
      name: "S-IC",
      dryMass: 168015,
      propellant: 2071716,
      station: 0,
      length: 42,
      radius: 5.03,
      engines: [F1_ENGINE, F1_ENGINE, F1_ENGINE, F1_ENGINE, { ...F1_ENGINE, cutoff: 135.2 }],
      gimbalStation: 3,
      gimbal: 5.16 * DEG,
      aero: {
        area: Math.PI * 5.03 ** 2,
        axialForce: [
          [0, 0.3],
          [0.8, 0.32],
          [1, 0.45],
          [1.2, 0.52],
          [1.5, 0.48],
          [2, 0.4],
          [3, 0.32],
          [4, 0.28],
          [6, 0.24],
        ],
        normalForceSlope: 3,
        centerOfPressure: 60,
      },
    },
  ],
  payload: { mass: 659277, station: 42, length: 68.6, radius: 4.5 },
};

/** Launch Complex 39A, the Apollo 11 flight azimuth of 72.058°, the clock at hold-down release (0.3 s range time). */
export const SATURN_V_AS506_LAUNCH: RocketLaunch = { latitude: 28.6082 * DEG, longitude: -80.6041 * DEG, azimuth: 72.058 * DEG, time: 0.3 };

/**
 * A gravity turn standing in for the AS-506 tilt program: vertical to tower clearance and the roll, then a pitch-over
 * whose size is the one free parameter, chosen so the flight path angle at outboard engine cutoff matches the report.
 */
export const SATURN_V_AS506_ASCENT: GravityTurnProgram = { verticalRise: 12, kick: 1.55 * DEG, kickDuration: 10, azimuth: 72.058 * DEG };

/**
 * AS-506 measured trajectory events (MPR-SAT-FE-69-9 tables 4-1 and 4-2): times are range time, s; altitudes are
 * metres; velocities are space-fixed, m/s; flight path angles are space-fixed, rad; surface range, m.
 */
export const SATURN_V_AS506_EVENTS = {
  mach1: { time: 66.3, altitude: 7800 },
  maxDynamicPressure: { time: 83.0, pressure: 35200, altitude: 13600 },
  centerEngineCutoff: { time: 135.2, altitude: 44000, velocity: 1979.0, flightPathAngle: 22.957 * DEG, surfaceRange: 46400 },
  outboardEngineCutoff: { time: 161.63, altitude: 66100, velocity: 2764.1, flightPathAngle: 19.114 * DEG, surfaceRange: 93600 },
  /** Peak sensed acceleration, at outboard engine cutoff, m/s². */
  maxAcceleration: 38.61,
} as const;
