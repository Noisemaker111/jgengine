import { describe, expect, test } from "bun:test";

import { createBoatDynamics, type BoatTuning } from "./boatDynamics";
import { measureHandling, measureLean, measureRide, type HandlingReport } from "./handlingProbe";
import { createVehicleDynamics, type VehicleDynamicsTuning, type VehicleGearboxTuning } from "./vehicleDynamics";

// Seven compositions of the same fields. Test fixtures, not presets: they prove the probes tell apart the
// vehicles an open-world game mixes, each from its physical numbers.

const roadGearbox: VehicleGearboxTuning = {
  kind: "gearbox",
  peakTorque: 320,
  torqueCurve: { points: [[0, 0.6], [0.5, 1], [0.85, 0.92], [1, 0.72]] },
  idleRpm: 850,
  redlineRpm: 6500,
  shiftUpRpm: 6100,
  shiftDownRpm: 2600,
  shiftSeconds: 0.25,
  gears: [3.5, 2.1, 1.45, 1.1, 0.9, 0.75],
  reverseGear: 3.3,
  finalDrive: 3.9,
  wheelRadius: 0.32,
};

const car: VehicleDynamicsTuning = {
  massKg: 1400,
  wheelbase: 2.65,
  frontWeight: 0.58,
  comHeight: 0.55,
  trackWidth: 1.55,
  front: { peakGrip: 0.95, peakSlipAngle: 0.14, slideGrip: 0.75 },
  rear: { peakGrip: 1.0, peakSlipAngle: 0.15, slideGrip: 0.78 },
  driveFront: 1,
  powertrain: roadGearbox,
  brakeForce: 14000,
  steering: { maxAngle: 0.6, highSpeedAngle: 0.14, highSpeedAt: 30, rate: 3, returnRate: 5, selfAlign: 0.6 },
  assists: { abs: 1, tractionControl: 0.6, stability: 0.8, maxSideslip: 0.25 },
  aero: { dragArea: 0.7 },
};

const kart: VehicleDynamicsTuning = {
  massKg: 160,
  wheelbase: 1.05,
  frontWeight: 0.42,
  comHeight: 0.25,
  trackWidth: 1.2,
  yawInertiaIndex: 0.6,
  front: { peakGrip: 1.3, peakSlipAngle: 0.1, slideGrip: 0.85 },
  driveFront: 0,
  powertrain: { kind: "direct", maxForce: 1300, maxPower: 11000, reverseScale: 0, coastForce: 60 },
  brakeForce: 2200,
  steering: { maxAngle: 0.5, highSpeedAngle: 0.35, highSpeedAt: 22, rate: 9, selfAlign: 0.2 },
  speedLimit: 24,
  aero: { dragArea: 0.45 },
};

const rally: VehicleDynamicsTuning = {
  massKg: 1250,
  wheelbase: 2.5,
  frontWeight: 0.55,
  comHeight: 0.5,
  trackWidth: 1.55,
  front: { peakGrip: 0.78, peakSlipAngle: 0.2, slideGrip: 0.72 },
  rear: { peakGrip: 0.74, peakSlipAngle: 0.22, slideGrip: 0.68 },
  driveFront: 0.45,
  powertrain: { ...roadGearbox, peakTorque: 420, shiftSeconds: 0.08, gears: [3.2, 2.2, 1.65, 1.3, 1.05, 0.88] },
  brakeForce: 13000,
  handbrakeGrip: 0.2,
  steering: { maxAngle: 0.7, highSpeedAngle: 0.3, highSpeedAt: 30, rate: 5, returnRate: 6, selfAlign: 0.8 },
  assists: { abs: 0.5 },
  aero: { dragArea: 0.75 },
  suspension: { springRate: 30000, damperRate: 3200, travel: 0.25, rideHeight: 0.55, antiRoll: 12000 },
};

