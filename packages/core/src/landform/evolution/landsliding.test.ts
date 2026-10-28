import { describe, expect, test } from "bun:test";
import { landformTopology, type LandformTopology } from "../grid/landformGrid";
import { createLandscapeEvolution } from "./landscapeEvolution";
import { createLandslider } from "./landsliding";

function steepestExcess(topology: LandformTopology, height: Float64Array, critical: (i: number) => number): number {
  let worst = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < topology.cells; i += 1) {
    if (topology.base[i] === 1) continue;
    for (let k = 0; k < 8; k += 1) {
      const n = topology.neighbour[i * 8 + k] ?? -1;
      if (n < 0) continue;
      const slope = ((height[i] ?? 0) - (height[n] ?? 0)) / (topology.distance[k] ?? 1);
      worst = Math.max(worst, slope - critical(i));
    }
  }
  return worst;
}

describe("threshold landsliding", () => {
  test("a spire steeper than its rock fails back to the critical angle and the debris rests at the angle of repose", () => {
    const side = 61;
    const topology = landformTopology({ cols: side, rows: side, cellSize: 10 });
    const height = new Float64Array(side * side);
    for (let row = 0; row < side; row += 1) for (let col = 0; col < side; col += 1) height[row * side + col] = Math.max(0, 600 - 40 * Math.hypot(col - 30, row - 30));
    const before = height.reduce((sum, h) => sum + h, 0);
    const rockSlope = Math.tan((50 * Math.PI) / 180);
    const repose = Math.tan((34 * Math.PI) / 180);
    const critical = new Float64Array(side * side).fill(rockSlope);
    const laid = new Float64Array(side * side);
    const failed = new Float64Array(side * side);
    const report = createLandslider(topology).collapse(height, new Float64Array(side * side), critical, repose, laid, failed);
    expect(report.failed).toBeGreaterThan(0);
    // Mass is kept: what failed lies downslope as debris or left the map.
    const after = height.reduce((sum, h) => sum + h, 0);
    expect(Math.abs(before - after) * 100 - report.exported).toBeLessThan(1e-6 * before * 100);
    // No slope stands steeper than the rock allows, and no debris slope steeper than repose.
    expect(steepestExcess(topology, height, (i) => ((laid[i] ?? 0) > 0 ? Math.max(repose, rockSlope) : rockSlope))).toBeLessThan(1e-6);
    let debrisSlopes = 0;
    let atRepose = 0;
    for (let i = 0; i < topology.cells; i += 1) {
      if ((laid[i] ?? 0) < 1 || topology.base[i] === 1) continue;
      let steepest = 0;
      for (let k = 0; k < 8; k += 1) {
        const n = topology.neighbour[i * 8 + k] ?? -1;
        if (n >= 0) steepest = Math.max(steepest, ((height[i] ?? 0) - (height[n] ?? 0)) / (topology.distance[k] ?? 1));
      }
      debrisSlopes += 1;
      if (Math.abs(steepest - repose) < 0.02 * repose) atRepose += 1;
    }
    expect(debrisSlopes).toBeGreaterThan(20);
    // Most of the talus apron sits at the angle of repose.
    expect(atRepose / debrisSlopes).toBeGreaterThan(0.75);
  });

  test("under fast uplift hillslopes pile up at the threshold angle (threshold hillslopes)", () => {
    const model = createLandscapeEvolution({
      grid: { cols: 64, rows: 64, cellSize: 50 },
      seed: "threshold",
      params: { uplift: 1e-2, erodibility: 2e-5, diffusivity: 0, timeStep: 2e3, strata: { layers: [{ id: "granite", thickness: 1, erodibility: 1, criticalAngle: 40 }] } },
    });
    for (let k = 0; k < 600; k += 1) model.step();
    const { height, sediment } = model.fields();
    const topology = landformTopology(model.grid);
    const routing = model.routing();
    const rock = Math.tan((40 * Math.PI) / 180);
    let hillslopes = 0;
    let atThreshold = 0;
    for (let i = 0; i < topology.cells; i += 1) {
      if (topology.base[i] === 1 || (routing.area[i] ?? 0) > 5 * topology.cellArea || (sediment[i] ?? 0) >= 1) continue;
      const r = routing.receiver[i] ?? i;
      const slope = ((height[i] ?? 0) - (height[r] ?? 0)) / (routing.receiverDistance[i] ?? 1);
      hillslopes += 1;
      if (slope > 0.97 * rock) atThreshold += 1;
    }
    expect(steepestExcess(topology, height, (i) => ((sediment[i] ?? 0) >= 1 ? Math.max(rock, Math.tan((34 * Math.PI) / 180)) : rock))).toBeLessThan(1e-6);
    expect(atThreshold / hillslopes).toBeGreaterThan(0.6);
  }, 30_000);
});
