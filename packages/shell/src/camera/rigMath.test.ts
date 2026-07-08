import { describe, expect, test } from "bun:test";

import {
  addTrauma,
  angleDelta,
  blendShoulder,
  chaseDesiredPosition,
  cinematicSample,
  clamp,
  createTrauma,
  crossfadePose,
  lockOnPose,
  observerPose,
  resolveChase,
  resolveObserver,
  resolveShoulder,
  resolveSideOn,
  seatPose,
  shakeOffset,
  shoulderPose,
  sideOnPose,
  smoothstep,
  smoothYaw,
  speedToFov,
  springArmStep,
  stepTrauma,
  topDownPose,
  yawTo,
} from "./rigMath";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

describe("topDownPose", () => {
  test("straight-down (pitch = PI/2) sits directly overhead", () => {
    const pose = topDownPose(
      { x: 3, y: 0, z: -4 },
      { height: 18, pitch: Math.PI / 2, yaw: 0, offset: { x: 0, y: 0, z: 0 }, followSmoothing: 8 },
      55,
    );
    expect(near(pose.position.x, 3, 1e-4)).toBe(true);
    expect(near(pose.position.z, -4, 1e-4)).toBe(true);
    expect(near(pose.position.y, 18)).toBe(true);
    expect(pose.lookAt).toEqual({ x: 3, y: 0, z: -4 });
  });

  test("shallower pitch pushes the boom farther back", () => {
    const steep = topDownPose(
      { x: 0, y: 0, z: 0 },
      { height: 18, pitch: 1.2, yaw: 0, offset: { x: 0, y: 0, z: 0 }, followSmoothing: 8 },
      55,
    );
    const shallow = topDownPose(
      { x: 0, y: 0, z: 0 },
      { height: 18, pitch: 0.6, yaw: 0, offset: { x: 0, y: 0, z: 0 }, followSmoothing: 8 },
      55,
    );
    expect(Math.abs(shallow.position.z)).toBeGreaterThan(Math.abs(steep.position.z));
  });
});

describe("speedToFov", () => {
  test("interpolates base→max and clamps beyond speedForMax", () => {
    const curve = { base: 55, max: 80, speedForMax: 20 };
    expect(near(speedToFov(0, curve), 55)).toBe(true);
    expect(near(speedToFov(10, curve), 67.5)).toBe(true);
    expect(near(speedToFov(20, curve), 80)).toBe(true);
    expect(near(speedToFov(200, curve), 80)).toBe(true);
  });
});

describe("springArmStep", () => {
  test("approaches the target and is frame-rate independent over equal total time", () => {
    const one = springArmStep({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 6, 1);
    const split = (() => {
      let p = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < 10; i += 1) p = springArmStep(p, { x: 10, y: 0, z: 0 }, 6, 0.1);
      return p;
    })();
    expect(one.x).toBeGreaterThan(0);
    expect(one.x).toBeLessThan(10);
    expect(near(one.x, split.x, 1e-9)).toBe(true);
  });
});

describe("trauma shake channel", () => {
  test("addTrauma clamps to [0,1]", () => {
    const s = createTrauma();
    addTrauma(s, 0.7);
    addTrauma(s, 0.7);
    expect(s.trauma).toBe(1);
  });

  test("decays to zero over time", () => {
    const s = createTrauma();
    addTrauma(s, 1);
    for (let i = 0; i < 100; i += 1) stepTrauma(s, 1.6, 0.1);
    expect(s.trauma).toBe(0);
  });

  test("shake magnitude scales with trauma^exponent and vanishes at zero", () => {
    const cfg = { maxOffset: 1, maxRoll: 0.1, exponent: 2, frequency: 24 };
    const half = createTrauma();
    addTrauma(half, 0.5);
    half.time = 0.37;
    const full = createTrauma();
    addTrauma(full, 1);
    full.time = 0.37;
    const halfMag = Math.hypot(shakeOffset(half, cfg).x, shakeOffset(half, cfg).y);
    const fullMag = Math.hypot(shakeOffset(full, cfg).x, shakeOffset(full, cfg).y);
    expect(fullMag).toBeGreaterThan(halfMag);
    const zero = createTrauma();
    expect(shakeOffset(zero, cfg)).toEqual({ x: 0, y: 0, roll: 0 });
  });

  test("shake is deterministic for identical state", () => {
    const a = createTrauma();
    addTrauma(a, 0.8);
    a.time = 1.25;
    const b = createTrauma();
    addTrauma(b, 0.8);
    b.time = 1.25;
    expect(shakeOffset(a, undefined)).toEqual(shakeOffset(b, undefined));
  });
});

