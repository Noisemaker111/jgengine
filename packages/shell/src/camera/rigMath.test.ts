import { describe, expect, test } from "bun:test";

import {
  addTrauma,
  angleDelta,
  bankRollStep,
  blendShoulder,
  CALIBRATED_TRAUMA_SHAKE_FREQUENCY,
  CALIBRATED_TRAUMA_SHAKE_MAX_OFFSET,
  CALIBRATED_TRAUMA_SHAKE_MAX_ROLL,
  chaseDesiredPosition,
  cinematicSample,
  clamp,
  createTrauma,
  crossfadePose,
  leadFollowPoint,
  lockOnPose,
  observerPose,
  resolveChase,
  resolveDirectedCamera,
  resolveObserver,
  resolveShoulder,
  resolveSideScroll,
  resolveSideScrollPose,
  rtsPanKeysConflict,
  seatPose,
  shakeOffset,
  shoulderPose,
  sideScrollFollowBlend,
  smoothstep,
  smoothYaw,
  speedToFov,
  springArmStep,
  stepTrauma,
  topDownPose,
  traumaShake,
  velocityYawTarget,
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

describe("traumaShake", () => {
  test("small trauma stays tiny relative to full trauma", () => {
    const small = traumaShake(0.05, 0.37);
    const full = traumaShake(1, 0.37);
    const smallMag = Math.hypot(small.x, small.y);
    const fullMag = Math.hypot(full.x, full.y);
    expect(smallMag).toBeGreaterThanOrEqual(0);
    expect(smallMag).toBeLessThan(fullMag);
  });

  test("zero trauma produces zero offset", () => {
    expect(traumaShake(0, 1.1)).toEqual({ x: 0, y: 0, roll: 0 });
  });

  test("offset and roll stay within the calibrated caps at full trauma", () => {
    for (let i = 0; i <= 20; i += 1) {
      const offset = traumaShake(1, i * 0.031);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(CALIBRATED_TRAUMA_SHAKE_MAX_OFFSET + 1e-9);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(CALIBRATED_TRAUMA_SHAKE_MAX_OFFSET + 1e-9);
      expect(Math.abs(offset.roll)).toBeLessThanOrEqual(CALIBRATED_TRAUMA_SHAKE_MAX_ROLL + 1e-9);
    }
  });

  test("out-of-range trauma clamps into [0,1]", () => {
    expect(traumaShake(-1, 0.5)).toEqual(traumaShake(0, 0.5));
    expect(traumaShake(5, 0.5)).toEqual(traumaShake(1, 0.5));
  });

  test("matches shakeOffset driven by the calibrated constants directly", () => {
    const direct = shakeOffset(
      { trauma: 1, time: 0.6 },
      {
        maxOffset: CALIBRATED_TRAUMA_SHAKE_MAX_OFFSET,
        maxRoll: CALIBRATED_TRAUMA_SHAKE_MAX_ROLL,
        frequency: CALIBRATED_TRAUMA_SHAKE_FREQUENCY,
      },
    );
    expect(traumaShake(1, 0.6)).toEqual(direct);
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
    const facingNorth = Math.PI;
    const right = shoulderPose({ x: 0, y: 0, z: 0 }, facingNorth, 0, 1, shoulder);
    const left = shoulderPose({ x: 0, y: 0, z: 0 }, facingNorth, 0, -1, shoulder);
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

describe("resolveSideScroll", () => {
  test("applies defaults", () => {
    expect(resolveSideScroll(undefined)).toEqual({
      axis: "x",
      distance: 10,
      height: 3,
      lookHeight: 1,
      followSmoothing: 8,
    });
  });

  test("honors overrides", () => {
    expect(resolveSideScroll({ axis: "z", distance: 6, height: 2, lookHeight: 0.5, followSmoothing: 0 })).toEqual({
      axis: "z",
      distance: 6,
      height: 2,
      lookHeight: 0.5,
      followSmoothing: 0,
    });
  });
});

describe("resolveSideScrollPose", () => {
  test("axis x watches from the +z perpendicular side", () => {
    const resolved = resolveSideScroll({ axis: "x", distance: 10, height: 3, lookHeight: 1 });
    const pose = resolveSideScrollPose({ x: 5, y: 0, z: 2 }, resolved, 55);
    expect(near(pose.position.x, 5)).toBe(true);
    expect(near(pose.position.z, 12)).toBe(true);
    expect(near(pose.position.y, 3)).toBe(true);
    expect(pose.lookAt).toEqual({ x: 5, y: 1, z: 2 });
    expect(pose.fov).toBe(55);
  });

  test("axis z watches from the +x perpendicular side", () => {
    const resolved = resolveSideScroll({ axis: "z", distance: 8, height: 4, lookHeight: 2 });
    const pose = resolveSideScrollPose({ x: -3, y: 1, z: 6 }, resolved, 60);
    expect(near(pose.position.x, 5)).toBe(true);
    expect(near(pose.position.z, 6)).toBe(true);
    expect(near(pose.position.y, 5)).toBe(true);
    expect(pose.lookAt).toEqual({ x: -3, y: 3, z: 6 });
  });
});

describe("sideScrollFollowBlend", () => {
  test("zero smoothing hard-locks (blend of 1) regardless of dt", () => {
    expect(sideScrollFollowBlend(0, 0.016)).toBe(1);
    expect(sideScrollFollowBlend(0, 1)).toBe(1);
  });

  test("positive smoothing follows the same exponential curve as other rigs", () => {
    const blend = sideScrollFollowBlend(8, 0.1);
    expect(blend).toBeGreaterThan(0);
    expect(blend).toBeLessThan(1);
    expect(near(blend, 1 - Math.exp(-8 * 0.1))).toBe(true);
  });
});

describe("resolveDirectedCamera", () => {
  test("passes the static config through when the director is absent", () => {
    const result = resolveDirectedCamera(undefined, { followEntityId: "hero", cinematic: undefined });
    expect(result).toEqual({ followEntityId: "hero", cinematic: undefined });
  });

  test("passes the static config through when the director reports no override", () => {
    const result = resolveDirectedCamera(
      { followEntityId: undefined, cinematic: null },
      { followEntityId: "hero", cinematic: undefined },
    );
    expect(result).toEqual({ followEntityId: "hero", cinematic: undefined });
  });

  test("director follow(null) explicitly overrides the static follow target", () => {
    const result = resolveDirectedCamera(
      { followEntityId: null, cinematic: null },
      { followEntityId: "hero", cinematic: undefined },
    );
    expect(result.followEntityId).toBeNull();
  });

  test("director follow(id) overrides the static follow target", () => {
    const result = resolveDirectedCamera(
      { followEntityId: "villain", cinematic: null },
      { followEntityId: "hero", cinematic: undefined },
    );
    expect(result.followEntityId).toBe("villain");
  });

  test("director cinematic wins over the static cinematic", () => {
    const staticCinematic = { keyframes: [] };
    const directorCinematic = { keyframes: [], loop: true };
    const result = resolveDirectedCamera(
      { followEntityId: undefined, cinematic: directorCinematic },
      { followEntityId: "hero", cinematic: staticCinematic },
    );
    expect(result.cinematic).toBe(directorCinematic);
  });

  test("director cinematic(null) falls back to the static cinematic", () => {
    const staticCinematic = { keyframes: [] };
    const result = resolveDirectedCamera(
      { followEntityId: undefined, cinematic: null },
      { followEntityId: "hero", cinematic: staticCinematic },
    );
    expect(result.cinematic).toBe(staticCinematic);
  });
});

describe("rtsPanKeysConflict", () => {
  test("no conflict when the game declares no input map", () => {
    expect(rtsPanKeysConflict(undefined)).toBe(false);
    expect(rtsPanKeysConflict({})).toBe(false);
  });

  test("no conflict when bound codes never touch WASD", () => {
    expect(rtsPanKeysConflict({ jump: ["Space"], interact: ["KeyE"] })).toBe(false);
  });

  test("flags a conflict for a flat code list binding a WASD key", () => {
    expect(rtsPanKeysConflict({ moveForward: ["KeyW"] })).toBe(true);
  });

  test("flags a conflict for a WASD key inside the hold/toggle object form", () => {
    expect(rtsPanKeysConflict({ crouch: { hold: ["KeyD"] } })).toBe(true);
    expect(rtsPanKeysConflict({ sprint: { toggle: ["KeyA"] } })).toBe(true);
  });

  test("arrow keys and Q/E never count as a conflict", () => {
    expect(rtsPanKeysConflict({ turn: ["ArrowLeft", "ArrowRight"], lean: ["KeyQ", "KeyE"] })).toBe(false);
  });
});

describe("resolveChase defaults for lead/bank", () => {
  test("leadTime 0, leadMax 4, bankPerYawRate 0, bankMax 0.35, bankDamping 8", () => {
    const resolved = resolveChase(undefined);
    expect(resolved.leadTime).toBe(0);
    expect(resolved.leadMax).toBe(4);
    expect(resolved.bankPerYawRate).toBe(0);
    expect(resolved.bankMax).toBeCloseTo(0.35, 5);
    expect(resolved.bankDamping).toBe(8);
  });
});

describe("leadFollowPoint", () => {
  test("zero lead when leadTime is 0", () => {
    const resolved = resolveChase(undefined);
    const follow = { x: 5, y: 0, z: 5 };
    const previous = { x: 0, y: 0, z: 0 };
    expect(leadFollowPoint(follow, previous, 1 / 60, resolved)).toEqual(follow);
  });

  test("leads along the target's frame velocity scaled by leadTime", () => {
    const resolved = resolveChase({ lead: { time: 0.5, max: 10 } });
    const follow = { x: 5, y: 0, z: 5 };
    const previous = { x: 0, y: 0, z: 0 };
    expect(leadFollowPoint(follow, previous, 1, resolved)).toEqual({ x: 7.5, y: 0, z: 7.5 });
  });

  test("clamps the lead offset to leadMax", () => {
    const resolved = resolveChase({ lead: { time: 1, max: 1 } });
    const follow = { x: 100, y: 0, z: 0 };
    const previous = { x: 0, y: 0, z: 0 };
    expect(leadFollowPoint(follow, previous, 1, resolved)).toEqual({ x: 101, y: 0, z: 0 });
  });
});

describe("bankRollStep", () => {
  test("zero when bankPerYawRate is 0", () => {
    const resolved = resolveChase(undefined);
    expect(bankRollStep(0, 1.0, 0.5, 1 / 60, resolved)).toBe(0);
  });

  test("rolls opposite the yaw rate's sign", () => {
    const resolved = resolveChase({ bank: { perYawRate: 1, max: 0.5, damping: 8 } });
    expect(bankRollStep(0, 1.0, 0.5, 1, resolved)).toBeLessThan(0);
    expect(bankRollStep(0, 0.5, 1.0, 1, resolved)).toBeGreaterThan(0);
  });

  test("clamps the roll target at bankMax", () => {
    const resolved = resolveChase({ bank: { perYawRate: 1, max: 0.5, damping: 8 } });
    expect(Math.abs(bankRollStep(0, 100, 0, 1, resolved))).toBeCloseTo(0.5, 5);
  });

  test("damps toward the target roll over successive steps", () => {
    const resolved = resolveChase({ bank: { perYawRate: 1, max: 10, damping: 2 } });
    const dt = 1 / 60;
    let roll = 0;
    let previous = 0;
    for (let i = 0; i < 5; i += 1) {
      const next = bankRollStep(roll, 1, 0, dt, resolved);
      expect(Math.abs(next)).toBeGreaterThan(Math.abs(previous));
      previous = next;
      roll = next;
    }
    for (let i = 0; i < 295; i += 1) roll = bankRollStep(roll, 1, 0, dt, resolved);
    expect(roll).toBeCloseTo(-10, 1);
  });
});

describe("resolveChase velocityYaw defaults", () => {
  test("absent block leaves drift-lag off (blend 0)", () => {
    expect(resolveChase(undefined).velocityYawBlend).toBe(0);
    expect(resolveChase({ distance: 6 }).velocityYawBlend).toBe(0);
  });

  test("present block defaults blend 0.65, minSpeed 4, response 6", () => {
    const r = resolveChase({ velocityYaw: {} });
    expect(r.velocityYawBlend).toBe(0.65);
    expect(r.velocityYawMinSpeed).toBe(4);
    expect(r.velocityYawResponse).toBe(6);
  });

  test("present block honors overrides", () => {
    const r = resolveChase({ velocityYaw: { blend: 0.3, minSpeed: 8, response: 10 } });
    expect(r.velocityYawBlend).toBe(0.3);
    expect(r.velocityYawMinSpeed).toBe(8);
    expect(r.velocityYawResponse).toBe(10);
  });
});

describe("velocityYawTarget", () => {
  // 30° slip: velocity direction is `slip` radians off the heading, at `speed` planar u/s.
  const drift = (heading: number, slip: number, speed: number): { x: number; y: number; z: number } => {
    const dir = heading + slip;
    return { x: speed * Math.sin(dir), y: 0, z: speed * Math.cos(dir) };
  };

  test("feature off (no config) returns the raw heading, so the chase pose is unchanged", () => {
    const resolved = resolveChase(undefined);
    const velocity = drift(0.7, Math.PI / 6, 12);
    expect(velocityYawTarget(0.7, velocity, resolved)).toBe(0.7);
    // and threading that anchor through the chase pose equals the pure-heading pose byte-for-byte
    const follow = { x: 1, y: 2, z: 3 };
    const anchor = velocityYawTarget(0.7, velocity, resolved);
    expect(chaseDesiredPosition(follow, anchor, resolved)).toEqual(chaseDesiredPosition(follow, 0.7, resolved));
  });

  test("straight driving (velocity aligned with heading) leaves the anchor on the heading", () => {
    const resolved = resolveChase({ velocityYaw: {} });
    const velocity = drift(1.0, 0, 20);
    expect(near(velocityYawTarget(1.0, velocity, resolved), 1.0, 1e-9)).toBe(true);
  });

  test("30° slip rotates the anchor toward velocity by blend × slip-fraction of the slip", () => {
    const resolved = resolveChase({ velocityYaw: {} });
    const heading = 0;
    const slip = Math.PI / 6;
    const velocity = drift(heading, slip, 10);
    const result = velocityYawTarget(heading, velocity, resolved);
    const slipFraction = Math.abs(slip) / (Math.PI / 2);
    const expected = heading + slip * 0.65 * slipFraction;
    expect(near(result, expected, 1e-9)).toBe(true);
    // rotated toward velocity (camera reveals the car's side) but not all the way there
    expect(result).toBeGreaterThan(heading);
    expect(result).toBeLessThan(slip);
  });

  test("reverse gear (velocity opposed to heading) never swings the camera around", () => {
    const resolved = resolveChase({ velocityYaw: {} });
    expect(velocityYawTarget(0, { x: 0, y: 0, z: -10 }, resolved)).toBe(0);
    // even a reversing slide (some lateral component) stays on the heading
    expect(velocityYawTarget(0, { x: 3, y: 0, z: -10 }, resolved)).toBe(0);
  });

  test("below minSpeed the feature is fully off (parking-lot stability)", () => {
    const resolved = resolveChase({ velocityYaw: {} });
    const velocity = drift(0, Math.PI / 6, 2); // speed 2 < default minSpeed 4
    expect(velocityYawTarget(0, velocity, resolved)).toBe(0);
  });

  test("blends across the ±PI wrap seam by the shortest arc", () => {
    const resolved = resolveChase({ velocityYaw: {} });
    const heading = Math.PI - 0.05;
    const velYaw = -(Math.PI - 0.05); // ~0.1 rad away, the short way, over the seam
    const speed = 10;
    const velocity = { x: speed * Math.sin(velYaw), y: 0, z: speed * Math.cos(velYaw) };
    const result = velocityYawTarget(heading, velocity, resolved);
    const slip = angleDelta(heading, velYaw);
    const slipFraction = Math.abs(slip) / (Math.PI / 2);
    const expected = heading + slip * 0.65 * slipFraction;
    expect(near(result, expected, 1e-9)).toBe(true);
    // moved a short amount off the heading, not the long way around the circle
    const moved = angleDelta(heading, result);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(Math.abs(slip));
    expect(result).toBeGreaterThan(heading);
    expect(result).toBeLessThan(heading + Math.abs(slip));
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
