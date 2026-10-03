import { describe, expect, test } from "bun:test";

import { applyVolumeForce, createVolumeTrigger, ForceVolume, PlatformCarry, sampleForceField, validateForceField, type ForceFieldConfig } from "./forceVolume";
import { PhysicsWorld } from "./physicsWorld";

const BOUNDS = { min: [-20, 0, -20] as const, max: [20, 40, 20] as const };

describe("localized force fields", () => {
  const force: ForceFieldConfig = { center: [0, 0, 0], shape: { kind: "sphere", radius: 10 }, strength: 10 };
  test("signed strength attracts and repels with edge falloff", () => {
    expect(sampleForceField(force, [5, 0, 0])).toEqual([-5, 0, 0]);
    expect(sampleForceField({ ...force, strength: -10 }, [5, 0, 0])).toEqual([5, 0, 0]);
    expect(sampleForceField(force, [10, 0, 0])).toEqual([0, 0, 0]);
  });
  test("direction and vortex compose and obey target mask and acceleration cap", () => {
    const config: ForceFieldConfig = { ...force, directionality: 1, direction: [0, 2, 0], attenuation: 0, vortex: { axis: [0, 1, 0], strength: 10 }, mask: 2, maxAcceleration: 4 };
    const out: [number, number, number] = [9, 9, 9];
    expect(sampleForceField(config, [5, 0, 0], 1, out)).toBe(out);
    expect(out).toEqual([0, 0, 0]);
    sampleForceField(config, [5, 0, 0], 2, out);
    expect(Math.hypot(...out)).toBeCloseTo(4);
    expect(out[1]).toBeGreaterThan(0);
    expect(out[2]).toBeLessThan(0);
  });
  test("radial attraction, tangential spin and axial lift tune independently", () => {
    const config: ForceFieldConfig = { ...force, attenuation: 0, vortex: { axis: [0, 2, 0], strength: 3, lift: 4 } };
    expect(sampleForceField(config, [5, 0, 0])).toEqual([-10, 4, -3]);
    expect(sampleForceField({ ...config, strength: 0 }, [5, 0, 0])).toEqual([0, 4, -3]);
    expect(sampleForceField({ ...config, vortex: { ...config.vortex!, strength: 0 } }, [5, 0, 0])).toEqual([-10, 4, 0]);
    expect(sampleForceField({ ...config, vortex: { ...config.vortex!, lift: 0 } }, [5, 0, 0])).toEqual([-10, 0, -3]);
    expect(sampleForceField(config, [0, 0, 0])).toEqual([0, 4, 0]);
    expect(sampleForceField({ ...config, attenuation: 1 }, [5, 0, 0])).toEqual([-5, 2, -1.5]);
    expect(Math.hypot(...sampleForceField({ ...config, maxAcceleration: 2 }, [5, 0, 0]))).toBeCloseTo(2);
    expect(sampleForceField({ ...config, mask: 2 }, [5, 0, 0], 1)).toEqual([0, 0, 0]);
    expect(sampleForceField({ ...config, vortex: { axis: [2, 0, 0], strength: 0, lift: -4 }, strength: 0 }, [0, 5, 0])).toEqual([-4, 0, 0]);
  });
  test("box falloff supports nonuniform extents and finite center samples", () => {
    expect(sampleForceField({ ...force, shape: { kind: "box", halfExtents: [2, 10, 3] } }, [1, 0, 0])).toEqual([-5, 0, 0]);
    expect(sampleForceField(force, [0, 0, 0])).toEqual([0, 0, 0]);
  });
  test("invalid authoring fails before entering the sampler loop", () => {
    expect(() => validateForceField(force)).not.toThrow();
    expect(() => validateForceField({ ...force, shape: { kind: "sphere", radius: 0 } })).toThrow();
    expect(() => validateForceField({ ...force, vortex: { axis: [0, 0, 0], strength: 2 } })).toThrow();
    expect(() => validateForceField({ ...force, vortex: { axis: [0, 1, 0], strength: 2, lift: NaN } })).toThrow();
    expect(() => validateForceField({ ...force, directionality: NaN })).toThrow();
    expect(() => validateForceField({ ...force, mask: -1 })).toThrow();
  });
});

function world(gravity = 0): PhysicsWorld {
  return new PhysicsWorld({ capacity: 64, bounds: BOUNDS, gravity, sleepThresholdSteps: 100000 });
}

