import { describe, expect, test } from "bun:test";

import { DRY_SAND, GLASS_BEADS, SANDY_LOAM, culmannHeight, flowFriction, plateSinkage, plateSinkagePressure, startFriction, stopFriction, stoppingDepth, wheelSinkage } from "./granularMaterial";

const tan = (d: number): number => Math.tan((d * Math.PI) / 180);

describe("granular materials", () => {
  test("the friction law spans tan δ₁ for thick slow layers to tan δ₂ for thin ones, with start above stop", () => {
    expect(stopFriction(GLASS_BEADS, 1)).toBeCloseTo(tan(21), 3);
    expect(stopFriction(GLASS_BEADS, 0)).toBeCloseTo(tan(30.7), 10);
    for (const h of [0.5e-3, 2e-3, 1e-2]) expect(startFriction(GLASS_BEADS, h)).toBeGreaterThan(stopFriction(GLASS_BEADS, h));
  });

  test("h_stop inverts μ_stop, so steady uniform flow at tan θ = μ has Fr = β h / h_stop", () => {
    for (const angle of [22, 25, 28]) {
      const hStop = stoppingDepth(GLASS_BEADS, angle);
      expect(stopFriction(GLASS_BEADS, hStop)).toBeCloseTo(tan(angle), 12);
      for (const h of [2e-3, 5e-3]) {
        const froude = (GLASS_BEADS.beta * h) / hStop;
        if (froude >= GLASS_BEADS.beta) expect(flowFriction(GLASS_BEADS, h, froude)).toBeCloseTo(tan(angle), 12);
      }
    }
    expect(stoppingDepth(GLASS_BEADS, 20)).toBe(Number.POSITIVE_INFINITY);
    expect(stoppingDepth(GLASS_BEADS, 31)).toBe(0);
  });

  test("Bekker sinkage inverts, grows with load and shrinks on a narrower plate", () => {
    const soil = DRY_SAND.bekker;
    if (soil === undefined) throw new Error("dry sand has Bekker values");
    const z = plateSinkage(soil, 20000, 0.1);
    expect(plateSinkagePressure(soil, z, 0.1)).toBeCloseTo(20000, 6);
    expect(plateSinkage(soil, 40000, 0.1)).toBeGreaterThan(z);
    // The k_c / b term stiffens a narrower plate.
    expect(plateSinkage(soil, 20000, 0.05)).toBeLessThan(z);
    // A 10 kN wheel 0.3 m wide, 1 m across sinks about 12 cm in Wong's loose dry sand by Bekker's closed form.
    const rut = wheelSinkage(soil, 10000, 0.3, 1);
    expect(rut).toBeGreaterThan(0.11);
    expect(rut).toBeLessThan(0.13);
    // Loam's lower exponent makes the same wheel sink less than in sand.
    const loam = SANDY_LOAM.bekker;
    if (loam === undefined) throw new Error("loam has Bekker values");
    expect(wheelSinkage(loam, 10000, 0.3, 1)).toBeLessThan(rut);
  });

  test("Culmann's critical height: Terzaghi's 4c/γ tan(45° + φ/2) for a vertical cut, unbounded at the friction angle", () => {
    const phi = (30 * Math.PI) / 180;
    expect(culmannHeight(1000, 18000, Math.PI / 2, phi)).toBeCloseTo(((4 * 1000) / 18000) * Math.tan(Math.PI / 4 + phi / 2), 10);
    expect(culmannHeight(1000, 18000, phi, phi)).toBe(Number.POSITIVE_INFINITY);
    expect(culmannHeight(1000, 18000, 1.2, phi)).toBeGreaterThan(culmannHeight(1000, 18000, 1.4, phi));
  });
});
