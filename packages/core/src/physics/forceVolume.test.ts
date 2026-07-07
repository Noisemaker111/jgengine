import { describe, expect, test } from "bun:test";

import { ForceVolume, PlatformCarry } from "./forceVolume";
import { PhysicsWorld } from "./physicsWorld";

const BOUNDS = { min: [-20, 0, -20] as const, max: [20, 40, 20] as const };

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
