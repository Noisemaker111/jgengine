import type { AircraftTuning, KinematicVehicleTuning } from "@jgengine/core/world";

export type VehicleDynamics =
  | { type: "ground"; tuning: KinematicVehicleTuning }
  | { type: "aircraft"; tuning: AircraftTuning };

export interface VehicleDef {
  id: string;
  label: string;
  body: string;
  cabin: string;
  price: number;
  dynamics: VehicleDynamics;
}

const torqueCurve = { points: [[0, 0.55], [0.35, 0.88], [0.62, 1], [0.86, 0.9], [1, 0.58]] } as const;

function car(
  engineAccel: number,
  brakeAccel: number,
  topSpeed: number,
  reverseSpeed: number,
  gripStrength: number,
  handbrakeGrip: number,
  wheelbase: number,
): KinematicVehicleTuning {
  return {
    engineAccel,
    brakeAccel,
    topSpeed,
    reverseSpeed,
    turnRate: 2.3,
    turnSpeedRef: 7,
    gripStrength,
    handbrakeGrip,
    rollingResistance: 0.08,
    powertrain: {
      idleRpm: 850,
      redlineRpm: 7600,
      shiftUpRpm: 6900,
      shiftDownRpm: 2300,
      shiftSeconds: 0.14,
      finalDrive: 3.7,
      wheelRadius: 0.34,
      gears: [3.2, 2.18, 1.57, 1.21, 0.97, 0.8],
      torqueCurve,
    },
    steering: {
      wheelbase,
      maxAngle: 0.58,
      highSpeedAngle: 0.15,
      highSpeedAt: topSpeed,
      response: 10,
      yawDamping: 11,
    },
    dynamics: {
      aerodynamicDrag: 0.00045,
      downforce: 0.32,
      tractionControl: 0.72,
      abs: 0.82,
      stabilityControl: 0.42,
      bodyPitchFactor: 0.008,
      bodyRollFactor: 0.012,
      maxBodyPitch: 0.1,
      maxBodyRoll: 0.14,
      attitudeResponse: 8,
    },
  };
}

const flightControls = {
  pitch: 0.95,
  roll: 1.45,
  yaw: 0.62,
  response: 4.8,
  damping: 0.72,
  stability: 0.62,
} as const;

const helicopterControls = {
  pitch: 0.72,
  roll: 0.9,
  yaw: 1.05,
  response: 4,
  damping: 1.15,
  stability: 1.25,
} as const;

export const VEHICLES: readonly VehicleDef[] = [
  { id: "car_compact", label: "Pico", body: "#f2c14e", cabin: "#26292f", price: 800, dynamics: { type: "ground", tuning: car(16, 28, 24, 8, 10, 0.34, 2.42) } },
  { id: "car_muscle", label: "Bandolero", body: "#d64545", cabin: "#26292f", price: 2400, dynamics: { type: "ground", tuning: car(24, 34, 34, 9, 7.2, 0.2, 2.75) } },
  { id: "car_sport", label: "Cicada GT", body: "#33c1b1", cabin: "#1f2228", price: 6500, dynamics: { type: "ground", tuning: car(32, 40, 46, 11, 9.2, 0.18, 2.58) } },
  { id: "car_cop", label: "VCPD Cruiser", body: "#e8ecf2", cabin: "#1b2f52", price: 0, dynamics: { type: "ground", tuning: car(27, 38, 39, 10, 8.4, 0.2, 2.68) } },
  {
    id: "air_helicopter",
    label: "Maverick 44",
    body: "#e7e9ee",
    cabin: "#17202b",
    price: 12000,
    dynamics: { type: "aircraft", tuning: { kind: "rotorcraft", mass: 5.4, maxThrust: 19, maxSpeed: 62, drag: 0.032, sideDrag: 0.075, lift: 0, stallSpeed: 1, hoverThrust: 64, rotorResponse: 2.8, groundEffectHeight: 10, controls: helicopterControls } },
  },
  {
    id: "air_trainer",
    label: "Pelican Trainer",
    body: "#f4d35e",
    cabin: "#243447",
    price: 16000,
    dynamics: { type: "aircraft", tuning: { kind: "fixedWing", mass: 4.6, maxThrust: 45, maxSpeed: 78, drag: 0.019, sideDrag: 0.04, lift: 12.4, stallSpeed: 11, controls: { ...flightControls, stability: 1.05 } } },
  },
  {
    id: "air_prop",
    label: "Marlin Prop",
    body: "#e85d4a",
    cabin: "#e7f1f5",
    price: 26000,
    dynamics: { type: "aircraft", tuning: { kind: "fixedWing", mass: 5, maxThrust: 56, maxSpeed: 105, drag: 0.016, sideDrag: 0.035, lift: 13.2, stallSpeed: 14, controls: flightControls } },
  },
  {
    id: "air_jet",
    label: "Barracuda XR",
    body: "#697582",
    cabin: "#10151b",
    price: 90000,
    dynamics: { type: "aircraft", tuning: { kind: "fixedWing", mass: 6.8, maxThrust: 96, maxSpeed: 190, drag: 0.011, sideDrag: 0.024, lift: 15.5, stallSpeed: 25, afterburnerMultiplier: 1.55, controls: { ...flightControls, pitch: 1.25, roll: 2.05, yaw: 0.52, stability: 0.38 } } },
  },
  {
    id: "air_vtol",
    label: "Harrier V",
    body: "#3d5a45",
    cabin: "#111b18",
    price: 110000,
    dynamics: { type: "aircraft", tuning: { kind: "vtol", mass: 7.2, maxThrust: 88, maxSpeed: 155, drag: 0.014, sideDrag: 0.032, lift: 14.8, stallSpeed: 22, hoverThrust: 88, rotorResponse: 3.2, vtolTransitionSpeed: 38, afterburnerMultiplier: 1.35, controls: { ...flightControls, stability: 0.72 } } },
  },
];

export const vehicleById = (id: string): VehicleDef | undefined => VEHICLES.find((vehicle) => vehicle.id === id);

export function vehicleEntry() {
  return {
    role: "vehicle" as const,
    movement: { walkSpeed: 0 },
    stats: { health: { max: 300, min: 0 } },
    receive: { damage: { order: ["health"] } },
  };
}
