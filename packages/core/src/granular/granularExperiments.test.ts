import { describe, expect, test } from "bun:test";

import { DEM_SAND, collapsedColumn } from "../physics/reference/discreteElementExperiments";
import { continuumCollapse, inclinedFlume, pouredHeap } from "./granularExperiments";
import { DAMP_SAND, DRY_SAND, GLASS_BEADS, stoppingDepth } from "./granularMaterial";

const lube = (a: number): number => (a < 1.7 ? 1 + 1.24 * a : 1 + 1.6 * Math.sqrt(a));

describe("continuum granular flow against published experiments", () => {
  test("a released column runs out as far as Lube et al. (2004) measured", () => {
    for (const a of [0.5, 1, 1.5, 3]) {
      const collapse = continuumCollapse(DRY_SAND, a, 0.1, a > 2 ? 14 : 20);
      // Within 12%: the worst case, a = 1.5, sits next to the change of regime Lube et al. fit at a = 1.7.
      expect(Math.abs(collapse.runout - lube(a)) / lube(a)).toBeLessThan(0.12);
    }
    // Below a ≈ 0.7 the top of the column is left undisturbed.
    expect(continuumCollapse(DRY_SAND, 0.5).height).toBeGreaterThan(0.98);
  }, 120_000);

  test("steady flow down a rough incline obeys Pouliquen's Fr = β h / h_stop(θ)", () => {
    for (const [angle, depth] of [
      [25, 0.002],
      [25, 0.004],
      [27, 0.002],
    ] as const) {
      const flow = inclinedFlume(GLASS_BEADS, angle, depth, 3);
      const predicted = (GLASS_BEADS.beta * depth) / stoppingDepth(GLASS_BEADS, angle);
      expect(Math.abs(flow.froude - predicted) / predicted).toBeLessThan(0.03);
    }
    // A layer thinner than h_start stays put on a slope it would flow down if thicker.
    expect(inclinedFlume(GLASS_BEADS, 23, 0.004, 0.5).velocity).toBe(0);
  }, 120_000);

  test("a poured heap stands at the stop angle the same way along the grid and across it, and loses nothing", () => {
    const dry = pouredHeap(DRY_SAND);
    expect(dry.axisSlope).toBeGreaterThan(DRY_SAND.stopAngle - 2.5);
    expect(dry.axisSlope).toBeLessThan(DRY_SAND.startAngle + 1);
    expect(Math.abs(dry.axisSlope - dry.diagonalSlope)).toBeLessThan(1);
    expect(Math.abs(dry.conserved - 1)).toBeLessThan(1e-12);
    const damp = pouredHeap(DAMP_SAND);
    expect(damp.axisSlope).toBeGreaterThan(dry.axisSlope + 3);
  }, 60_000);

  test("the continuum runs a sand column out as far as the discrete element reference does", () => {
    const dem = collapsedColumn({ aspect: 1, material: DEM_SAND });
    const a = dem.initialHeight / dem.initialRadius;
    const demRunout = dem.runout / dem.initialRadius;
    const continuum = continuumCollapse(DRY_SAND, a).runout;
    expect(Math.abs(continuum - demRunout) / demRunout).toBeLessThan(0.15);
    expect(Math.abs(demRunout - lube(a)) / lube(a)).toBeLessThan(0.15);
  }, 120_000);
});
