import { describe, expect, test } from "bun:test";

import { compareRocketAscent, saturnVGameTuning } from "./rocketComparison";

describe("compareRocketAscent", () => {
  test("lines the game motor build of the Saturn V up against the reference rocket and the AS-506 report", () => {
    const table = compareRocketAscent();
    const row = (label: string) => table.rows.find((entry) => entry.label.startsWith(label));
    expect(table.rows).toHaveLength(12);
    // Sea-level thrust and no pressure lapse: the game build's ideal Δv is the sea-level exhaust velocity's.
    expect(row("ideal Δv")?.game).toBeLessThan(0.9 * (row("ideal Δv")?.reference ?? 0));
    // Both burn the same propellant at the same flow, so both burn out on the report's time.
    expect(Math.abs((row("burnout time")?.game ?? 0) - (row("burnout time")?.real ?? 0))).toBeLessThan(1);
    expect(Math.abs((row("burnout altitude")?.reference ?? 0) - (row("burnout altitude")?.real ?? 0))).toBeLessThan(2);
    expect(row("burnout altitude")?.game).toBeLessThan(0.5 * (row("burnout altitude")?.real ?? 0));
  });

  test("the game build carries the report's masses and flow", () => {
    const tuning = saturnVGameTuning();
    expect(tuning.massKg + (tuning.motor?.propellantKg ?? 0)).toBeCloseTo(2899008, 0);
    expect(tuning.motor?.massFlow).toBeCloseTo(13275, -1);
  });
});
