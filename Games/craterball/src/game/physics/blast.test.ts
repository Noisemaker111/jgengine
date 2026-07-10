import { describe, expect, test } from "bun:test";
import { applyBlastImpulse, computeBlastImpulse } from "./blast";

const CONFIG = { radius: 6, power: 10 };

describe("craterball blast impulse", () => {
  test("target outside the radius takes no impulse", () => {
    expect(computeBlastImpulse({ x: 0, z: 0 }, { x: 10, z: 0 }, CONFIG)).toBeNull();
  });

  test("impulse falls off linearly with distance", () => {
    const close = computeBlastImpulse({ x: 0, z: 0 }, { x: 1, z: 0 }, CONFIG)!;
    const far = computeBlastImpulse({ x: 0, z: 0 }, { x: 5, z: 0 }, CONFIG)!;
    const closeMagnitude = Math.hypot(close.vx, close.vz);
    const farMagnitude = Math.hypot(far.vx, far.vz);
    expect(closeMagnitude).toBeGreaterThan(farMagnitude);
    expect(close.falloff).toBeCloseTo(1 - 1 / 6, 5);
    expect(far.falloff).toBeCloseTo(1 - 5 / 6, 5);
  });

  test("launch vector points away from the blast source", () => {
    const impulse = computeBlastImpulse({ x: 0, z: 0 }, { x: 3, z: 4 }, CONFIG)!;
    expect(impulse.vx).toBeGreaterThan(0);
    expect(impulse.vz).toBeGreaterThan(0);
    expect(impulse.vx / impulse.vz).toBeCloseTo(3 / 4, 5);
  });

  test("a charge landing exactly on the target still launches it", () => {
    const impulse = computeBlastImpulse({ x: 2, z: 2 }, { x: 2, z: 2 }, CONFIG)!;
    expect(impulse).not.toBeNull();
    expect(Math.hypot(impulse.vx, impulse.vz)).toBeCloseTo(CONFIG.power, 5);
  });

  test("applyBlastImpulse adds the impulse onto existing velocity", () => {
    const target = applyBlastImpulse({ x: 0, z: 0 }, { x: 2, z: 0, vx: 1, vz: 1 }, CONFIG);
    expect(target.vx).toBeGreaterThan(1);
    expect(target.vz).toBeCloseTo(1, 5);
  });

  test("applyBlastImpulse is a no-op outside the radius", () => {
    const target = applyBlastImpulse({ x: 0, z: 0 }, { x: 20, z: 0, vx: 1, vz: 1 }, CONFIG);
    expect(target).toEqual({ x: 20, z: 0, vx: 1, vz: 1 });
  });
});
