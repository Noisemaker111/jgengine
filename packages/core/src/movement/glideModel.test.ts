import { describe, expect, test } from "bun:test";

import { createGlideModel } from "./glideModel";

describe("createGlideModel — launch", () => {
  test("launch sets velocity along the given heading at the given speed", () => {
    const glide = createGlideModel();
    glide.launch([0, 10, 0], Math.PI / 2, 6);
    const pose = glide.pose();
    expect(pose.position).toEqual([0, 10, 0]);
    expect(pose.heading).toBe(Math.PI / 2);
    expect(pose.velocity[0]).toBeCloseTo(Math.sin(Math.PI / 2) * 6, 5);
    expect(pose.velocity[2]).toBeCloseTo(Math.cos(Math.PI / 2) * 6, 5);
    expect(pose.velocity[1]).toBe(0);
  });

  test("launch defaults initialSpeed to the configured forwardSpeed", () => {
    const glide = createGlideModel({ forwardSpeed: 9 });
    glide.launch([0, 0, 0], 0);
    expect(glide.pose().velocity).toEqual([0, 0, 9]);
  });
});

describe("createGlideModel — unpowered fall", () => {
  test("falls under gravity and clamps at maxFallSpeed", () => {
    const glide = createGlideModel({ maxFallSpeed: 4, gravity: 20, gravityScale: 1 });
    glide.launch([0, 100, 0], 0);
    let last = glide.step(0.1);
    for (let i = 0; i < 50; i += 1) last = glide.step(0.1);
    expect(last.velocity[1]).toBeCloseTo(-4, 5);
  });
});

describe("createGlideModel — yaw input", () => {
  test("yaw input turns heading over time", () => {
    const glide = createGlideModel({ yawRate: 2 });
    glide.launch([0, 0, 0], 0);
    const step = glide.step(0.5, { yaw: 1 });
    expect(step.heading).toBeCloseTo(1, 5);
  });

  test("control: 0 disables turning", () => {
    const glide = createGlideModel({ yawRate: 2 });
    glide.launch([0, 0, 0], 0.3);
    const step = glide.step(0.5, { yaw: 1, control: 0 });
    expect(step.heading).toBe(0.3);
  });
});

describe("createGlideModel — powered climb", () => {
  test("throttle with climbAccel gains altitude relative to an unpowered glide", () => {
    const powered = createGlideModel({ climbAccel: 6, gravity: 20, gravityScale: 0.25 });
    const unpowered = createGlideModel({ climbAccel: 6, gravity: 20, gravityScale: 0.25 });
    powered.launch([0, 50, 0], 0);
    unpowered.launch([0, 50, 0], 0);

    let poweredStep = powered.pose();
    let unpoweredStep = unpowered.pose();
    for (let i = 0; i < 10; i += 1) {
      poweredStep = powered.step(0.1, { throttle: 1 });
      unpoweredStep = unpowered.step(0.1);
    }
    expect(poweredStep.position[1]).toBeGreaterThan(unpoweredStep.position[1]);
  });
});

describe("createGlideModel — externalVelocity", () => {
  test("displaces position without changing the stored velocity", () => {
    const withCurrent = createGlideModel();
    const control = createGlideModel();
    withCurrent.launch([0, 0, 0], 0);
    control.launch([0, 0, 0], 0);

    const stepA = withCurrent.step(0.1, {}, [50, 0, 0]);
    const stepB = control.step(0.1);
    expect(stepA.velocity).toEqual(stepB.velocity);
    expect(stepA.position[0]).toBeGreaterThan(stepB.position[0]);

    const afterA = withCurrent.step(0.1).velocity;
    const afterB = control.step(0.1).velocity;
    expect(afterA).toEqual(afterB);
  });
});

describe("glide model snapshot", () => {
  test("snapshot and restore replay bit-exactly", () => {
    const glider = createGlideModel({ climbAccel: 6 });
    glider.launch([0, 50, 0], 0.4, 10);
    for (let i = 0; i < 20; i += 1) glider.step(1 / 60, { yaw: 0.5 });
    const saved = glider.snapshot();
    const frozen = JSON.parse(JSON.stringify(saved));
    const play = () => {
      const out = [];
      for (let i = 0; i < 30; i += 1) out.push(glider.step(1 / 60, { yaw: -0.3, throttle: 0.6, control: 0.8 }, [0.5, 0, -0.2]));
      return out;
    };
    const a = play();
    expect(saved).toEqual(frozen);
    glider.restore(saved);
    expect(play()).toEqual(a);
  });
});
