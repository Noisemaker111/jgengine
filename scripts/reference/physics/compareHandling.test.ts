import { describe, expect, test } from "bun:test";

import { vehicleTuning } from "@jgengine/core/physics/vehicleSpec";
import {
  checkRuntimeAgainstReference,
  compareBikeMetrics,
  compareHandlingMetrics,
  compareRuntimeBike,
  compareRuntimeCar,
  compareVehicleTuning,
  formatHandlingComparison,
  type ComparableHandlingMetrics,
} from "./compareHandling";
import type { BikeHandlingMetrics } from "./motorcycleManeuvers";
import { MAZDA_MX5_ND } from "./realCars";
import { REAL_MOTORCYCLES } from "./realMotorcycles";

const BASE: ComparableHandlingMetrics = {
  zeroTo100: 7,
  brake100To0: 36,
  topSpeed: 200,
  skidpadG: 0.9,
  understeerGradient: 1,
  steadyStateMaxG: 0.88,
  stepResponseTime: 0.25,
  stepOvershoot: 1.05,
  laneChangeSpeed: 60,
};

describe("compareHandlingMetrics", () => {
  test("lines up game, reference and real with deltas", () => {
    const rows = compareHandlingMetrics({ ...BASE, skidpadG: 1.4, zeroTo100: Number.POSITIVE_INFINITY }, BASE, MAZDA_MX5_ND.tested);
    const skidpad = rows.find((row) => row.metric === "skidpadG");
    expect(skidpad?.delta).toBeCloseTo(0.5, 6);
    expect(skidpad?.deltaShare).toBeCloseTo(0.5 / 0.9, 6);
    expect(skidpad?.real).toBe(MAZDA_MX5_ND.tested.skidpadG);
    expect(rows.find((row) => row.metric === "topSpeed")?.real).toBeNull();
    const text = formatHandlingComparison("test car", rows);
    expect(text).toContain("skidpad");
    expect(text).toContain("+0.50 (+56%)");
    expect(text).toContain("never");
  });
});

describe("compareVehicleTuning", () => {
  test("scores a game tuning against the reference car per metric", () => {
    const tuning = vehicleTuning({
      tires: { drift: 0.15, grip: 1.6 },
      brakes: { abs: 1, brake: 14 },
      aids: { stability: 1 },
      engine: { topSpeed: 40, accel: 9 },
      steering: { turnRate: 1.4 },
      chassis: { weight: 1150 },
    });
    // A measured reference is passed in, as the CLI does across many game cars; `--validate` measures the real one.
    const result = compareVehicleTuning(tuning, MAZDA_MX5_ND, BASE);
    expect(result.rows).toHaveLength(9);
    expect(result.reference).toBe(BASE);
    for (const row of result.rows) expect(row.delta).toBeCloseTo(row.game - row.reference, 9);
    // An arcade car grips well past a real road car on street tyres.
    expect(result.game.skidpadG).toBeGreaterThan(BASE.skidpadG + 0.2);
  }, 30000);
});

// What the multibody references measured on these scenarios (`bun run games:capabilities handling --runtime` measures
// them live). A full reference run takes minutes, so the numbers are pinned here; the runtime cars run live.
const REFERENCE_MX5: ComparableHandlingMetrics = {
  zeroTo100: 7.3833,
  brake100To0: 37.0633,
  topSpeed: 206.6941,
  skidpadG: 0.86984,
  understeerGradient: 1.52859,
  steadyStateMaxG: 0.85996,
  stepResponseTime: 0.158333,
  stepOvershoot: 1.160118,
  laneChangeSpeed: 49,
};
const REFERENCE_GSXR: BikeHandlingMetrics = {
  zeroTo100: 3.216667,
  zeroTo200: 7.983333,
  brake100To0: 38.32336,
  steadyLeanDeg: 46.44461,
  steadyLateralG: 0.824571,
  timeToLean: 0.8,
  counterLeanDeg: 0,
  counterSteerDeg: 1.354468,
  laneChangeSpeed: 46.875,
  slalomSpeed: 54.375,
};

describe("the runtime car reproduces the reference", () => {
  test("carFromReference(mazda-mx5-nd) with every effect at 1 lands within 5% of the reference MX-5 on every metric", () => {
    const { comparison, checks } = compareRuntimeCar(MAZDA_MX5_ND, REFERENCE_MX5);
    expect(checks).toHaveLength(9);
    for (const check of checks) expect({ metric: check.metric, pass: check.pass }).toEqual({ metric: check.metric, pass: true });
    expect(comparison.game.understeerGradient).toBeGreaterThan(0);
  }, 60000);

  test("carFromReference(suzuki-gsxr1000-k1) lands within 5% of the reference motorcycle and rider on every metric", () => {
    const bike = REAL_MOTORCYCLES[0];
    if (bike === undefined) throw new Error("no real motorcycle");
    const { checks } = compareRuntimeBike(bike, REFERENCE_GSXR);
    expect(checks).toHaveLength(10);
    for (const check of checks) expect({ metric: check.metric, pass: check.pass }).toEqual({ metric: check.metric, pass: true });
  }, 60000);

  test("a metric that drifts past its tolerance fails, and a near-zero reference is held to an absolute gap", () => {
    const drifted = checkRuntimeAgainstReference(compareHandlingMetrics({ ...REFERENCE_MX5, laneChangeSpeed: 52 }, REFERENCE_MX5));
    expect(drifted.find((check) => check.metric === "laneChangeSpeed")?.pass).toBe(false);
    expect(drifted.find((check) => check.metric === "skidpadG")?.pass).toBe(true);
    const bike = checkRuntimeAgainstReference(compareBikeMetrics({ ...REFERENCE_GSXR, counterLeanDeg: 0.2 }, REFERENCE_GSXR));
    expect(bike.find((check) => check.metric === "counterLeanDeg")).toMatchObject({ allowed: 0.25, pass: true });
  });
});