describe("crossfadePose", () => {
  test("endpoints and midpoint lerp", () => {
    const from = { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 1 }, fov: 50 };
    const to = { position: { x: 10, y: 4, z: 0 }, lookAt: { x: 2, y: 0, z: 1 }, fov: 70 };
    expect(crossfadePose(from, to, 0)).toEqual(from);
    expect(crossfadePose(from, to, 1)).toEqual(to);
    const mid = crossfadePose(from, to, 0.5);
    expect(near(mid.position.x, 5)).toBe(true);
    expect(near(mid.fov, 60)).toBe(true);
  });
});

describe("yaw math", () => {
  test("yawTo points from player toward target", () => {
    expect(near(yawTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 }), 0)).toBe(true);
    expect(near(yawTo({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }), Math.PI / 2)).toBe(true);
  });

  test("angleDelta wraps to the short way around", () => {
    expect(near(angleDelta(3.0, -3.0), 0.283185307, 1e-6)).toBe(true);
    expect(Math.abs(angleDelta(3.0, -3.0))).toBeLessThan(Math.PI);
  });

  test("smoothYaw moves toward the desired angle across the wrap seam", () => {
    const next = smoothYaw(3.1, -3.1, 9, 0.016);
    expect(next).toBeGreaterThan(3.1);
  });
});

describe("lockOnPose", () => {
  test("camera sits behind the player away from the target and yaw faces target", () => {
    const player = { x: 0, y: 0, z: 0 };
    const target = { x: 0, y: 0, z: 8 };
    const { pose, yaw } = lockOnPose(player, target, { distance: 5, height: 2, framingBias: 0.5 }, 55);
    expect(near(yaw, 0)).toBe(true);
    expect(pose.position.z).toBeLessThan(0);
    expect(near(pose.position.y, 2)).toBe(true);
    expect(pose.lookAt.z).toBeGreaterThan(0);
  });
});

describe("shoulder rig", () => {
  test("shoulder swap flips lateral offset sign", () => {
    const shoulder = resolveShoulder({ shoulderOffset: 1, heightOffset: 1.6, distance: 3 }, false);
    const right = shoulderPose({ x: 0, y: 0, z: 0 }, 0, 0, 1, shoulder);
    const left = shoulderPose({ x: 0, y: 0, z: 0 }, 0, 0, -1, shoulder);
    expect(Math.sign(right.position.x)).toBe(1);
    expect(Math.sign(left.position.x)).toBe(-1);
  });

  test("ADS narrows FOV and pulls the boom in", () => {
    const hip = resolveShoulder({ distance: 3.2, fov: 55 }, false);
    const ads = resolveShoulder({ distance: 3.2, fov: 55 }, true);
    expect(ads.fov).toBeLessThan(hip.fov);
    expect(ads.distance).toBeLessThan(hip.distance);
    const mid = blendShoulder(hip, ads, 0.5);
    expect(mid.fov).toBeGreaterThan(ads.fov);
    expect(mid.fov).toBeLessThan(hip.fov);
  });
});

describe("chase rig", () => {
  test("desired position trails behind the vehicle heading", () => {
    const resolved = resolveChase({ distance: 6, height: 3 });
    const pos = chaseDesiredPosition({ x: 0, y: 0, z: 0 }, 0, resolved);
    expect(near(pos.z, -6, 1e-6)).toBe(true);
    expect(near(pos.y, 3)).toBe(true);
  });

  test("seat pose faces forward from the vehicle", () => {
    const pose = seatPose({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 1, z: 0.5 }, 60);
    expect(pose.lookAt.z).toBeGreaterThan(pose.position.z);
  });
});

