import { describe, expect, test } from "bun:test";

import { measureHandling } from "./handlingProbe";
import { CAR_CLASS_IDS, CAR_REFERENCE_IDS, carFromReference, type CarOverrides } from "./carReferences";
import { createVehicleDynamics } from "./vehicleDynamics";

describe("carFromReference", () => {
  test("every id gives a car that drives: finite, launches, stops", () => {
    for (const id of CAR_REFERENCE_IDS) {
      const metrics = measureHandling(() => createVehicleDynamics(carFromReference(id)));
      expect(Number.isFinite(metrics.topSpeed)).toBe(true);
      expect(metrics.topSpeed).toBeGreaterThan(15);
      expect(metrics.maxLateralG).toBeGreaterThan(0.3);
    }
    expect(CAR_CLASS_IDS).toContain("truck");
  }, 60000);

  test("every effect a published car has data for is on at strength 1", () => {
    const effects = carFromReference("mazda-mx5-nd").effects ?? {};
    for (const name of ["magicFormula", "longitudinalLoadTransfer", "lateralLoadTransfer", "suspensionKinematics", "aligningTorque", "aeroDrag", "rollingResistance", "torqueCurve", "brakeFade", "roadFriction"] as const) {
      expect(effects[name]).toBeDefined();
      expect(effects[name]?.strength ?? 1).toBe(1);
    }
  });

  test("overrides retune a vehicle's numbers and effects, and false switches an effect off", () => {
    const tuned = carFromReference("mazda-mx5-nd", { massKg: 1200, effects: { aeroDrag: { area: 0.7 }, brakeFade: false, roadFriction: { friction: 0.6 } } });
    expect(tuned.massKg).toBe(1200);
    expect(tuned.effects?.aeroDrag).toEqual({ area: 0.7, sideArea: 2.4 });
    expect(tuned.effects?.brakeFade).toBeUndefined();
    expect(tuned.effects?.roadFriction?.friction).toBe(0.6);
    expect(carFromReference("mazda-mx5-nd").effects?.aeroDrag?.area).toBe(0.6);
  });

  test("a fleet is data: ten cars from one class with a few overrides each, all different, no new code", () => {
    const fleet: CarOverrides[] = Array.from({ length: 10 }, (_, i) => ({
      massKg: 1000 + 60 * i,
      effects: {
        torqueCurve: { scale: 0.8 + 0.06 * i },
        aeroDrag: { area: 0.55 + 0.03 * i },
        magicFormula: { grip: 0.9 + 0.025 * i },
      },
    }));
    const results = fleet.map((overrides) => measureHandling(() => createVehicleDynamics(carFromReference("sports-car", overrides))));
    for (const metrics of results) {
      expect(Number.isFinite(metrics.zeroTo100)).toBe(true);
      expect(metrics.topSpeed * 3.6).toBeGreaterThan(150);
      expect(metrics.topSpeed * 3.6).toBeLessThan(260);
    }
    expect(new Set(results.map((metrics) => `${metrics.zeroTo100.toFixed(2)}:${metrics.maxLateralG.toFixed(3)}`)).size).toBe(10);
    // Lighter, stronger, grippier along the fleet: the tenth car launches faster than the first.
    expect(results[9]?.zeroTo100 ?? 0).toBeLessThan(results[0]?.zeroTo100 ?? 0);
  }, 60000);
});
