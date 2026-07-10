import { describe, expect, test } from "bun:test";

import {
  advanceApex,
  applyAirSteer,
  attachSwing,
  createApexDetector,
  isApexOpen,
  predictTrajectory,
  releaseSwing,
  stepSwing,
  vecLength,
  type SwingState,
} from "./swing";

const GRAVITY = -10;

function detachedState(position = { x: 0, y: 0, z: 0 }, velocity = { x: 0, y: 0, z: 0 }): SwingState {
  return { position, velocity, attached: false, anchor: null, ropeLength: 0, apex: createApexDetector() };
}

describe("stepSwing — pendulum physics", () => {
  test("rope-constrained: released from horizontal, speed at the bottom matches energy conservation (v = sqrt(2·g·L))", () => {
    const ropeLength = 5;
    let state: SwingState = {
      position: { x: ropeLength, y: 10, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      attached: true,
      anchor: { x: 0, y: 10, z: 0 },
      ropeLength,
      apex: createApexDetector(),
    };
    let maxSpeed = 0;
    let yAtMaxSpeed = state.position.y;
    for (let i = 0; i < 400; i += 1) {
      state = stepSwing(state, GRAVITY, 0.01);
      const speed = vecLength(state.velocity);
      if (speed > maxSpeed) {
        maxSpeed = speed;
        yAtMaxSpeed = state.position.y;
      }
    }
    const expectedSpeed = Math.sqrt(2 * Math.abs(GRAVITY) * ropeLength);
    expect(maxSpeed).toBeGreaterThan(expectedSpeed * 0.9);
    expect(maxSpeed).toBeLessThan(expectedSpeed * 1.1);
    expect(yAtMaxSpeed).toBeCloseTo(10 - ropeLength, 0);
  });

  test("rope constraint always keeps the traveller exactly `ropeLength` from the anchor", () => {
    let state: SwingState = {
      position: { x: 4, y: 8, z: 2 },
      velocity: { x: 1, y: 0.5, z: -0.4 },
      attached: true,
      anchor: { x: 0, y: 8, z: 0 },
      ropeLength: Math.hypot(4, 0, 2),
      apex: createApexDetector(),
    };
    for (let i = 0; i < 50; i += 1) {
      state = stepSwing(state, GRAVITY, 0.016);
      const dist = Math.hypot(state.position.x - 0, state.position.y - 8, state.position.z - 0);
      expect(dist).toBeCloseTo(state.ropeLength, 5);
    }
  });

  test("detached: free-fall integration matches predictTrajectory's ballistic formula exactly", () => {
    const gravity = -18;
    const dt = 1 / 60;
    const steps = 40;
    const startPos = { x: 3, y: 20, z: -4 };
    const startVel = { x: 5, y: 2, z: -1 };

    let state = detachedState(startPos, startVel);
    const stepped: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < steps; i += 1) {
      state = stepSwing(state, gravity, dt);
      stepped.push(state.position);
    }

    const predicted = predictTrajectory(startPos, startVel, gravity, dt, steps);

    expect(predicted.length).toBe(steps);
    for (let i = 0; i < steps; i += 1) {
      expect(predicted[i]!.x).toBeCloseTo(stepped[i]!.x, 10);
      expect(predicted[i]!.y).toBeCloseTo(stepped[i]!.y, 10);
      expect(predicted[i]!.z).toBeCloseTo(stepped[i]!.z, 10);
    }
  });

  test("gravity pulls a free body downward every step", () => {
    let state = detachedState({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 });
    const heights: number[] = [state.position.y];
    for (let i = 0; i < 5; i += 1) {
      state = stepSwing(state, GRAVITY, 0.1);
      heights.push(state.position.y);
    }
    for (let i = 1; i < heights.length; i += 1) expect(heights[i]!).toBeLessThan(heights[i - 1]!);
  });
});

describe("attachSwing / releaseSwing", () => {
  test("attach sets rope length to the current distance from the anchor and resets the apex window", () => {
    const state = detachedState({ x: 3, y: 4, z: 0 }, { x: 1, y: 1, z: 1 });
    const attached = attachSwing(state, { x: 0, y: 0, z: 0 });
    expect(attached.attached).toBe(true);
    expect(attached.ropeLength).toBeCloseTo(5, 5);
    expect(isApexOpen(attached.apex)).toBe(false);
  });

  test("release carries the current velocity forward unchanged (swing speed becomes flight speed)", () => {
    const state: SwingState = {
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 5, z: 6 },
      attached: true,
      anchor: { x: 0, y: 0, z: 0 },
      ropeLength: 10,
      apex: createApexDetector(),
    };
    const released = releaseSwing(state);
    expect(released.attached).toBe(false);
    expect(released.anchor).toBeNull();
    expect(released.velocity).toEqual(state.velocity);
    expect(released.position).toEqual(state.position);
  });
});

describe("apex-window detection", () => {
  test("opens exactly at a local speed maximum and stays open for APEX_WINDOW_SECONDS", () => {
    const dt = 0.05;
    const speeds = [0, 1, 2, 3, 2.5, 2, 1.5];
    let detector = createApexDetector();
    const openAt: boolean[] = [];
    for (const speed of speeds) {
      detector = advanceApex(detector, speed, dt);
      openAt.push(isApexOpen(detector));
    }
    expect(openAt).toEqual([false, false, false, false, true, true, true]);

    for (let i = 0; i < 10; i += 1) detector = advanceApex(detector, 1, dt);
    expect(isApexOpen(detector)).toBe(false);
  });

  test("a monotonically increasing speed never opens the window", () => {
    let detector = createApexDetector();
    for (const speed of [0, 1, 2, 3, 4, 5]) detector = advanceApex(detector, speed, 0.05);
    expect(isApexOpen(detector)).toBe(false);
  });
});

describe("applyAirSteer", () => {
  test("adds a lateral nudge along the camera-right axis at yaw 0", () => {
    const next = applyAirSteer({ x: 0, y: 0, z: 0 }, 0, 1, 0, 1, 5, 5);
    expect(next.x).toBeCloseTo(5, 5);
    expect(next.z).toBeCloseTo(0, 5);
    expect(next.y).toBeCloseTo(0, 5);
  });

  test("adds a vertical nudge from pitch input", () => {
    const next = applyAirSteer({ x: 0, y: 0, z: 0 }, 0, 0, 1, 1, 5, 5);
    expect(next.y).toBeCloseTo(5, 5);
  });

  test("is a no-op when both inputs are zero", () => {
    const velocity = { x: 1, y: 2, z: 3 };
    expect(applyAirSteer(velocity, 1.2, 0, 0, 1, 5, 5)).toEqual(velocity);
  });
});