describe("cinematicSample", () => {
  const keyframes = [
    { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 1 }, fov: 50 },
    { position: { x: 10, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 1 }, fov: 50, duration: 2, ease: "linear" as const },
  ];

  test("interpolates across a segment and reports done at the end", () => {
    const start = cinematicSample(keyframes, 0, false, 55);
    expect(start.pose.position.x).toBe(0);
    const mid = cinematicSample(keyframes, 1, false, 55);
    expect(near(mid.pose.position.x, 5)).toBe(true);
    const end = cinematicSample(keyframes, 2, false, 55);
    expect(near(end.pose.position.x, 10)).toBe(true);
    expect(end.done).toBe(true);
  });

  test("loop wraps back to the start", () => {
    const wrapped = cinematicSample(keyframes, 2, true, 55);
    expect(near(wrapped.pose.position.x, 0, 1e-4)).toBe(true);
  });
});

describe("observerPose", () => {
  test("orbits the subject at the configured distance and height", () => {
    const resolved = resolveObserver({ distance: 10, height: 4, lookHeight: 1 });
    const pose = observerPose({ x: 0, y: 0, z: 0 }, 0, resolved, 55);
    expect(near(pose.position.x, 0, 1e-4)).toBe(true);
    expect(near(pose.position.z, 10, 1e-4)).toBe(true);
    expect(near(pose.position.y, 4)).toBe(true);
    expect(pose.lookAt).toEqual({ x: 0, y: 1, z: 0 });
  });

  test("follows the subject as it moves and always looks at it", () => {
    const resolved = resolveObserver(undefined);
    const pose = observerPose({ x: 5, y: 0, z: 5 }, Math.PI / 2, resolved, 55);
    expect(near(pose.position.z, 5, 1e-4)).toBe(true);
    expect(near(pose.position.x, 5 + resolved.distance, 1e-4)).toBe(true);
    expect(pose.lookAt.x).toBe(5);
    expect(pose.lookAt.z).toBe(5);
  });

  test("resolveObserver applies defaults", () => {
    const resolved = resolveObserver(undefined);
    expect(resolved).toEqual({ distance: 8, height: 3, lookHeight: 1.2, orbitSpeed: 0.2 });
  });
});

describe("sideOnPose", () => {
  test("resolveSideOn applies defaults", () => {
    const resolved = resolveSideOn(undefined);
    expect(resolved).toEqual({ distance: 10, height: 2, lookHeight: 1, axis: "x", facing: 1, followSmoothing: 8 });
  });

  test("offsets along x by distance*facing and looks back at the subject", () => {
    const resolved = resolveSideOn({ distance: 10, height: 2, lookHeight: 1, axis: "x", facing: 1 });
    const pose = sideOnPose({ x: 0, y: 0, z: 0 }, resolved, 55);
    expect(near(pose.position.x, 10)).toBe(true);
    expect(near(pose.position.z, 0)).toBe(true);
    expect(near(pose.position.y, 2)).toBe(true);
    expect(pose.lookAt).toEqual({ x: 0, y: 1, z: 0 });
  });

  test("negative facing flips to the other side of the subject", () => {
    const resolved = resolveSideOn({ distance: 10, axis: "x", facing: -1 });
    const pose = sideOnPose({ x: 3, y: 0, z: 0 }, resolved, 55);
    expect(near(pose.position.x, -7)).toBe(true);
  });

  test("axis z offsets along z instead of x", () => {
    const resolved = resolveSideOn({ distance: 6, axis: "z", facing: 1 });
    const pose = sideOnPose({ x: 0, y: 0, z: 4 }, resolved, 55);
    expect(near(pose.position.x, 0)).toBe(true);
    expect(near(pose.position.z, 10)).toBe(true);
  });

  test("follows the subject as it moves and always looks at it", () => {
    const resolved = resolveSideOn(undefined);
    const pose = sideOnPose({ x: 2, y: 0, z: 5 }, resolved, 55);
    expect(near(pose.position.x, 2 + resolved.distance)).toBe(true);
    expect(pose.lookAt.z).toBe(5);
  });
});

describe("helpers", () => {
  test("clamp and smoothstep behave at the boundaries", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(near(smoothstep(0.5), 0.5)).toBe(true);
  });
});