describe("ForceVolume", () => {
  test("impulse mode adds velocity to a body inside the region", () => {
    const w = world();
    const body = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    const vol = new ForceVolume({
      bounds: { min: [-2, 0, -2], max: [2, 10, 2] },
      force: [0, 12, 0],
      mode: "impulse",
    });
    vol.apply(w, 1 / 60);
    expect(w.velY[body]!).toBeCloseTo(12, 5);
  });

  test("once mode fires a boost only on entry, not while resident", () => {
    const w = world();
    const body = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    const vol = new ForceVolume({
      bounds: { min: [-2, 0, -2], max: [2, 10, 2] },
      force: [10, 0, 0],
      mode: "impulse",
      once: true,
    });
    vol.apply(w, 1 / 60);
    const afterEntry = w.velX[body]!;
    w.velX[body] = 0;
    vol.apply(w, 1 / 60);
    expect(afterEntry).toBeCloseTo(10, 5);
    expect(w.velX[body]!).toBe(0);
  });

  test("a body outside the region is untouched", () => {
    const w = world();
    const body = w.addBody({ position: [10, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    const vol = new ForceVolume({ bounds: { min: [-2, 0, -2], max: [2, 10, 2] }, force: [0, 5, 0] });
    vol.apply(w, 1 / 60);
    expect(w.velY[body]!).toBe(0);
  });

  test("a body allocated past a hole left by removeBody is still affected", () => {
    const w = world();
    const doomed = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    w.addBody({ position: [10, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    const survivor = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    w.removeBody(doomed);
    const vol = new ForceVolume({
      bounds: { min: [-2, 0, -2], max: [2, 10, 2] },
      force: [0, 12, 0],
      mode: "impulse",
    });
    vol.apply(w, 1 / 60);
    expect(w.velY[survivor]!).toBeCloseTo(12, 5);
  });
});

describe("PlatformCarry", () => {
  test("a rider on top is translated by the platform's delta", () => {
    const w = world();
    const platform = w.addBody({ position: [0, 1, 0], halfExtents: [2, 0.5, 2], static: true });
    const rider = w.addBody({ position: [0, 1.8, 0], halfExtents: [0.3, 0.3, 0.3] });
    const carry = new PlatformCarry(w, platform);
    w.posX[platform] = 3;
    w.posZ[platform] = 1;
    carry.step();
    expect(w.posX[rider]!).toBeCloseTo(3, 5);
    expect(w.posZ[rider]!).toBeCloseTo(1, 5);
  });

  test("a body not standing on the platform is not carried", () => {
    const w = world();
    const platform = w.addBody({ position: [0, 1, 0], halfExtents: [2, 0.5, 2], static: true });
    const off = w.addBody({ position: [10, 1.8, 0], halfExtents: [0.3, 0.3, 0.3] });
    const carry = new PlatformCarry(w, platform);
    w.posX[platform] = 3;
    carry.step();
    expect(w.posX[off]!).toBeCloseTo(10, 5);
  });
});

describe("createVolumeTrigger", () => {
  const BOUNDS = { min: [-2, 0, -2] as const, max: [2, 10, 2] as const };

  test("entered fires only once, on the tick a body first shows up inside", () => {
    const trigger = createVolumeTrigger<string>({ bounds: BOUNDS });
    const first = trigger.step([{ id: "a", position: [0, 5, 0] }]);
    expect(first.entered).toEqual(["a"]);
    const second = trigger.step([{ id: "a", position: [0, 5, 0] }]);
    expect(second.entered).toEqual([]);
  });

  test("inside reports every body inside on every tick", () => {
    const trigger = createVolumeTrigger<string>({ bounds: BOUNDS });
    trigger.step([{ id: "a", position: [0, 5, 0] }]);
    const step = trigger.step([{ id: "a", position: [0, 5, 0] }, { id: "b", position: [1, 5, 0] }]);
    expect(step.inside.sort()).toEqual(["a", "b"]);
  });

  test("exited reports a body that leaves the region", () => {
    const trigger = createVolumeTrigger<string>({ bounds: BOUNDS });
    trigger.step([{ id: "a", position: [0, 5, 0] }]);
    const left = trigger.step([]);
    expect(left.exited).toEqual(["a"]);
    expect(left.inside).toEqual([]);
  });

  test("reset clears membership so a still-present body re-fires entered", () => {
    const trigger = createVolumeTrigger<string>({ bounds: BOUNDS });
    trigger.step([{ id: "a", position: [0, 5, 0] }]);
    trigger.reset();
    const after = trigger.step([{ id: "a", position: [0, 5, 0] }]);
    expect(after.entered).toEqual(["a"]);
  });
});

describe("applyVolumeForce", () => {
  test("impulse adds the force to velocity once, independent of dt", () => {
    expect(applyVolumeForce([1, 0, 0], [5, 0, 0], "impulse", 1 / 60)).toEqual([6, 0, 0]);
  });

  test("velocity mode replaces velocity outright", () => {
    expect(applyVolumeForce([1, 0, 0], [5, 0, 0], "velocity", 1 / 60)).toEqual([5, 0, 0]);
  });

  test("accelerate mode adds force*dt to velocity", () => {
    expect(applyVolumeForce([1, 0, 0], [5, 0, 0], "accelerate", 2)).toEqual([11, 0, 0]);
  });
});


test("force authoring rejects finite magnitudes that overflow composed samples", () => {
  const field: ForceFieldConfig = { center: [0, 0, 0], shape: { kind: "sphere", radius: 10 }, strength: 1e308 };
  expect(() => validateForceField(field)).toThrow();
  expect(() => validateForceField({ ...field, strength: 1, vortex: { axis: [0, 1, 0], strength: 1e308 } })).toThrow();
  expect(() => validateForceField({ ...field, strength: 1, direction: [1e308, 0, 0] })).toThrow();
});
