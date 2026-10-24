import { describe, expect, test } from "bun:test";

import {
  cullInstancesInto,
  instanceOutsideCullBand,
  resolveInstanceCullPolicy,
  type InstanceCullPolicy,
} from "./cullPolicy";

const camera = { x: 0, y: 0, z: 0 };

describe("resolveInstanceCullPolicy", () => {
  test("every tier resolves a distance from the profile, and ultra submits everything", () => {
    expect(resolveInstanceCullPolicy({ tier: "low", drawDistance: 120 }).maxDistance).toBe(120);
    expect(resolveInstanceCullPolicy({ tier: "medium", drawDistance: 240 }).maxDistance).toBe(240);
    expect(resolveInstanceCullPolicy({ tier: "high", drawDistance: 400 }).maxDistance).toBe(400);
    expect(resolveInstanceCullPolicy({ tier: "ultra", drawDistance: 800 }).maxDistance).toBe(Number.POSITIVE_INFINITY);
  });

  test("a game override wins over the tier", () => {
    const policy = resolveInstanceCullPolicy({ tier: "low", drawDistance: 120, override: { maxDistance: 333 } });
    expect(policy.maxDistance).toBe(333);
    expect(instanceOutsideCullBand(camera, { x: 0, y: 0, z: 300, radius: 0 }, policy)).toBe(false);
    expect(instanceOutsideCullBand(camera, { x: 0, y: 0, z: 340, radius: 0 }, policy)).toBe(true);
  });
});

describe("instanceOutsideCullBand", () => {
  const policy: InstanceCullPolicy = { maxDistance: 100, minDistance: 0, hysteresis: 0 };

  test("an instance past the cull distance is outside the band", () => {
    expect(instanceOutsideCullBand(camera, { x: 0, y: 0, z: 101, radius: 0 }, policy)).toBe(true);
    expect(instanceOutsideCullBand(camera, { x: 0, y: 0, z: 99, radius: 0 }, policy)).toBe(false);
  });

  test("radius pushes the far edge out so a large instance is not culled by its far side", () => {
    expect(instanceOutsideCullBand(camera, { x: 0, y: 0, z: 120, radius: 30 }, policy)).toBe(false);
  });

  test("hysteresis keeps a boundary instance that was submitted last frame", () => {
    const banded: InstanceCullPolicy = { maxDistance: 100, minDistance: 0, hysteresis: 5 };
    const extent = { x: 0, y: 0, z: 103, radius: 0 };
    expect(instanceOutsideCullBand(camera, extent, banded, false)).toBe(true);
    expect(instanceOutsideCullBand(camera, extent, banded, true)).toBe(false);
  });

  test("ultra's unbounded distance never culls", () => {
    const ultra = resolveInstanceCullPolicy({ tier: "ultra", drawDistance: 800 });
    expect(instanceOutsideCullBand(camera, { x: 0, y: 0, z: 1e6, radius: 0 }, ultra)).toBe(false);
  });
});

describe("cullInstancesInto", () => {
  const positions = [0, 0, 0, 0, 0, 50, 0, 0, 150, 0, 0, 60];
  const policy: InstanceCullPolicy = { maxDistance: 100, minDistance: 0, hysteresis: 0 };

  test("compacts to the instances inside the band, in source order", () => {
    const out: number[] = [];
    const kept = cullInstancesInto(camera, positions, 3, 4, () => 0.5, policy, out);
    expect(kept).toBe(3);
    expect(out).toEqual([0, 1, 3]);
  });

  test("a batch entirely past the cull distance submits nothing", () => {
    const far = [0, 0, 500, 0, 0, 600];
    const out: number[] = [];
    expect(cullInstancesInto(camera, far, 3, 2, () => 0.5, policy, out)).toBe(0);
    expect(out).toEqual([]);
  });
});
