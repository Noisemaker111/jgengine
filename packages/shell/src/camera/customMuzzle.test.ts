import { describe, expect, test } from "bun:test";
import { Camera, Group, Object3D, PerspectiveCamera, Vector3 } from "three";
import { readFirstPersonMuzzle } from "./GameFirstPersonCamera";
import { registerFirstPersonMuzzle, registerTrackedFirstPersonMuzzle } from "./customMuzzle";

const at = (x: number, y = 0, z = 0) => (target: Vector3) => { target.set(x, y, z); return true; };

describe("camera-scoped presentation muzzle", () => {
  test("an absent or unavailable reader preserves the supplied authoritative origin", () => {
    const camera = new Camera();
    const target = new Vector3(1, 2, 3);
    expect(readFirstPersonMuzzle(target, camera)).toBe(false);
    expect(target.toArray()).toEqual([1, 2, 3]);
    const dispose = registerFirstPersonMuzzle(camera, (scratch) => { scratch.set(9, 9, 9); return false; });
    try {
      expect(readFirstPersonMuzzle(target, camera)).toBe(false);
      expect(target.toArray()).toEqual([1, 2, 3]);
    } finally { dispose(); }
  });

  test("stock readers retain scoped and legacy compatibility", () => {
    const camera = new Camera();
    const target = new Vector3();
    const dispose = registerTrackedFirstPersonMuzzle(camera, at(1, 2, 3));
    try {
      expect(readFirstPersonMuzzle(target, camera)).toBe(true);
      expect(target.toArray()).toEqual([1, 2, 3]);
      expect(readFirstPersonMuzzle(target)).toBe(true);
      expect(target.toArray()).toEqual([1, 2, 3]);
    } finally { dispose(); }
    expect(readFirstPersonMuzzle(target, camera)).toBe(false);
  });

  test("custom priority and fallback only consider this camera", () => {
    const camera = new Camera();
    const other = new Camera();
    const target = new Vector3();
    const stock = registerTrackedFirstPersonMuzzle(camera, at(1));
    const foreign = registerFirstPersonMuzzle(other, at(9));
    const custom = registerFirstPersonMuzzle(camera, at(2));
    const unavailable = registerFirstPersonMuzzle(camera, () => false);
    try {
      expect(readFirstPersonMuzzle(target, camera)).toBe(true);
      expect(target.x).toBe(2);
      expect(readFirstPersonMuzzle(target, other)).toBe(true);
      expect(target.x).toBe(9);
      custom();
      expect(readFirstPersonMuzzle(target, camera)).toBe(true);
      expect(target.x).toBe(1);
      stock();
      expect(readFirstPersonMuzzle(target, camera)).toBe(false);
      expect(readFirstPersonMuzzle(target, other)).toBe(true);
      expect(target.x).toBe(9);
    } finally { stock(); foreign(); custom(); unavailable(); }
  });

  test("old and repeated cleanup cannot remove a newer owner or another camera", () => {
    const a = new Camera();
    const b = new Camera();
    const target = new Vector3();
    const reader = at(3);
    const old = registerFirstPersonMuzzle(a, reader);
    const next = registerFirstPersonMuzzle(a, reader);
    const other = registerFirstPersonMuzzle(b, at(7));
    try {
      old(); old();
      expect(readFirstPersonMuzzle(target, a)).toBe(true);
      expect(target.x).toBe(3);
      next();
      expect(readFirstPersonMuzzle(target, a)).toBe(false);
      expect(readFirstPersonMuzzle(target, b)).toBe(true);
      expect(target.x).toBe(7);
    } finally { old(); next(); other(); }
  });

  test("disposing the newest reader restores the previous live owner", () => {
    const camera = new Camera();
    const target = new Vector3();
    const first = registerFirstPersonMuzzle(camera, at(1));
    const second = registerFirstPersonMuzzle(camera, at(2));
    try {
      readFirstPersonMuzzle(target, camera);
      expect(target.x).toBe(2);
      second();
      readFirstPersonMuzzle(target, camera);
      expect(target.x).toBe(1);
    } finally { first(); second(); }
  });

  test("invalid coordinates do not poison the tracer and can fall back to stock", () => {
    const camera = new Camera();
    const target = new Vector3();
    const stock = registerTrackedFirstPersonMuzzle(camera, at(1));
    const invalid = registerFirstPersonMuzzle(camera, at(NaN));
    try {
      expect(readFirstPersonMuzzle(target, camera)).toBe(true);
      expect(target.toArray()).toEqual([1, 0, 0]);
    } finally { stock(); invalid(); }
  });

  test("reentrant reads cannot recursively call their own reader", () => {
    const camera = new Camera();
    const target = new Vector3();
    const stock = registerTrackedFirstPersonMuzzle(camera, at(4));
    const custom = registerFirstPersonMuzzle(camera, (scratch) => readFirstPersonMuzzle(scratch, camera));
    try {
      expect(readFirstPersonMuzzle(target, camera)).toBe(true);
      expect(target.x).toBe(4);
    } finally { stock(); custom(); }
  });

  test("throwing callbacks release their read guard and preserve the target", () => {
    const camera = new Camera();
    const target = new Vector3(1, 2, 3);
    let throws = true;
    const dispose = registerFirstPersonMuzzle(camera, (scratch) => {
      if (throws) throw new Error("rig failed");
      scratch.set(4, 5, 6);
      return true;
    });
    try {
      expect(() => readFirstPersonMuzzle(target, camera)).toThrow("rig failed");
      expect(target.toArray()).toEqual([1, 2, 3]);
      throws = false;
      expect(readFirstPersonMuzzle(target, camera)).toBe(true);
      expect(target.toArray()).toEqual([4, 5, 6]);
    } finally { dispose(); }
  });

  test("per-camera callbacks are bounded and released slots can be reused", () => {
    const camera = new Camera();
    const dispose = Array.from({ length: 64 }, () => registerFirstPersonMuzzle(camera, () => false));
    try {
      expect(() => registerFirstPersonMuzzle(camera, () => false)).toThrow(RangeError);
      dispose[0]!();
      const reused = registerFirstPersonMuzzle(camera, at(8));
      try {
        const target = new Vector3();
        expect(readFirstPersonMuzzle(target, camera)).toBe(true);
        expect(target.x).toBe(8);
      } finally { reused(); }
    } finally { for (const release of dispose) release(); }
  });

  test("reader cleanup during a read cannot revisit disposed owners or invalidate iteration", () => {
    const camera = new Camera();
    let staleCalls = 0;
    const first = registerFirstPersonMuzzle(camera, () => { staleCalls++; return false; });
    const second = registerFirstPersonMuzzle(camera, () => { staleCalls++; return false; });
    let newestCalls = 0;
    const newest = registerFirstPersonMuzzle(camera, () => {
      newestCalls++;
      first(); second(); newest();
      return false;
    });
    const target = new Vector3(1, 2, 3);
    try {
      expect(readFirstPersonMuzzle(target, camera)).toBe(false);
      expect(target.toArray()).toEqual([1, 2, 3]);
      expect(newestCalls).toBe(1);
      expect(staleCalls).toBe(0);
      expect(readFirstPersonMuzzle(target, camera)).toBe(false);
    } finally { first(); second(); newest(); }
  });
});

