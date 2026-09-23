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

describe("grapple swing restore", () => {
  test("state and restore replay bit-exactly", () => {
    const swing = createGrappleSwing({ reelSpeed: 2, stiffness: 4 });
    swing.fire([0, 10, 0], [6, 2, 0]);
    swing.step([6, 2, 0], [0, 0, 3], 1 / 60, true);
    const saved = swing.state();
    const frozen = JSON.parse(JSON.stringify(saved));
    const play = () => {
      let position: readonly [number, number, number] = [7, 1, 1];
      let velocity: readonly [number, number, number] = [1, -2, 3];
      const out = [];
      for (let i = 0; i < 40; i += 1) {
        const step = swing.step(position, [velocity[0], velocity[1] - 0.3, velocity[2]], 1 / 60, i < 20);
        position = [step.position[0] + step.velocity[0] / 60, step.position[1] + step.velocity[1] / 60, step.position[2] + step.velocity[2] / 60];
        velocity = step.velocity;
        out.push(step, swing.state());
      }
      return out;
    };
    const a = play();
    swing.release();
    expect(saved).toEqual(frozen);
    swing.restore(saved);
    expect(play()).toEqual(a);
  });
});