const sim: VehicleDynamicsTuning = {
  massKg: 1300,
  wheelbase: 2.6,
  frontWeight: 0.45,
  comHeight: 0.4,
  trackWidth: 1.65,
  front: { peakGrip: 1.35, peakSlipAngle: 0.09, slideGrip: 0.7 },
  rear: { peakGrip: 1.4, peakSlipAngle: 0.1, slideGrip: 0.68 },
  driveFront: 0,
  powertrain: { ...roadGearbox, peakTorque: 520, redlineRpm: 8200, shiftUpRpm: 7900, shiftDownRpm: 3800, shiftSeconds: 0.06 },
  brakeForce: 22000,
  steering: { maxAngle: 0.5, highSpeedAngle: 0.1, highSpeedAt: 40, rate: 4, returnRate: 5, selfAlign: 0.3 },
  aero: { dragArea: 0.6, downforceArea: 1.2 },
  suspension: { springRate: 90000, damperRate: 7000, travel: 0.08, rideHeight: 0.35, antiRoll: 60000 },
};

const monsterTruck: VehicleDynamicsTuning = {
  massKg: 4500,
  wheelbase: 3.4,
  frontWeight: 0.5,
  comHeight: 1.6,
  trackWidth: 2.9,
  front: { peakGrip: 0.9, peakSlipAngle: 0.2, slideGrip: 0.7 },
  driveFront: 0.5,
  powertrain: {
    ...roadGearbox,
    peakTorque: 1500,
    redlineRpm: 5200,
    shiftUpRpm: 4900,
    shiftDownRpm: 2000,
    gears: [3.0, 2.0, 1.4, 1.0],
    finalDrive: 15.5,
    wheelRadius: 0.8,
  },
  brakeForce: 32000,
  steering: { maxAngle: 0.55, highSpeedAngle: 0.25, highSpeedAt: 25, rate: 2, returnRate: 3, selfAlign: 0.4 },
  assists: { stability: 0.6, maxSideslip: 0.3 },
  aero: { dragArea: 4.5 },
  suspension: { springRate: 70000, damperRate: 9000, travel: 0.6, rideHeight: 1.2, antiRoll: 20000 },
};

const motorcycle: VehicleDynamicsTuning = {
  massKg: 230,
  wheelbase: 1.42,
  frontWeight: 0.5,
  comHeight: 0.65,
  trackWidth: 0.2,
  front: { peakGrip: 1.2, peakSlipAngle: 0.09, slideGrip: 0.72 },
  driveFront: 0,
  powertrain: {
    ...roadGearbox,
    peakTorque: 110,
    redlineRpm: 12000,
    shiftUpRpm: 11500,
    shiftDownRpm: 6000,
    idleRpm: 1400,
    gears: [2.6, 1.9, 1.5, 1.25, 1.08, 0.96],
    finalDrive: 6.5,
    wheelRadius: 0.31,
  },
  brakeForce: 3800,
  steering: { maxAngle: 0.5, highSpeedAngle: 0.5, highSpeedAt: 30, rate: 3 },
  lean: { maxLean: 0.85, leanRate: 4 },
  assists: { abs: 1, tractionControl: 0.6, antiWheelie: 1, antiStoppie: 1 },
  aero: { dragArea: 0.35 },
};

const boat: BoatTuning = { massKg: 900, length: 6, beam: 2.3, maxThrust: 7000, propSpeed: 30, planingSpeed: 8, steering: { kind: "outboard" } };

const WHEELED = { car, kart, rally, sim, monsterTruck, motorcycle } as const;

function reports(): Record<keyof typeof WHEELED | "boat", HandlingReport> {
  const out = {} as Record<keyof typeof WHEELED | "boat", HandlingReport>;
  for (const [name, tuning] of Object.entries(WHEELED)) {
    out[name as keyof typeof WHEELED] = measureHandling(() => createVehicleDynamics(tuning), { cornerSpeed: 18 });
  }
  out.boat = measureHandling(() => createBoatDynamics(boat), { cornerSpeed: 15 });
  return out;
}

const RIDE = { car: { ...car, suspension: { springRate: 30000, damperRate: 3000, travel: 0.15, rideHeight: 0.5, antiRoll: 15000 } }, rally, sim, monsterTruck };

function argBest<K extends string>(values: Record<K, number>, pick: "min" | "max"): K {
  const entries = Object.entries(values) as [K, number][];
  return entries.reduce((best, entry) => ((pick === "min" ? entry[1] < best[1] : entry[1] > best[1]) ? entry : best))[0];
}

