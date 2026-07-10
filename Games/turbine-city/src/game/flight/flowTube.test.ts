import { describe, expect, test } from "bun:test";
import { resolveActiveFlow, sampleFlowTube, type FlowTube } from "./flowTube";

const TUBE: FlowTube = { id: "tube-test", fanId: "fan-test", from: [0, 0, 0], to: [0, 0, 100], radius: 10, coreRadius: 4, baseSpeed: 30 };

describe("sampleFlowTube", () => {
  test("outside the segment span is not in the tube", () => {
    expect(sampleFlowTube(TUBE, 1, 1, [0, 0, -5]).inTube).toBe(false);
    expect(sampleFlowTube(TUBE, 1, 1, [0, 0, 105]).inTube).toBe(false);
  });

  test("beyond the radius is not in the tube", () => {
    expect(sampleFlowTube(TUBE, 1, 1, [15, 0, 50]).inTube).toBe(false);
  });

  test("dead center at full power is the core with max axial speed", () => {
    const sample = sampleFlowTube(TUBE, 1, 1, [0, 0, 50]);
    expect(sample.inTube).toBe(true);
    expect(sample.inCore).toBe(true);
    expect(sample.axialSpeed).toBeCloseTo(30, 5);
    expect(sample.buffet).toBe(0);
  });

  test("speed falls off with radial distance from the core", () => {
    const core = sampleFlowTube(TUBE, 1, 1, [0, 0, 50]);
    const nearEdge = sampleFlowTube(TUBE, 1, 1, [8, 0, 50]);
    const atEdge = sampleFlowTube(TUBE, 1, 1, [9.9, 0, 50]);
    expect(nearEdge.axialSpeed).toBeLessThan(core.axialSpeed);
    expect(atEdge.axialSpeed).toBeLessThan(nearEdge.axialSpeed);
    expect(atEdge.axialSpeed).toBeGreaterThan(0);
  });

  test("buffet is zero in the core and rises toward the edge", () => {
    expect(sampleFlowTube(TUBE, 1, 1, [0, 0, 50]).buffet).toBe(0);
    const midEdge = sampleFlowTube(TUBE, 1, 1, [7, 0, 50]).buffet;
    const farEdge = sampleFlowTube(TUBE, 1, 1, [9.5, 0, 50]).buffet;
    expect(midEdge).toBeGreaterThan(0);
    expect(farEdge).toBeGreaterThan(midEdge);
  });

  test("fan power scales axial speed linearly", () => {
    const full = sampleFlowTube(TUBE, 1, 1, [0, 0, 50]).axialSpeed;
    const half = sampleFlowTube(TUBE, 0.5, 1, [0, 0, 50]).axialSpeed;
    expect(half).toBeCloseTo(full / 2, 5);
  });

  test("a reversed fan direction flips the axial-speed sign — the against-flow penalty", () => {
    const forward = sampleFlowTube(TUBE, 1, 1, [0, 0, 50]);
    const reversed = sampleFlowTube(TUBE, 1, -1, [0, 0, 50]);
    expect(reversed.axialSpeed).toBeCloseTo(-forward.axialSpeed, 5);
    expect(reversed.axialSpeed).toBeLessThan(0);
  });
});

describe("resolveActiveFlow", () => {
  const tubes: readonly FlowTube[] = [
    TUBE,
    { id: "tube-b", fanId: "fan-b", from: [0, 0, 100], to: [0, 0, 200], radius: 10, coreRadius: 4, baseSpeed: 20 },
  ];
  const power = () => ({ power: 1, direction: 1 as const });

  test("returns the tube containing the position", () => {
    const sample = resolveActiveFlow(tubes, power, [0, 0, 150]);
    expect(sample?.tubeId).toBe("tube-b");
  });

  test("returns null in open sky outside every tube", () => {
    expect(resolveActiveFlow(tubes, power, [500, 0, 500])).toBeNull();
  });
});
