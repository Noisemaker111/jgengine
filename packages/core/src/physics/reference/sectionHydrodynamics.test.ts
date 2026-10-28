import { describe, expect, test } from "bun:test";

import { lewisSection, sectionHeave } from "./sectionHydrodynamics";

const RHO = 1025;
const G = 9.80665;

const semicircle = Array.from({ length: 61 }, (_, i) => {
  const t = (0.5 * Math.PI * i) / 60;
  return [Math.sin(t), -Math.cos(t)] as const;
});

describe("Frank close-fit heave coefficients", () => {
  test("a semicircle's high-frequency added mass converges on the exact ρπb²/2 (within 0.7% at 64 panels)", () => {
    const exact = (RHO * Math.PI) / 2;
    const coarse = sectionHeave(semicircle, Infinity, RHO, G, 16).addedMass / exact - 1;
    const fine = sectionHeave(semicircle, Infinity, RHO, G, 64).addedMass / exact - 1;
    expect(Math.abs(fine)).toBeLessThan(0.007);
    expect(Math.abs(fine)).toBeLessThan(Math.abs(coarse));
  });

  test("Lewis forms: high-frequency added mass matches Lewis's closed form ρπ/2·M²((1 + a1)² + 3a3²) within 1.5%", () => {
    for (const [ratio, area] of [[1.6, 0.95], [1.0, 0.8], [2.5, 0.7], [0.8, 0.9]] as const) {
      const { section, a1, a3, scale } = lewisSection(ratio, 1, area);
      const exact = 0.5 * RHO * Math.PI * scale * scale * ((1 + a1) ** 2 + 3 * a3 * a3);
      expect(Math.abs(sectionHeave(section, Infinity, RHO, G, 48).addedMass / exact - 1)).toBeLessThan(0.015);
      let enclosed = 0;
      for (let i = 1; i < section.length; i += 1) {
        const p = section[i - 1] ?? [0, 0];
        const q = section[i] ?? [0, 0];
        enclosed += (p[0] + q[0]) * (q[1] - p[1]);
      }
      expect(enclosed / (2 * ratio * 1)).toBeCloseTo(area, 2);
    }
  });

  test("damping equals the energy the radiated waves carry away, ρg²Ā²/ω³, within 2% below the first irregular frequency", () => {
    for (const xi of [0.1, 0.25, 0.5, 1, 1.5, 2]) {
      const omega = Math.sqrt((xi * G) / 1);
      const result = sectionHeave(semicircle, omega, RHO, G, 32);
      const radiated = (RHO * G * G * result.waveRatio ** 2) / omega ** 3;
      expect(Math.abs(result.damping / radiated - 1)).toBeLessThan(0.02);
      expect(result.damping).toBeGreaterThan(0);
    }
  });

  test("a semicircle's added mass dips to about 0.6·ρπb²/2 near ω²b/g = 1 and climbs back toward the high-frequency limit", () => {
    const coefficient = (xi: number) => sectionHeave(semicircle, Math.sqrt(xi * G), RHO, G, 32).addedMass / ((RHO * Math.PI) / 2);
    const dip = coefficient(1);
    expect(dip).toBeGreaterThan(0.55);
    expect(dip).toBeLessThan(0.65);
    expect(coefficient(0.25)).toBeGreaterThan(dip);
    expect(coefficient(10)).toBeGreaterThan(0.95);
  });

  test("a near-flat bottom's high-frequency added mass is the flat plate's ρπc²/2, the von Kármán slamming mass", () => {
    const halfWidth = 1;
    const deadrise = (3 * Math.PI) / 180;
    const wedge = [[0, -halfWidth * Math.tan(deadrise)], [halfWidth, 0]] as const;
    const plate = (RHO * Math.PI * halfWidth * halfWidth) / 2;
    expect(Math.abs(sectionHeave(wedge, Infinity, RHO, G, 48).addedMass / plate - 1)).toBeLessThan(0.05);
  });
});
