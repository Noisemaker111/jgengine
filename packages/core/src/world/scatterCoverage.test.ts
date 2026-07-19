import { describe, expect, test } from "bun:test";

import {
  budgetWarning,
  CITY_BUILDING_BUDGET,
  densityCoverage,
  describeScatterCoverage,
  placedCoverage,
  scatterCoverageSpec,
  scatterFootprintArea,
  SCATTER_COVERAGE_SPECS,
  SCATTER_INSTANCE_BUDGET,
} from "./scatterCoverage";

describe("scatterFootprintArea", () => {
  test("shoelace area of a closed path polygon", () => {
    const square = [
      { x: -10, z: -10 },
      { x: 10, z: -10 },
      { x: 10, z: 10 },
      { x: -10, z: 10 },
    ];
    expect(scatterFootprintArea({ points: square })).toBeCloseTo(400);
  });

  test("box volume area from half-extents (XZ)", () => {
    expect(scatterFootprintArea({ halfExtents: { x: 15, z: 10 } })).toBe(600);
  });

  test("disc volume area from radius", () => {
    expect(scatterFootprintArea({ radius: 10 })).toBeCloseTo(Math.PI * 100);
  });

  test("degenerate inputs yield zero", () => {
    expect(scatterFootprintArea({})).toBe(0);
    expect(scatterFootprintArea({ points: [{ x: 0, z: 0 }, { x: 1, z: 1 }] })).toBe(0);
    expect(scatterFootprintArea({ halfExtents: { x: 0, z: 4 } })).toBe(0);
  });
});

describe("scatterCoverageSpec", () => {
  test("known kinds resolve, others null", () => {
    expect(scatterCoverageSpec("grass_field")).toBe(SCATTER_COVERAGE_SPECS.grass_field);
    expect(scatterCoverageSpec("scatter")?.unit).toBe("placements");
    expect(scatterCoverageSpec("city")?.budget).toBe(CITY_BUILDING_BUDGET);
    expect(scatterCoverageSpec("water")).toBeNull();
  });
});

describe("densityCoverage (grass / scatter, per-m²)", () => {
  test("requested = floor(density × area), under budget", () => {
    const cov = densityCoverage("grass_field", 400, 12);
    expect(cov.requested).toBe(4800);
    expect(cov.count).toBe(4800);
    expect(cov.capped).toBe(false);
    expect(cov.unit).toBe("blades");
  });

  test("caps at the shared instance budget and flags it", () => {
    const cov = densityCoverage("grass_field", 100_000, 160);
    expect(cov.requested).toBe(16_000_000);
    expect(cov.count).toBe(SCATTER_INSTANCE_BUDGET);
    expect(cov.capped).toBe(true);
  });

  test("scatter uses the same budget with its own unit", () => {
    const cov = densityCoverage("scatter", 130_000, 2);
    expect(cov.requested).toBe(260_000);
    expect(cov.count).toBe(SCATTER_INSTANCE_BUDGET);
    expect(cov.capped).toBe(true);
    expect(cov.unit).toBe("placements");
  });

  test("clamps negative / non-finite inputs to zero", () => {
    expect(densityCoverage("scatter", -50, 1).count).toBe(0);
    expect(densityCoverage("scatter", 100, Number.NaN).requested).toBe(0);
  });
});

describe("placedCoverage (city, count already known)", () => {
  test("under budget is not capped and has no pre-cap request", () => {
    const cov = placedCoverage("city", 40_000, 420);
    expect(cov.count).toBe(420);
    expect(cov.requested).toBeNull();
    expect(cov.capped).toBe(false);
    expect(cov.unit).toBe("buildings");
  });

  test("reaching the building budget flags capped", () => {
    const cov = placedCoverage("city", 40_000, CITY_BUILDING_BUDGET);
    expect(cov.capped).toBe(true);
  });
});

describe("budgetWarning / describeScatterCoverage", () => {
  test("no warning under budget", () => {
    expect(budgetWarning(densityCoverage("grass_field", 400, 12))).toBe("");
  });

  test("per-m² kinds show requested and budget", () => {
    const cov = densityCoverage("grass_field", 100_000, 160);
    expect(budgetWarning(cov)).toBe(" · requested 16,000,000, capped at 250,000 (budget)");
  });

  test("known-count kinds show only the ceiling", () => {
    const cov = placedCoverage("city", 40_000, CITY_BUILDING_BUDGET);
    expect(budgetWarning(cov)).toBe(" · capped at 2,600 (budget)");
  });

  test("full readout composes count, area, and warning", () => {
    expect(describeScatterCoverage(densityCoverage("scatter", 256, 0.25))).toBe("≈ 64 placements · 256 m²");
    expect(describeScatterCoverage(densityCoverage("scatter", 130_000, 2))).toBe(
      "≈ 250,000 placements · 130,000 m² · requested 260,000, capped at 250,000 (budget)",
    );
  });
});
