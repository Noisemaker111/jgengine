import { describe, expect, test } from "bun:test";

import { combineFlowVelocity, createFlowTube } from "@jgengine/core/physics/flowTube";

const tube = () =>
  createFlowTube({ from: [0, 0, 0], to: [0, 0, 20], radius: 4, strength: 10 });

describe("createFlowTube", () => {
  test("full strength on the core axis, zero outside the radius", () => {
    const flow = tube();
    expect(flow.length).toBe(20);
    expect(flow.velocityAt([0, 0, 10])).toEqual([0, 0, 10]);
    expect(flow.velocityAt([4, 0, 10])).toEqual([0, 0, 0]);
    expect(flow.velocityAt([0, 5, 10])).toEqual([0, 0, 0]);
  });

  test("radial falloff shapes the core", () => {
    const flow = tube();
    const half = flow.velocityAt([2, 0, 10]);
    expect(half[2]).toBeCloseTo(10 * 0.25, 5);
    const linear = createFlowTube({ from: [0, 0, 0], to: [0, 0, 20], radius: 4, strength: 10, falloff: 1 });
    expect(linear.velocityAt([2, 0, 10])[2]).toBeCloseTo(5, 5);
  });

  test("hard caps by default, fading caps with capFalloff", () => {
    const hard = tube();
    expect(hard.velocityAt([0, 0, -1])).toEqual([0, 0, 0]);
    expect(hard.velocityAt([0, 0, 21])).toEqual([0, 0, 0]);
    const soft = createFlowTube({ from: [0, 0, 0], to: [0, 0, 20], radius: 4, strength: 10, capFalloff: 2 });
    expect(soft.velocityAt([0, 0, 21])[2]).toBeCloseTo(5, 5);
    expect(soft.velocityAt([0, 0, -1])[2]).toBeCloseTo(5, 5);
    expect(soft.velocityAt([0, 0, 23])).toEqual([0, 0, 0]);
  });

  test("spool scales and clamps", () => {
    const flow = tube();
    expect(flow.velocityAt([0, 0, 10], 0.3)[2]).toBeCloseTo(3, 5);
    expect(flow.velocityAt([0, 0, 10], 0)).toEqual([0, 0, 0]);
    expect(flow.velocityAt([0, 0, 10], 7)[2]).toBeCloseTo(10, 5);
  });

  test("intensity envelope feeds particles and audio", () => {
    const flow = tube();
    expect(flow.intensityAt([0, 0, 10])).toBe(1);
    expect(flow.intensityAt([2, 0, 10])).toBeCloseTo(0.25, 5);
  });

  test("combineFlowVelocity sums tubes with per-tube spool", () => {
    const a = tube();
    const b = createFlowTube({ from: [0, 0, 10], to: [20, 0, 10], radius: 4, strength: 6 });
    const combined = combineFlowVelocity([a, { tube: b, spool: 0.5 }], [0, 0, 10]);
    expect(combined[2]).toBeCloseTo(10, 5);
    expect(combined[0]).toBeCloseTo(3, 5);
  });

  test("rejects degenerate tubes", () => {
    expect(() => createFlowTube({ from: [0, 0, 0], to: [0, 0, 0], radius: 1, strength: 1 })).toThrow();
    expect(() => createFlowTube({ from: [0, 0, 0], to: [1, 0, 0], radius: 0, strength: 1 })).toThrow();
  });
});