test("Scrap Signal-style worldOverlay tip follows hip, aiming, recoil, reload, and weapon changes", () => {
  const camera = new PerspectiveCamera(75, 16 / 9, 0.01, 100);
  camera.position.set(4, 1.62, 8);
  camera.rotation.set(0.12, -0.7, 0);
  camera.updateMatrixWorld();
  const rig = new Group();
  const tip = new Object3D();
  rig.add(tip);
  let equipped = true;
  const dispose = registerFirstPersonMuzzle(camera, (target) => {
    if (!equipped) return false;
    tip.getWorldPosition(target);
    return true;
  });
  try {
    const authoritativeOrigin = [4, 1.4, 8.35] as const;
    const poses = [
      { x: 0.24, y: -0.24, z: -0.5, recoil: 0, reload: 0, tipZ: -0.4 },
      { x: 0.07, y: -0.17, z: -0.42, recoil: 0, reload: 0, tipZ: -0.4 },
      { x: 0.07, y: -0.17, z: -0.42, recoil: 0.1, reload: 0, tipZ: -0.4 },
      { x: 0.24, y: -0.45, z: -0.5, recoil: 0, reload: 0.4, tipZ: -0.4 },
      { x: 0.24, y: -0.24, z: -0.5, recoil: 0, reload: 0, tipZ: -0.7 },
    ];
    const screenPositions: Vector3[] = [];
    for (const pose of poses) {
      rig.position.copy(camera.position);
      rig.quaternion.copy(camera.quaternion);
      rig.translateX(pose.x);
      rig.translateY(pose.y);
      rig.translateZ(pose.z);
      rig.rotateX(pose.recoil - pose.reload * 0.6);
      tip.position.set(0, 0.012, pose.tipZ);
      const start = new Vector3(...authoritativeOrigin);
      expect(readFirstPersonMuzzle(start, camera)).toBe(true);
      const expected = tip.getWorldPosition(new Vector3());
      expect(start.distanceTo(expected)).toBeLessThan(1e-9);
      const projected = start.clone().project(camera);
      expect(projected.x).toBeGreaterThan(0);
      expect(projected.y).toBeLessThan(0);
      screenPositions.push(projected);
      expect(authoritativeOrigin).toEqual([4, 1.4, 8.35]);
    }
    expect(screenPositions[1]!.x).toBeLessThan(screenPositions[0]!.x);
    expect(screenPositions[2]!.distanceTo(screenPositions[1]!)).toBeGreaterThan(0.01);
    expect(screenPositions[3]!.y).toBeLessThan(screenPositions[0]!.y);
    expect(screenPositions[4]!.distanceTo(screenPositions[0]!)).toBeGreaterThan(0.01);
    equipped = false;
    const fallback = new Vector3(...authoritativeOrigin);
    expect(readFirstPersonMuzzle(fallback, camera)).toBe(false);
    expect(fallback.toArray()).toEqual(authoritativeOrigin);
  } finally { dispose(); }
});
