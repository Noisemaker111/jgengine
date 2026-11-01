import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS, type AxisInput } from "../input/axisInput";
import { measureHandling } from "./handlingProbe";
import { createVehicleDamage, damagedSpec, type VehicleDamageZone } from "./vehicleDamage";
import { createVehicleDynamics, type VehicleDynamics } from "./vehicleDynamics";
import { vehicleTuning, type VehicleSpec } from "./vehicleSpec";

const DT = 1 / 60;

// Three deliberately different setups of grip, balance and aids: test fixtures that span the range, not presets.
const SETUPS = {
  forgiving: {
    tires: { grip: 1.5, drift: 0.15 },
    brakes: { abs: 1 },
    aids: { stability: 1, tractionControl: 0.6475 },
    steering: { selfAlign: 0.6375, steerRate: 4.4 },
    chassis: { bodyRoll: 0.4 },
  },
  raw: {
    tires: { grip: 1.05, drift: 0.25 },
    brakes: { abs: 0.25 },
    aids: { stability: 0.55, tractionControl: 0.153125 },
    steering: { selfAlign: 0.4, steerRate: 2.9 },
    chassis: { bodyRoll: 0.6 },
  },
  loose: {
    tires: { grip: 1.1, drift: 0.85 },
    brakes: { abs: 0.55 },
    aids: { stability: 0.73, tractionControl: 0.221375 },
    steering: { selfAlign: 0.655, steerRate: 3.5 },
    chassis: { bodyRoll: 0.6 },
  },
} as const satisfies Record<string, Pick<VehicleSpec, "tires" | "aids" | "chassis"> & { brakes: Pick<VehicleSpec["brakes"], "abs">; steering: Pick<VehicleSpec["steering"], "selfAlign" | "steerRate"> }>;

const CAR: VehicleSpec = {
  ...SETUPS.forgiving,
  engine: { topSpeed: 34, accel: 10 },
  brakes: { ...SETUPS.forgiving.brakes, brake: 14, handbrakeGrip: 0.22 },
  steering: { ...SETUPS.forgiving.steering, turnRate: 2.1, turnSpeed: 9 },
};

const axis = (partial: Partial<AxisInput>): AxisInput => ({ ...NEUTRAL_AXIS, ...partial });

interface LapReport {
  distance: number;
  headingTurned: number;
  peakSlip: number;
  peakLateral: number;
  topSpeed: number;
}

/** Drive a fixed script — a launch straight then a held full-lock corner — and report what the car did. */
function scriptedLap(vehicle: VehicleDynamics, modifiers?: Parameters<VehicleDynamics["tick"]>[2]): LapReport {
  const phases: readonly (readonly [number, AxisInput])[] = [
    [150, axis({ throttle: 1 })],
    [150, axis({ throttle: 1, steer: 1 })],
  ];
  let previous = vehicle.pose();
  let distance = 0;
  let headingTurned = 0;
  let peakSlip = 0;
  let peakLateral = 0;
  let topSpeed = 0;
  for (const [ticks, input] of phases) {
    for (let i = 0; i < ticks; i += 1) {
      const step = vehicle.tick(DT, input, modifiers);
      distance += Math.hypot(step.position[0] - previous.position[0], step.position[2] - previous.position[2]);
      headingTurned += Math.abs(step.heading - previous.heading);
      previous = { position: step.position, heading: step.heading };
      peakSlip = Math.max(peakSlip, step.slip);
      peakLateral = Math.max(peakLateral, Math.abs(step.lateralSpeed));
      topSpeed = Math.max(topSpeed, step.forwardSpeed);
    }
  }
  return { distance, headingTurned, peakSlip, peakLateral, topSpeed };
}

