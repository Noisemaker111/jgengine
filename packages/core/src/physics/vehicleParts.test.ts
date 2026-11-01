import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS } from "../input/axisInput";
import { DEFAULT_GRIP_CURVE } from "./gripCurve";
import { createVehicleDynamics } from "./vehicleDynamics";
import { applyVehicleParts, feelOf, withPart, type VehiclePart } from "./vehicleParts";
import { vehicleTuning, type VehicleSpec } from "./vehicleSpec";

const DT = 1 / 60;

const BASE: VehicleSpec = {
  engine: { topSpeed: 30, accel: 8 },
  brakes: { brake: 9, handbrakeGrip: 0.25 },
  steering: { turnRate: 1.6 },
  tires: { grip: 1.1 },
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
    accel: { scale: 1.4 },
    topSpeed: { add: 8 },
  },
};

const BRAKES: VehiclePart = {
  id: "brakes/race",
  slot: "brakes",
  effects: { brake: { scale: 1.25 }, grip: { scale: 1.05 } },
};

describe("applyVehicleParts", () => {
  test("scales then adds in install order and leaves the base untouched", () => {
    const setup = applyVehicleParts(BASE, [ENGINE, BRAKES]);
    expect(setup.spec.engine.accel).toBeCloseTo(BASE.engine.accel * 1.4, 6);
    expect(setup.spec.engine.topSpeed).toBeCloseTo(BASE.engine.topSpeed + 8, 6);
    expect(setup.spec.brakes.brake).toBeCloseTo(BASE.brakes.brake * 1.25, 6);
    expect(setup.spec.tires.grip).toBeCloseTo(BASE.tires.grip * 1.05, 6);
    expect(setup.parts).toEqual(["engine/v8", "brakes/race"]);
    // The base is a seed, never mutated, so one base can build several cars.
    expect(BASE.engine.accel).toBe(8);
    expect(BASE.engine.topSpeed).toBe(30);
    expect(BASE.tires.grip).toBe(1.1);
  });

  test("an effect on an unset stat starts from the spec's default", () => {
    const setup = applyVehicleParts(BASE, [{ id: "ballast", slot: "body", effects: { weight: { add: 200 }, drift: { add: 0.3 } } }]);
    expect(setup.spec.chassis?.weight).toBe(1500);
    expect(setup.spec.tires.drift).toBeCloseTo(0.5, 6);
  });

  test("a tire compound replaces the grip curve and moves the reported feel", () => {
    const stock = applyVehicleParts(BASE, []);
    const slick = applyVehicleParts(BASE, [SLICK]);
    expect(stock.spec.tires.gripCurve).toBeUndefined();
    expect(slick.spec.tires.gripCurve).toBe(SLICK.gripCurve);
    expect(slick.feel.peakGrip).toBeLessThan(stock.feel.peakGrip);
    expect(slick.feel.slideGrip).toBeLessThan(stock.feel.slideGrip);
    expect(slick.feel.peakSlip).not.toBeCloseTo(stock.feel.peakSlip, 3);
  });

  test("feelOf reads the curve's own shape, defaulting to the stock compound", () => {
    const feel = feelOf(BASE);
    expect(feel.peakGrip).toBeCloseTo(1.1, 6);
    expect(feel.peakSlip).toBeCloseTo(0.2, 6);
    expect(feel.slideGrip).toBeCloseTo(DEFAULT_GRIP_CURVE.points[3]![1], 6);
    expect(feel.topSpeed).toBe(30);
  });

  test("withPart swaps a slot in place, keeping install order stable", () => {
    const parts = [ENGINE, BRAKES];
    const swapped = withPart(parts, { id: "engine/i4", slot: "engine", effects: { accel: { scale: 0.8 } } });
    expect(swapped.map((part) => part.id)).toEqual(["engine/i4", "brakes/race"]);
    const added = withPart(swapped, { id: "tires/soft", slot: "tires", effects: { grip: { scale: 1.2 } } });
    expect(added.map((part) => part.id)).toEqual(["engine/i4", "brakes/race", "tires/soft"]);
  });
});

describe("vehicle parts change the numbers and the feel", () => {
  test("a built car accelerates harder and tops out higher than the stock car", () => {
    const stock = createVehicleDynamics(vehicleTuning(BASE));
    const built = createVehicleDynamics(vehicleTuning(applyVehicleParts(BASE, [ENGINE]).spec));
    let stockSpeed = 0;
    let builtSpeed = 0;
    for (let i = 0; i < 240; i += 1) {
      stockSpeed = stock.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 }).motion.forwardSpeed;
      builtSpeed = built.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 }).motion.forwardSpeed;
    }
    expect(builtSpeed).toBeGreaterThan(stockSpeed);
  });

  test("a hard tire compound slides further through the same corner", () => {
    const stock = createVehicleDynamics(vehicleTuning(BASE));
    const slick = createVehicleDynamics(vehicleTuning(applyVehicleParts(BASE, [SLICK]).spec));
    for (let i = 0; i < 150; i += 1) {
      stock.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
      slick.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
    }
    let stockSlip = 0;
    let slickSlip = 0;
    const axis = { ...NEUTRAL_AXIS, throttle: 1, steer: 1 };
    for (let i = 0; i < 60; i += 1) {
      stockSlip = Math.max(stockSlip, stock.tick(DT, axis).tires.slip);
      slickSlip = Math.max(slickSlip, slick.tick(DT, axis).tires.slip);
    }
    expect(slickSlip).toBeGreaterThan(stockSlip);
  });

  test("installing parts mid-play retunes in place and keeps momentum", () => {
    const vehicle = createVehicleDynamics(vehicleTuning(BASE));
    for (let i = 0; i < 60; i += 1) vehicle.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
    const [vx, vz] = vehicle.velocity();
    vehicle.retune(vehicleTuning(applyVehicleParts(BASE, [ENGINE]).spec));
    expect(vehicle.velocity()[0]).toBeCloseTo(vx, 9);
    expect(vehicle.velocity()[1]).toBeCloseTo(vz, 9);
  });
});
