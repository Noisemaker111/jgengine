import { describe, expect, test } from "bun:test";

import { createGrappleSwing } from "./grappleSwing";

describe("createGrappleSwing — fire", () => {
  test("fire sets rope length to the anchor distance", () => {
    const swing = createGrappleSwing();
    swing.fire([0, 0, 0], [3, 4, 0]);
    expect(swing.state()).toEqual({ attached: true, anchor: [0, 0, 0], ropeLength: 5 });
  });

  test("fire floors rope length at minLength when the fire point is closer than that", () => {
    const swing = createGrappleSwing({ minLength: 2 });
    swing.fire([0, 0, 0], [0.1, 0, 0]);
    expect(swing.state().ropeLength).toBe(2);
  });
});

describe("createGrappleSwing — step inside the rope", () => {
  test("a position within the rope radius is returned unchanged", () => {
    const swing = createGrappleSwing({ damping: 0 });
    swing.fire([0, 0, 0], [5, 0, 0]);
    const result = swing.step([2, 0, 0], [1, 2, 3], 1 / 60);
    expect(result).toEqual({ position: [2, 0, 0], velocity: [1, 2, 3] });
  });
});

describe("createGrappleSwing — step beyond the rope", () => {
  test("clamps position onto the sphere and removes outward radial velocity, preserving tangential", () => {
    const swing = createGrappleSwing({ damping: 0 });
    swing.fire([0, 0, 0], [5, 0, 0]);
    const result = swing.step([10, 0, 0], [3, 4, 0], 1 / 60);

    expect(result.position).toEqual([5, 0, 0]);

    const nx = 1;
    const ny = 0;
    const nz = 0;
    const radialDot = result.velocity[0] * nx + result.velocity[1] * ny + result.velocity[2] * nz;
    expect(radialDot).toBeCloseTo(0, 5);
    expect(result.velocity[1]).toBeCloseTo(4, 5);
  });
});

describe("createGrappleSwing — reeling", () => {
  test("reeling shortens the rope over time, floored at minLength", () => {
    const swing = createGrappleSwing({ reelSpeed: 2, minLength: 1 });
    swing.fire([0, 0, 0], [10, 0, 0]);
    swing.step([10, 0, 0], [0, 0, 0], 1, true);
    expect(swing.state().ropeLength).toBe(8);
    for (let i = 0; i < 10; i += 1) swing.step([10, 0, 0], [0, 0, 0], 1, true);
    expect(swing.state().ropeLength).toBe(1);
  });

  test("the rope only shortens when the reeling flag is passed", () => {
    const swing = createGrappleSwing({ reelSpeed: 2 });
    swing.fire([0, 0, 0], [10, 0, 0]);
    swing.step([10, 0, 0], [0, 0, 0], 1);
    expect(swing.state().ropeLength).toBe(10);
  });
});

describe("createGrappleSwing — release", () => {
  test("release stops constraining and step returns input unchanged", () => {
    const swing = createGrappleSwing({ damping: 0 });
    swing.fire([0, 0, 0], [5, 0, 0]);
    swing.release();
    expect(swing.state()).toEqual({ attached: false, anchor: null, ropeLength: 5 });

    const result = swing.step([10, 0, 0], [3, 4, 0], 1 / 60);
    expect(result).toEqual({ position: [10, 0, 0], velocity: [3, 4, 0] });
  });
});

describe("createGrappleSwing — damping", () => {
  test("damping shrinks speed each step while attached", () => {
    const swing = createGrappleSwing({ damping: 0.5 });
    swing.fire([0, 0, 0], [5, 0, 0]);
    const result = swing.step([2, 0, 0], [10, 0, 0], 1);
    expect(result.velocity[0]).toBeCloseTo(5, 5);
  });
});