function column<K extends string>(source: Record<K, HandlingReport>, metric: keyof HandlingReport): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of Object.keys(source) as K[]) out[key] = Number(source[key][metric]);
  return out;
}

describe("measureHandling, measureRide and measureLean tell seven compositions apart", () => {
  const all = reports();
  const ride = Object.fromEntries(
    Object.entries(RIDE).map(([name, tuning]) => [name, measureRide(() => createVehicleDynamics(tuning))]),
  ) as Record<keyof typeof RIDE, ReturnType<typeof measureRide>>;
  const lean = Object.fromEntries(
    Object.entries(WHEELED).map(([name, tuning]) => [name, measureLean(() => createVehicleDynamics(tuning)).steadyLeanDeg]),
  ) as Record<keyof typeof WHEELED, number>;
  const { boat: boatReport, ...wheeled } = all;
  const { motorcycle: _bike, ...fourWheeled } = wheeled;

  test("kart: lowest top speed and the quickest turn-in, never reaches 100 km/h", () => {
    expect(argBest(column(wheeled, "topSpeed"), "min")).toBe("kart");
    expect(argBest(column(wheeled, "turnIn"), "min")).toBe("kart");
    expect(all.kart.zeroTo100).toBe(Infinity);
  });

  test("sim: most lateral g, shortest stop, stiffest ride, and it spins under full throttle and steer with no assists", () => {
    expect(argBest(column(wheeled, "maxLateralG"), "max")).toBe("sim");
    expect(argBest(column(wheeled, "brake100To0"), "min")).toBe("sim");
    expect(argBest(Object.fromEntries(Object.entries(ride).map(([k, v]) => [k, v.rollGradient])), "min")).toBe("sim");
    expect(all.sim.powerSteerSpun).toBe(true);
  });

  test("car: forgiving — never spins, catches a handbrake slide, barely slips on held keys", () => {
    expect(all.car.spun).toBe(false);
    expect(all.car.powerSteerSpun).toBe(false);
    expect(all.car.powerSteerPeakSideslipDeg).toBeLessThan(5);
    expect(all.car.handbrakeRecoverySeconds).toBeLessThan(2);
    expect(all.car.maxLateralG).toBeGreaterThan(all.rally.maxLateralG);
    expect(all.car.maxLateralG).toBeLessThan(all.sim.maxLateralG);
  });

  test("rally: loose surface grip, and the step steer drifts wider than any other car without spinning", () => {
    expect(argBest(column(fourWheeled, "maxLateralG"), "min")).toBe("rally");
    expect(argBest(column(wheeled, "stepPeakSideslipDeg"), "max")).toBe("rally");
    expect(all.rally.spun).toBe(false);
    expect(all.rally.stepPeakSideslipDeg).toBeGreaterThan(20);
  });

  test("monster truck: the body rolls and dives the most", () => {
    const rideColumn = (metric: "rollGradient" | "brakeDiveDeg") =>
      Object.fromEntries(Object.entries(ride).map(([k, v]) => [k, v[metric]]));
    expect(argBest(rideColumn("rollGradient"), "max")).toBe("monsterTruck");
    expect(argBest(rideColumn("brakeDiveDeg"), "max")).toBe("monsterTruck");
  });

  test("motorcycle: the only composition that leans, and leaning makes it the slowest wheeled vehicle to turn in", () => {
    expect(lean.motorcycle).toBeGreaterThan(30);
    for (const [name, degrees] of Object.entries(lean)) if (name !== "motorcycle") expect(degrees).toBe(0);
    expect(argBest(column(wheeled, "turnIn"), "max")).toBe("motorcycle");
  });

  test("boat: least lateral g, pushes wide off the throttle, and the handbrake does nothing", () => {
    expect(argBest(column(all, "maxLateralG"), "min")).toBe("boat");
    expect(argBest(column(all, "liftOffYawGain"), "min")).toBe("boat");
    expect(boatReport.liftOffYawGain).toBeLessThan(1);
    expect(boatReport.handbrakePeakSideslipDeg).toBe(0);
  });
});
