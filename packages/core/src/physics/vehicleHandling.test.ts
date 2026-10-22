import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS, type AxisInput } from "../input/axisInput";
import { createKinematicVehicle, type KinematicVehicle, type KinematicVehicleTuning } from "./kinematicVehicle";
import { createVehicleDamage, damagedTuning, type VehicleDamageZone } from "./vehicleDamage";

const DT = 1 / 60;

const CAR: KinematicVehicleTuning = {
  engineAccel: 22,
  brakeAccel: 32,
  topSpeed: 34,
  reverseSpeed: 8,
  turnRate: 2.1,
  turnSpeedRef: 9,
  gripStrength: 8,
  handbrakeGrip: 0.22,
};

const TARMAC = CAR;
const GRAVEL: KinematicVehicleTuning = {
  ...CAR,
  weightTransfer: { comHeight: 0.5, wheelbase: 2.6, trackWidth: 1.6 },
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
function scriptedLap(vehicle: KinematicVehicle): LapReport {
  const phases: readonly (readonly [number, AxisInput])[] = [
    [120, axis({ throttle: 1 })],
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
      const step = vehicle.tick(DT, input);
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

describe("a scripted lap on two surfaces", () => {
  test("the same inputs grip harder on tarmac than on gravel", () => {
    const tarmac = scriptedLap(createKinematicVehicle(TARMAC, { surfaceFriction: () => 1 }));
    const gravel = scriptedLap(createKinematicVehicle(TARMAC, { surfaceFriction: () => 0.45 }));

    // Less grip retains more slip, so the car slides through the same corner instead of tracking it.
    expect(gravel.peakSlip).toBeGreaterThan(tarmac.peakSlip * 3);
    expect(gravel.peakLateral).toBeGreaterThan(tarmac.peakLateral * 2);
    // Same drive, so the straight-line speed is untouched by surface grip.
    expect(gravel.topSpeed).toBeCloseTo(tarmac.topSpeed, 1);
  });
});

describe("weight transfer", () => {
  test("braking into a corner moves weight and costs grip", () => {
    const plain = createKinematicVehicle(TARMAC, { surfaceFriction: () => 1 });
    const transferring = createKinematicVehicle(GRAVEL, { surfaceFriction: () => 1 });
    for (let i = 0; i < 120; i += 1) {
      plain.tick(DT, axis({ throttle: 1 }));
      transferring.tick(DT, axis({ throttle: 1 }));
    }
    let transferStep = transferring.tick(DT, axis({ brake: 1, steer: 1 }));
    const plainStep = plain.tick(DT, axis({ brake: 1, steer: 1 }));
    expect(transferStep.weightTransfer).toBeGreaterThan(0);
    expect(transferStep.loadGrip).toBeLessThan(1);
    expect(transferStep.loadGrip).toBeLessThan(plainStep.loadGrip);

    let transferLateral = 0;
    let plainLateral = 0;
    for (let i = 0; i < 60; i += 1) {
      transferStep = transferring.tick(DT, axis({ brake: 1, steer: 1 }));
      transferLateral = Math.abs(transferStep.lateralSpeed);
      plainLateral = Math.abs(plain.tick(DT, axis({ brake: 1, steer: 1 })).lateralSpeed);
    }
    expect(transferLateral).toBeGreaterThan(plainLateral);
  });

  test("coasting through the same corner loses less grip than braking into it", () => {
    const vehicle = createKinematicVehicle(GRAVEL, { surfaceFriction: () => 1 });
    for (let i = 0; i < 120; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));
    // A moderate corner at a moderate brake keeps the two transfers off the cap, so the comparison
    // is the model talking rather than the clamp.
    const coasting = vehicle.tick(DT, axis({ steer: 0.2 }));
    const braking = vehicle.tick(DT, axis({ brake: 1, steer: 0.2 }));
    expect(braking.weightTransfer).toBeGreaterThan(coasting.weightTransfer);
    expect(braking.loadGrip).toBeLessThan(coasting.loadGrip);
  });

  test("a cornering load alone still moves weight and costs grip", () => {
    const vehicle = createKinematicVehicle(GRAVEL, { surfaceFriction: () => 1 });
    for (let i = 0; i < 180; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));
    const straight = vehicle.tick(DT, axis({ throttle: 1 }));
    const cornering = vehicle.tick(DT, axis({ throttle: 1, steer: 1 }));
    expect(straight.weightTransfer).toBeLessThan(0.05);
    expect(cornering.weightTransfer).toBeGreaterThan(straight.weightTransfer);
    expect(cornering.loadGrip).toBeLessThan(straight.loadGrip);
  });

  test("without the block the flat-grip model is unchanged", () => {
    const vehicle = createKinematicVehicle(TARMAC);
    for (let i = 0; i < 60; i += 1) vehicle.tick(DT, axis({ throttle: 1, steer: 1 }));
    const step = vehicle.tick(DT, axis({ throttle: 1, steer: 1 }));
    expect(step.weightTransfer).toBe(0);
    expect(step.loadGrip).toBe(1);
  });
});

describe("handbrake drift", () => {
  test("the handbrake breaks traction into a drift that steers back under control", () => {
    const drifting = createKinematicVehicle(TARMAC);
    const gripping = createKinematicVehicle(TARMAC);
    for (const vehicle of [drifting, gripping]) {
      for (let i = 0; i < 150; i += 1) vehicle.tick(DT, axis({ throttle: 1 }));
    }
    let driftSlip = 0;
    let gripSlip = 0;
    for (let i = 0; i < 40; i += 1) {
      driftSlip = Math.max(driftSlip, drifting.tick(DT, axis({ throttle: 1, steer: 1, handbrake: 1 })).slip);
      gripSlip = Math.max(gripSlip, gripping.tick(DT, axis({ throttle: 1, steer: 1 })).slip);
    }
    expect(driftSlip).toBeGreaterThan(gripSlip * 1.5);

    // Release: the slide is caught, not a spin — slip decays while the car keeps moving forward.
    let recovered = driftSlip;
    for (let i = 0; i < 90; i += 1) recovered = drifting.tick(DT, axis({ throttle: 1 })).slip;
    expect(recovered).toBeLessThan(driftSlip * 0.5);
    expect(Math.abs(drifting.tick(DT, axis({ throttle: 1 })).forwardSpeed)).toBeGreaterThan(1);
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

    const fresh = scriptedLap(createKinematicVehicle(CAR, { surfaceFriction: () => 1 }));
    const wrecked = createKinematicVehicle(CAR, { surfaceFriction: () => 1 });
    wrecked.retune(damagedTuning(CAR, effect));
    const damaged = scriptedLap(wrecked);

    // Slower to the same speed, and it slides more through the same corner.
    expect(damaged.topSpeed).toBeLessThan(fresh.topSpeed);
    expect(damaged.peakSlip).toBeGreaterThan(fresh.peakSlip);
    expect(damaged.peakLateral).toBeGreaterThan(fresh.peakLateral);
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
    const base = scriptedLap(createKinematicVehicle(CAR, { surfaceFriction: () => 1 }));

    const vehicle = createKinematicVehicle(CAR, { surfaceFriction: () => 1 });
    const modifiers = damage.modifiers();
    const phases: readonly (readonly [number, AxisInput])[] = [
      [120, axis({ throttle: 1 })],
      [150, axis({ throttle: 1, steer: 1 })],
    ];
    let topSpeed = 0;
    let peakSlip = 0;
    for (const [ticks, input] of phases) {
      for (let i = 0; i < ticks; i += 1) {
        const step = vehicle.tick(DT, input, modifiers);
        topSpeed = Math.max(topSpeed, step.forwardSpeed);
        peakSlip = Math.max(peakSlip, step.slip);
      }
    }
    expect(topSpeed).toBeLessThan(base.topSpeed);
    expect(peakSlip).toBeGreaterThan(base.peakSlip);
  });
});
