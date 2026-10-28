import { describe, expect, test } from "bun:test";

import { vehicleTuning, VEHICLE_STYLES } from "../vehicleSpec";
import { compareHandlingMetrics, compareVehicleTuning, formatHandlingComparison, type ComparableHandlingMetrics } from "./compareHandling";
import { MAZDA_MX5_ND } from "./realCars";

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
    const tuning = vehicleTuning({ ...VEHICLE_STYLES.arcade, topSpeed: 40, accel: 9, brake: 14, turnRate: 1.4, grip: 1.6, weight: 1150 });
    // A measured reference is passed in, as the CLI does across many game cars; `--validate` measures the real one.
    const result = compareVehicleTuning(tuning, MAZDA_MX5_ND, BASE);
    expect(result.rows).toHaveLength(9);
    expect(result.reference).toBe(BASE);
    for (const row of result.rows) expect(row.delta).toBeCloseTo(row.game - row.reference, 9);
    // An arcade car grips well past a real road car on street tyres.
    expect(result.game.skidpadG).toBeGreaterThan(BASE.skidpadG + 0.2);
  }, 30000);
});
