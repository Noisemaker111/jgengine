import { describe, expect, test } from "bun:test";

import {
  clampBoomToHit,
  createChaseRigState,
  resolveChase,
  stepChase,
  type ChaseSample,
} from "./rigMath";
import type { Vec3 } from "./orbitCameraMath";

const DT = 1 / 60;

function sample(follow: Vec3, overrides: Partial<ChaseSample> = {}): ChaseSample {
  return { follow, yaw: 0, bodyPitch: 0, velocity: null, lookBack: false, fovKick: 0, ...overrides };
}

function planarGap(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("stepChase", () => {
  test("holds the boom length at high constant speed instead of falling behind", () => {
    const resolved = resolveChase({ distance: 4.2, height: 1.8, springDamping: 7 });
    const state = createChaseRigState();
    const speed = 62;
    let pose = stepChase(state, sample({ x: 0, y: 0, z: 0 }), resolved, DT).pose;
    let follow: Vec3 = { x: 0, y: 0, z: 0 };
    for (let i = 1; i <= 600; i += 1) {
      follow = { x: 0, y: 0, z: speed * DT * i };
      pose = stepChase(state, sample(follow, { velocity: { x: 0, y: 0, z: speed } }), resolved, DT).pose;
    }
    expect(planarGap(pose.position, follow)).toBeCloseTo(4.2, 3);
    expect(pose.position.z).toBeLessThan(follow.z);
  });

  test("reads speed from published sim velocity when the render frame saw no position change", () => {
    const resolved = resolveChase({ fov: { base: 55, max: 75, speedForMax: 50, response: Infinity } });
    const state = createChaseRigState();
    stepChase(state, sample({ x: 0, y: 0, z: 10 }), resolved, DT);
    const step = stepChase(state, sample({ x: 0, y: 0, z: 10 }, { velocity: { x: 0, y: 0, z: 25 } }), resolved, DT);
    expect(step.speed).toBe(25);
    expect(step.pose.fov).toBeCloseTo(65, 6);
  });

  test("falls back to the frame position delta when no velocity is published", () => {
    const resolved = resolveChase({});
    const state = createChaseRigState();
    stepChase(state, sample({ x: 0, y: 0, z: 0 }), resolved, 0.5);
    expect(stepChase(state, sample({ x: 0, y: 0, z: 5 }), resolved, 0.5).speed).toBeCloseTo(10, 6);
  });

  test("eases FOV toward the speed curve instead of jumping", () => {
    const resolved = resolveChase({ fov: { base: 55, max: 75, speedForMax: 10, response: 6 } });
    const state = createChaseRigState();
    stepChase(state, sample({ x: 0, y: 0, z: 0 }, { velocity: null }), resolved, DT);
    const fast = { x: 0, y: 0, z: 10 };
    const first = stepChase(state, sample({ x: 0, y: 0, z: 0 }, { velocity: fast }), resolved, DT).pose.fov;
    expect(first).toBeGreaterThan(55);
    expect(first).toBeLessThan(58);
    let fov = first;
    for (let i = 0; i < 180; i += 1) fov = stepChase(state, sample({ x: 0, y: 0, z: 0 }, { velocity: fast }), resolved, DT).pose.fov;
    expect(fov).toBeCloseTo(75, 3);
  });

  test("pulls the boom back with speed", () => {
    const resolved = resolveChase({ distance: 5, height: 0, springDamping: Infinity, distanceBySpeed: { extra: 3, speedForMax: 40 } });
    const state = createChaseRigState();
    const at = { x: 0, y: 0, z: 0 };
    stepChase(state, sample(at), resolved, DT);
    const pose = stepChase(state, sample(at, { velocity: { x: 0, y: 0, z: 20 } }), resolved, DT).pose;
    expect(planarGap(pose.position, at)).toBeCloseTo(6.5, 6);
  });

  test("tilts the boom with a nose-up body so the camera drops behind a climb", () => {
    const resolved = resolveChase({ distance: 6, height: 2, pitchFollow: { response: Infinity } });
    const level = stepChase(createChaseRigState(), sample({ x: 0, y: 0, z: 0 }), resolved, DT).pose;
    const climb = stepChase(createChaseRigState(), sample({ x: 0, y: 0, z: 0 }, { bodyPitch: -0.3 }), resolved, DT).pose;
    expect(climb.position.y).toBeLessThan(level.position.y);
    expect(climb.lookAt.y).toBeGreaterThan(level.lookAt.y);
    expect(Math.hypot(climb.position.y, climb.position.z)).toBeCloseTo(Math.hypot(level.position.y, level.position.z), 6);
  });

  test("keeps a level boom when pitchFollow is omitted", () => {
    const resolved = resolveChase({ distance: 6, height: 2 });
    const pose = stepChase(createChaseRigState(), sample({ x: 0, y: 0, z: 0 }, { bodyPitch: -0.3 }), resolved, DT).pose;
    expect(pose.position.x).toBeCloseTo(0, 9);
    expect(pose.position.y).toBeCloseTo(2, 9);
    expect(pose.position.z).toBeCloseTo(-6, 9);
  });

  test("look-back snaps the camera in front of the target and reports the forward yaw", () => {
    const resolved = resolveChase({ distance: 6, height: 2 });
    const state = createChaseRigState();
    stepChase(state, sample({ x: 0, y: 0, z: 0 }), resolved, DT);
    const back = stepChase(state, sample({ x: 0, y: 0, z: 0 }, { lookBack: true }), resolved, DT);
    expect(back.pose.position.z).toBeCloseTo(6, 6);
    expect(back.pose.lookAt.z).toBeLessThan(0);
    expect(back.anchorYaw).toBeCloseTo(0, 6);
    const forward = stepChase(state, sample({ x: 0, y: 0, z: 0 }), resolved, DT);
    expect(forward.pose.position.z).toBeCloseTo(-6, 6);
  });

  test("look-back frames the target itself rather than the velocity-led point", () => {
    const resolved = resolveChase({ distance: 6, height: 2, lead: { time: 0.5, max: 3 } });
    const state = createChaseRigState();
    const moving = { velocity: { x: 0, y: 0, z: 30 } };
    stepChase(state, sample({ x: 0, y: 0, z: 0 }, moving), resolved, DT);
    const back = stepChase(state, sample({ x: 0, y: 0, z: 0 }, { ...moving, lookBack: true }), resolved, DT);
    expect(back.pose.position.z).toBeCloseTo(6, 6);
  });

  test("layers an FOV kick that decays back to the curve", () => {
    const resolved = resolveChase({ fov: { base: 60, max: 60 }, fovKick: { decay: 8, max: 10 } });
    const state = createChaseRigState();
    const kicked = stepChase(state, sample({ x: 0, y: 0, z: 0 }, { fovKick: 25 }), resolved, DT).pose.fov;
    expect(kicked).toBeCloseTo(70, 6);
    let fov = kicked;
    for (let i = 0; i < 120; i += 1) fov = stepChase(state, sample({ x: 0, y: 0, z: 0 }), resolved, DT).pose.fov;
    expect(fov).toBeCloseTo(60, 3);
  });

  test("a boom clamp pulls the camera in, and the spring eases it back out once clear", () => {
    const resolved = resolveChase({ distance: 6, height: 0, lookHeight: 0, springDamping: 6 });
    const state = createChaseRigState();
    const at = { x: 0, y: 0, z: 0 };
    const wall = (pivot: Vec3, desired: Vec3) => clampBoomToHit(pivot, desired, 2, 0.3, 0.8);
    const blocked = stepChase(state, sample(at), resolved, DT, wall).pose;
    expect(planarGap(blocked.position, at)).toBeCloseTo(1.7, 6);
    const released = stepChase(state, sample(at), resolved, DT).pose;
    expect(planarGap(released.position, at)).toBeGreaterThan(1.7);
    expect(planarGap(released.position, at)).toBeLessThan(6);
  });
});

describe("clampBoomToHit", () => {
  const pivot = { x: 0, y: 1, z: 0 };
  const desired = { x: 0, y: 1, z: -6 };

  test("passes the desired point through when nothing was hit", () => {
    expect(clampBoomToHit(pivot, desired, null, 0.3, 0.8)).toBe(desired);
  });

  test("never pulls closer than minDistance", () => {
    expect(clampBoomToHit(pivot, desired, 0.2, 0.3, 0.8).z).toBeCloseTo(-0.8, 6);
  });

  test("a hit beyond the boom leaves it at full length", () => {
    expect(clampBoomToHit(pivot, desired, 9, 0.3, 0.8).z).toBeCloseTo(-6, 6);
  });
});
