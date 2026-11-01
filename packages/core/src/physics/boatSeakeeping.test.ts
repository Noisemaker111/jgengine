import { describe, expect, test } from "bun:test";

import { regularWaveField } from "../water/seaState";
import { prepareSeakeeping, seakeepingExcitation, seakeepingForces, sectionRadiation, wigleyOffsets } from "./boatSeakeeping";

describe("boatSeakeeping", () => {
  test("a Wigley hull's heave restoring is ρg times its waterplane, (2/3)·L·B", () => {
    const prepared = prepareSeakeeping({ stations: 41 }, 6, 2.3, 900);
    expect(prepared.restoring[0] / (1025 * 9.81 * (2 / 3) * 6 * 2.3)).toBeCloseTo(1, 2);
    // Six straight waterlines under-fill the curved section by about a percent.
    expect(Math.abs(prepared.inertia[0] / 900 - 1)).toBeLessThan(0.02);
  });

  test("a semicircle's heave added mass falls toward ρπR²/2 at high frequency and it radiates waves", () => {
    const radius = 1;
    const semicircle = Array.from({ length: 33 }, (_, i) => {
      const angle = (Math.PI / 2) * (i / 32);
      return [radius * Math.sin(angle), -radius * Math.cos(angle)] as const;
    });
    const high = sectionRadiation(semicircle, 12, 1025, 9.81, 16);
    expect(high.addedMass / (0.5 * 1025 * Math.PI * radius * radius)).toBeCloseTo(1, 1);
    expect(sectionRadiation(semicircle, 2, 1025, 9.81, 16).damping).toBeGreaterThan(0);
  });

  test("head waves much longer than the hull lift it by about their full height", () => {
    const length = 6;
    const prepared = prepareSeakeeping({ offsets: wigleyOffsets(length, 2.3, 0.143) }, length, 2.3, 900);
    const field = regularWaveField(1, 20, Math.PI);
    const loads = seakeepingForces(prepared, seakeepingExcitation(prepared, field), field, 0, 0, 1, 0, 0);
    expect(loads[0] / prepared.restoring[0]).toBeGreaterThan(0.8);
    expect(loads[0] / prepared.restoring[0]).toBeLessThan(1.05);
  });
});