describe("the quality floor every setup keeps", () => {
  for (const [name, style] of Object.entries(SETUPS)) {
    test(`${name}: launches, grips, slides on the handbrake, and never spins on a held keyboard corner`, () => {
      const spec: VehicleSpec = { ...style, engine: { topSpeed: 40, accel: 8 }, brakes: { brake: 11 }, steering: { turnRate: 1.8 } };
      const report = measureHandling(() => createVehicleDynamics(vehicleTuning(spec)));
      expect(report.zeroTo100).toBeLessThan(6);
      expect(report.topSpeed).toBeGreaterThan(38);
      expect(report.maxLateralG).toBeGreaterThan(0.8);
      expect(report.turnIn).toBeLessThan(0.6);
      expect(report.spun).toBe(false);
      expect(report.powerSteerSpun).toBe(false);
      expect(report.handbrakePeakSideslipDeg).toBeGreaterThan(20);
      expect(report.handbrakeRecoverySeconds).toBeLessThan(3);
    });
  }

  test("the setups feel different: the forgiving one grips hardest, the loose one holds the biggest handbrake slide", () => {
    const withBase = (setup: (typeof SETUPS)[keyof typeof SETUPS]): VehicleSpec => ({
      ...setup,
      engine: { topSpeed: 40, accel: 8 },
      brakes: { ...setup.brakes, brake: 11 },
      steering: { ...setup.steering, turnRate: 1.8 },
    });
    const arcade = measureHandling(() => createVehicleDynamics(vehicleTuning(withBase(SETUPS.forgiving))));
    const sim = measureHandling(() => createVehicleDynamics(vehicleTuning(withBase(SETUPS.raw))));
    const drift = measureHandling(() => createVehicleDynamics(vehicleTuning(withBase(SETUPS.loose))));
    expect(arcade.maxLateralG).toBeGreaterThan(sim.maxLateralG);
    expect(drift.handbrakePeakSideslipDeg).toBeGreaterThan(arcade.handbrakePeakSideslipDeg);
    expect(drift.powerSteerPeakSideslipDeg).toBeGreaterThan(arcade.powerSteerPeakSideslipDeg);
  });
});

describe("a scripted lap on two surfaces", () => {
  test("the same inputs grip harder on tarmac than on gravel", () => {
    const tarmac = scriptedLap(createVehicleDynamics(vehicleTuning(CAR), { surfaceFriction: () => 1 }));
    const gravel = scriptedLap(createVehicleDynamics(vehicleTuning(CAR), { surfaceFriction: () => 0.45 }));
    // Less grip and the tires let go through the same corner, so the car turns less of it.
    expect(gravel.peakSlip).toBeGreaterThan(tarmac.peakSlip * 1.5);
    expect(gravel.headingTurned).toBeLessThan(tarmac.headingTurned);
  });
});

describe("weight transfer", () => {
  test("braking moves load onto the front axle, throttle onto the rear", () => {
    const car = createVehicleDynamics(vehicleTuning(CAR));
    let step = car.tick(DT, axis({ throttle: 1 }));
    for (let i = 0; i < 120; i += 1) step = car.tick(DT, axis({ throttle: 1 }));
    const accelerating = step;
    for (let i = 0; i < 20; i += 1) step = car.tick(DT, axis({ brake: 1 }));
    expect(step.frontLoad).toBeGreaterThan(accelerating.frontLoad);
    expect(step.rearLoad).toBeLessThan(accelerating.rearLoad);
  });

  test("a heavier body rolls more in the same corner when the spec says soft", () => {
    const stiff = createVehicleDynamics(vehicleTuning({ ...CAR, chassis: { bodyRoll: 0 } }));
    const soft = createVehicleDynamics(vehicleTuning({ ...CAR, chassis: { bodyRoll: 1 } }));
    let stiffRoll = 0;
    let softRoll = 0;
    for (let i = 0; i < 150; i += 1) {
      stiff.tick(DT, axis({ throttle: 1 }));
      soft.tick(DT, axis({ throttle: 1 }));
    }
    for (let i = 0; i < 60; i += 1) {
      stiffRoll = Math.max(stiffRoll, Math.abs(stiff.tick(DT, axis({ throttle: 0.5, steer: 0.6 })).bodyRoll));
      softRoll = Math.max(softRoll, Math.abs(soft.tick(DT, axis({ throttle: 0.5, steer: 0.6 })).bodyRoll));
    }
    expect(softRoll).toBeGreaterThan(stiffRoll * 2);
  });
});

