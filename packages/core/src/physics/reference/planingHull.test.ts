import { describe, expect, test } from "bun:test";

import { NACA_TN2876_MODEL as MODEL, NACA_TN2876_RUNS, planingAtTrim, planingEquilibrium, savitskyLiftCoefficient, savitskyPorpoisingTrim } from "./planingHull";

const DEG = Math.PI / 180;
const G = 9.80665;

describe("Savitsky planing hull against NACA TN 2876 (20° deadrise prismatic surface)", () => {
  const weight = MODEL.density * G;
  const predictions = NACA_TN2876_RUNS.map((run) => {
    const state = planingAtTrim(
      { massKg: (run.load * weight * MODEL.beam ** 3) / G, beam: MODEL.beam, deadrise: MODEL.deadrise, lcg: 0, vcg: 0, roughnessAllowance: 0 },
      run.speed * Math.sqrt(G * MODEL.beam),
      run.trim * DEG,
      { density: MODEL.density, viscosity: MODEL.viscosity, gravity: G },
    );
    return { run, resistance: state.resistance / (weight * MODEL.beam ** 3) };
  });

  test("resistance at the measured load, speed and trim within 12% of the tank on every run", () => {
    for (const { run, resistance } of predictions) expect(Math.abs(resistance / run.resistance - 1)).toBeLessThan(0.12);
  });

  test("lift at the measured wetted length within 17%; centre of pressure within 10% for 2 ≤ λ ≤ 4", () => {
    for (const { run } of predictions) {
      const measured = (2 * run.load) / run.speed ** 2;
      const lift = savitskyLiftCoefficient(run.trim, run.meanWettedLength, run.speed, 20);
      // Savitsky's λ runs to the spray root, ahead of the stagnation line the tank photographed, so it gives less lift per measured length.
      expect(lift).toBeLessThan(measured);
      expect(Math.abs(lift / measured - 1)).toBeLessThan(0.17);
      const lambda = run.meanWettedLength;
      if (lambda > 4 || lambda < 2) continue;
      const lp = lambda * (0.75 - 1 / ((5.21 * run.speed ** 2) / lambda ** 2 + 2.39));
      expect(Math.abs(lp / run.centreOfPressure - 1)).toBeLessThan(0.1);
    }
  });
});

describe("planing equilibrium", () => {
  const hull = { massKg: 900, beam: 2.3, deadrise: 18 * DEG, lcg: 2.28, vcg: 0.45 };

  test("balances the pitching moment, and trim falls as speed rises once on the plane", () => {
    const slow = planingEquilibrium(hull, 8);
    const fast = planingEquilibrium(hull, 16);
    expect(Math.abs(slow.moment)).toBeLessThan(1e-3);
    expect(fast.trim).toBeLessThan(slow.trim);
    expect(fast.wettedLengthRatio).toBeLessThan(slow.wettedLengthRatio);
    expect(fast.resistance).toBeGreaterThan(slow.resistance);
  });

  test("moving the centre of gravity aft raises the running trim", () => {
    const forward = planingEquilibrium(hull, 16);
    const aft = planingEquilibrium({ ...hull, lcg: 1.6 }, 16);
    expect(aft.trim).toBeGreaterThan(forward.trim);
    expect(aft.porpoisingTrim).toBeCloseTo(forward.porpoisingTrim, 10);
  });

  test("the porpoising limit rises with load and with deadrise, as on Savitsky's chart", () => {
    expect(savitskyPorpoisingTrim(0.08, 10 * DEG)).toBeGreaterThan(savitskyPorpoisingTrim(0.05, 10 * DEG));
    expect(savitskyPorpoisingTrim(0.08, 20 * DEG)).toBeGreaterThan(savitskyPorpoisingTrim(0.08, 0));
  });
});
