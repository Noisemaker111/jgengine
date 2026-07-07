import { describe, expect, test } from "bun:test";

import {
  createPositionHistory,
  raySphereDistance,
  resolveHitscan,
  rewindTimestamp,
} from "./lagCompensation";

describe("PositionHistory ring + rewind", () => {
  test("interpolates a position between recorded samples", () => {
    const history = createPositionHistory({ historyMs: 1_000 });
    history.record("bot", 0, { x: 0, y: 0, z: 0 });
    history.record("bot", 100, { x: 10, y: 0, z: 0 });

    expect(history.sampleAt("bot", 50)).toEqual({ x: 5, y: 0, z: 0 });
    expect(history.sampleAt("bot", 25)).toEqual({ x: 2.5, y: 0, z: 0 });
  });

  test("clamps to the nearest endpoint outside the recorded window", () => {
    const history = createPositionHistory({ historyMs: 1_000 });
    history.record("bot", 100, { x: 1, y: 0, z: 0 });
    history.record("bot", 200, { x: 2, y: 0, z: 0 });

    expect(history.sampleAt("bot", 50)).toEqual({ x: 1, y: 0, z: 0 });
    expect(history.sampleAt("bot", 500)).toEqual({ x: 2, y: 0, z: 0 });
    expect(history.sampleAt("ghost", 100)).toBeNull();
  });

  test("drops samples older than historyMs so the ring stays bounded", () => {
    const history = createPositionHistory({ historyMs: 300 });
    for (let t = 0; t <= 1_000; t += 100) {
      history.record("bot", t, { x: t, y: 0, z: 0 });
    }
    const samples = history.samples("bot");
    expect(samples[0]!.t).toBeGreaterThanOrEqual(700);
    expect(samples[samples.length - 1]!.t).toBe(1_000);
  });

  test("maxSamples caps retained samples", () => {
    const history = createPositionHistory({ historyMs: 1_000_000, maxSamples: 4 });
    for (let t = 0; t < 20; t += 1) history.record("bot", t, { x: t, y: 0, z: 0 });
    expect(history.samples("bot").length).toBe(4);
  });

  test("late-arriving out-of-order sample is inserted in timestamp order", () => {
    const history = createPositionHistory({ historyMs: 1_000 });
    history.record("bot", 0, { x: 0, y: 0, z: 0 });
    history.record("bot", 200, { x: 20, y: 0, z: 0 });
    history.record("bot", 100, { x: 10, y: 0, z: 0 });
    expect(history.sampleAt("bot", 150)).toEqual({ x: 15, y: 0, z: 0 });
  });
});

describe("rewindTimestamp", () => {
  test("subtracts half the round-trip and the interpolation delay", () => {
    expect(rewindTimestamp(1_000, 80, 100)).toBe(860);
  });
});

describe("ray-sphere hitscan", () => {
  test("a ray pointing at a sphere returns the near-surface distance", () => {
    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    expect(raySphereDistance(ray, { x: 10, y: 0, z: 0 }, 1)).toBeCloseTo(9);
  });

  test("a ray missing the sphere returns null", () => {
    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    expect(raySphereDistance(ray, { x: 10, y: 5, z: 0 }, 1)).toBeNull();
  });

  test("maxDistance culls a sphere that is too far", () => {
    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, maxDistance: 5 };
    expect(raySphereDistance(ray, { x: 10, y: 0, z: 0 }, 1)).toBeNull();
  });
});

describe("resolveHitscan against rewound history", () => {
  test("a shot registers on the target where it was at the rewound time, not now", () => {
    const history = createPositionHistory({ historyMs: 1_000 });
    history.record("runner", 0, { x: 10, y: 0, z: 0 });
    history.record("runner", 100, { x: 10, y: 0, z: 20 });

    const atMs = rewindTimestamp(100, 0, 100);
    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const hit = resolveHitscan(history, [{ entityId: "runner", radius: 1 }], ray, atMs);

    expect(hit?.entityId).toBe("runner");
    expect(hit?.distance).toBeCloseTo(9);
  });

  test("the same shot whiffs against the live position (no lag comp)", () => {
    const history = createPositionHistory({ historyMs: 1_000 });
    history.record("runner", 0, { x: 10, y: 0, z: 0 });
    history.record("runner", 100, { x: 10, y: 0, z: 20 });

    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const hit = resolveHitscan(history, [{ entityId: "runner", radius: 1 }], ray, 100);
    expect(hit).toBeNull();
  });

  test("nearest of several targets wins", () => {
    const history = createPositionHistory({ historyMs: 1_000 });
    history.record("far", 0, { x: 30, y: 0, z: 0 });
    history.record("near", 0, { x: 8, y: 0, z: 0 });

    const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const hit = resolveHitscan(
      history,
      [
        { entityId: "far", radius: 1 },
        { entityId: "near", radius: 1 },
      ],
      ray,
      0,
    );
    expect(hit?.entityId).toBe("near");
  });
});