describe("handbrake drift", () => {
  test("the handbrake breaks traction into a drift that steers back under control", () => {
    const drifting = createVehicleDynamics(vehicleTuning(CAR));
    const gripping = createVehicleDynamics(vehicleTuning(CAR));
    for (const vehicle of [drifting, gripping]) {
      for (let i = 0; i < 150; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));
    }
    let driftSlip = 0;
    let gripSlip = 0;
    for (let i = 0; i < 40; i += 1) {
      driftSlip = Math.max(driftSlip, drifting.tick(DT, axis({ throttle: 0.5, steer: 1, handbrake: 1 })).slip);
      gripSlip = Math.max(gripSlip, gripping.tick(DT, axis({ throttle: 0.5, steer: 1 })).slip);
    }
    expect(driftSlip).toBeGreaterThan(gripSlip * 1.5);

    // Release: the slide is caught, not a spin — slip decays while the car keeps moving forward.
    let recovered = driftSlip;
    for (let i = 0; i < 120; i += 1) recovered = drifting.tick(DT, axis({ throttle: 1 })).slip;
    expect(recovered).toBeLessThan(driftSlip * 0.5);
    expect(drifting.tick(DT, axis({ throttle: 1 })).forwardSpeed).toBeGreaterThan(1);
  });
});

const ZONES: readonly VehicleDamageZone[] = [
  {
    id: "front",
    at: [0, 0.4, 1.9],
    thresholds: [12, 30],
    deform: [0, -0.12, -0.4],
    effect: { gripScale: 0.55, engineScale: 0.7, topSpeedScale: 0.75, drag: 0.6 },
  },
  {
    id: "rear-left",
    at: [-0.9, 0.4, -1.8],
    thresholds: [10, 24, 45],
    detachStage: 3,
    deform: [-0.18, 0, 0.2],
    effect: { brakeScale: 0.6, steerPull: 0.06 },
  },
];

describe("damage before and after", () => {
  test("the same scripted lap produces a different outcome once the car is damaged", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    damage.hit([0, 0.4, 1.9], 40);
    damage.hit([-0.9, 0.4, -1.8], 30);
    const effect = damage.effect();
    expect(damage.deformation().length).toBe(2);

    const fresh = scriptedLap(createVehicleDynamics(vehicleTuning(CAR)));
    const wrecked = createVehicleDynamics(vehicleTuning(CAR));
    wrecked.retune(vehicleTuning(damagedSpec(CAR, effect)));
    const damaged = scriptedLap(wrecked);

    // Slower to the same point, and it slides more through the same corner.
    expect(damaged.topSpeed).toBeLessThan(fresh.topSpeed);
    expect(damaged.peakSlip).toBeGreaterThan(fresh.peakSlip);
  });

  test("the dent the renderer shows stays inside each zone's limit", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    damage.hit([0, 0.4, 1.9], 1000);
    damage.hit([-0.9, 0.4, -1.8], 1000);
    for (const entry of damage.deformation()) {
      const zone = ZONES.find((candidate) => candidate.id === entry.zoneId)!;
      const limit = zone.deform!;
      expect(Math.abs(entry.offset[0])).toBeLessThanOrEqual(Math.abs(limit[0]) + 1e-9);
      expect(Math.abs(entry.offset[1])).toBeLessThanOrEqual(Math.abs(limit[1]) + 1e-9);
      expect(Math.abs(entry.offset[2])).toBeLessThanOrEqual(Math.abs(limit[2]) + 1e-9);
    }
    expect(damage.deformation().find((entry) => entry.zoneId === "rear-left")!.detached).toBe(true);
  });

  test("per-tick damage modifiers change the outcome without a retune", () => {
    const damage = createVehicleDamage({ zones: ZONES });
    damage.hit([0, 0.4, 1.9], 40);
    const base = scriptedLap(createVehicleDynamics(vehicleTuning(CAR)));
    const hurt = scriptedLap(createVehicleDynamics(vehicleTuning(CAR)), damage.modifiers());
    expect(hurt.topSpeed).toBeLessThan(base.topSpeed);
    expect(hurt.peakSlip).toBeGreaterThan(base.peakSlip);
  });
});
