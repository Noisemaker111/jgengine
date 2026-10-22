import { describe, expect, test } from "bun:test";

import { createKinematicVehicle, type KinematicVehicleTuning } from "./kinematicVehicle";
import { applyVehicleParts, feelOf, withPart, type VehiclePart } from "./vehicleParts";
import { DEFAULT_GRIP_CURVE } from "./vehicleBody";
import { NEUTRAL_AXIS } from "../input/axisInput";

const DT = 1 / 60;

const BASE: KinematicVehicleTuning = {
  engineAccel: 20,
  brakeAccel: 30,
  topSpeed: 30,
  reverseSpeed: 8,
  turnRate: 2,
  turnSpeedRef: 8,
  gripStrength: 8,
  handbrakeGrip: 0.25,
};

const SLICK: VehiclePart = {
  id: "tires/hard",
  slot: "tires",
  gripCurve: { points: [[0, 0.92], [0.12, 0.88], [0.35, 0.55], [1, 0.38]] },
};

const ENGINE: VehiclePart = {
  id: "engine/v8",
  slot: "engine",
  effects: {
    engineAccel: { scale: 1.4 },
    topSpeed: { add: 8 },
  },
};

const BRAKES: VehiclePart = {
  id: "brakes/race",
  slot: "brakes",
  effects: { brakeAccel: { scale: 1.25 }, gripStrength: { scale: 1.05 } },
};

describe("applyVehicleParts", () => {
  test("scales then adds in install order and leaves the base untouched", () => {
    const setup = applyVehicleParts(BASE, [ENGINE, BRAKES]);
    expect(setup.tuning.engineAccel).toBeCloseTo(BASE.engineAccel * 1.4, 6);
    expect(setup.tuning.topSpeed).toBeCloseTo(BASE.topSpeed + 8, 6);
    expect(setup.tuning.brakeAccel).toBeCloseTo(BASE.brakeAccel * 1.25, 6);
    expect(setup.tuning.gripStrength).toBeCloseTo(BASE.gripStrength * 1.05, 6);
    expect(setup.parts).toEqual(["engine/v8", "brakes/race"]);
    // The base is a seed, never mutated, so one base can build several cars.
    expect(BASE.engineAccel).toBe(20);
    expect(BASE.topSpeed).toBe(30);
    expect(BASE.gripStrength).toBe(8);
  });

  test("a tire compound replaces the grip curve and moves the reported feel", () => {
    const stock = applyVehicleParts(BASE, []);
    const slick = applyVehicleParts(BASE, [SLICK]);
    expect(stock.tuning.grip).toBeUndefined();
    expect(slick.tuning.grip).toBe(SLICK.gripCurve);
    expect(slick.feel.peakGrip).toBeLessThan(stock.feel.peakGrip);
    expect(slick.feel.slideGrip).toBeLessThan(stock.feel.slideGrip);
    expect(slick.feel.peakSlip).not.toBeCloseTo(stock.feel.peakSlip, 3);
  });

  test("feelOf reads the curve's own shape, defaulting to the stock compound", () => {
    const feel = feelOf(BASE);
    expect(feel.peakGrip).toBe(1);
    expect(feel.peakSlip).toBeCloseTo(0.2, 6);
    expect(feel.slideGrip).toBeCloseTo(DEFAULT_GRIP_CURVE.points[3]![1], 6);
    expect(feel.topSpeed).toBe(30);
  });

  test("withPart swaps a slot in place, keeping install order stable", () => {
    const parts = [ENGINE, BRAKES];
    const swapped = withPart(parts, { id: "engine/i4", slot: "engine", effects: { engineAccel: { scale: 0.8 } } });
    expect(swapped.map((part) => part.id)).toEqual(["engine/i4", "brakes/race"]);
    const added = withPart(swapped, { id: "tires/soft", slot: "tires", effects: { gripStrength: { scale: 1.2 } } });
    expect(added.map((part) => part.id)).toEqual(["engine/i4", "brakes/race", "tires/soft"]);
  });
});

describe("vehicle parts change the numbers and the feel", () => {
  test("a built car accelerates harder and tops out higher than the stock car", () => {
    const stock = createKinematicVehicle(BASE);
    const built = createKinematicVehicle(applyVehicleParts(BASE, [ENGINE]).tuning);
    let stockSpeed = 0;
    let builtSpeed = 0;
    for (let i = 0; i < 240; i += 1) {
      stockSpeed = stock.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 }).forwardSpeed;
      builtSpeed = built.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 }).forwardSpeed;
    }
    expect(builtSpeed).toBeGreaterThan(stockSpeed);
  });

  test("a hard tire compound retains more lateral slip through the same corner", () => {
    const stock = createKinematicVehicle(BASE);
    const slick = createKinematicVehicle(applyVehicleParts(BASE, [SLICK]).tuning);
    const axis = { ...NEUTRAL_AXIS, throttle: 1, steer: 1 };
    for (let i = 0; i < 120; i += 1) {
      stock.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
      slick.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
    }
    let stockSlip = 0;
    let slickSlip = 0;
    for (let i = 0; i < 60; i += 1) {
      stockSlip = stock.tick(DT, axis).slip;
      slickSlip = slick.tick(DT, axis).slip;
    }
    expect(slickSlip).toBeGreaterThan(stockSlip);
  });

  test("installing parts mid-play retunes in place and keeps momentum", () => {
    const vehicle = createKinematicVehicle(BASE);
    for (let i = 0; i < 60; i += 1) vehicle.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
    const [vx, vz] = vehicle.velocity();
    vehicle.retune(applyVehicleParts(BASE, [ENGINE]).tuning);
    expect(vehicle.velocity()[0]).toBeCloseTo(vx, 9);
    expect(vehicle.velocity()[1]).toBeCloseTo(vz, 9);
  });
});
