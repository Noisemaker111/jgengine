import { describe, expect, test } from "bun:test";

import {
  applyMotionImpulses,
  hasEnvironmentTerrain,
  heldActionsFor,
  nearbyObstacles,
  resolveWorldSky,
  shouldFireBoundAction,
} from "./GamePlayerShell";

function trackerStub(down: ReadonlySet<string>, pressed: ReadonlySet<string> = new Set()) {
  return {
    isDown: (action: string) => down.has(action),
    wasPressed: (action: string) => pressed.has(action),
  };
}

describe("heldActionsFor", () => {
  test("returns only the actions currently down, including reserved movement actions", () => {
    const tracker = trackerStub(new Set(["moveForward", "jump"]));
    expect(heldActionsFor(tracker, ["moveForward", "moveBack", "jump", "interact"])).toEqual([
      "moveForward",
      "jump",
    ]);
  });

  test("returns an empty array when nothing is held", () => {
    const tracker = trackerStub(new Set());
    expect(heldActionsFor(tracker, ["moveForward"])).toEqual([]);
  });
});

describe("shouldFireBoundAction", () => {
  test("fires on press regardless of repeat config", () => {
    const tracker = trackerStub(new Set(["fire"]), new Set(["fire"]));
    expect(shouldFireBoundAction(tracker, "fire", { fire: ["KeyF"] }, new Map(), 1000)).toBe(true);
  });

  test("does not fire while held without a repeat interval", () => {
    const tracker = trackerStub(new Set(["fire"]));
    expect(shouldFireBoundAction(tracker, "fire", { fire: ["KeyF"] }, new Map(), 1000)).toBe(false);
  });

  test("repeats once the interval has elapsed while held", () => {
    const tracker = trackerStub(new Set(["fire"]));
    const input = { fire: { hold: ["KeyF"], repeatMs: 100 } };
    const lastFiredAt = new Map([["fire", 900]]);
    expect(shouldFireBoundAction(tracker, "fire", input, lastFiredAt, 999)).toBe(false);
    expect(shouldFireBoundAction(tracker, "fire", input, lastFiredAt, 1000)).toBe(true);
  });
});

describe("nearbyObstacles", () => {
  test("keeps only objects within radius of the center, dropping the y axis from the distance check", () => {
    const objects = [
      { instanceId: "a", catalogId: "rock", position: [1, 5, 1] as const },
      { instanceId: "b", catalogId: "rock", position: [10, 0, 10] as const },
    ];
    const result = nearbyObstacles(objects, [0, 0, 0], 3);
    expect(result).toEqual([{ position: [1, 5, 1] }]);
  });

  test("defaults to a 3-unit gather radius", () => {
    const objects = [{ instanceId: "a", catalogId: "rock", position: [2.9, 0, 0] as const }];
    expect(nearbyObstacles(objects, [0, 0, 0])).toHaveLength(1);
  });
});

describe("applyMotionImpulses", () => {
  test("passes the velocity through unchanged when there is no pending batch", () => {
    expect(applyMotionImpulses(4, null)).toBe(4);
  });

  test("sums impulses onto the current velocity", () => {
    expect(applyMotionImpulses(1, { impulses: [2, 3], verticalVelocity: null, y: null })).toBe(6);
  });

  test("setVerticalVelocity replaces the result outright, after impulses are summed", () => {
    expect(applyMotionImpulses(1, { impulses: [5], verticalVelocity: 9, y: null })).toBe(9);
  });
});

describe("resolveWorldSky", () => {
  test("returns undefined for a non-environment world", () => {
    expect(resolveWorldSky({ kind: "voxel", seed: "x" })).toBeUndefined();
  });

  test("returns undefined for an environment world with no sky", () => {
    expect(resolveWorldSky({ kind: "environment" })).toBeUndefined();
  });

  test("returns the sky descriptor when the environment declares one", () => {
    const sky = { kind: "sky" as const, preset: "day" as const, timeOfDay: true };
    expect(resolveWorldSky({ kind: "environment", sky })).toBe(sky);
  });
});

describe("hasEnvironmentTerrain", () => {
  test("false for undefined world", () => {
    expect(hasEnvironmentTerrain(undefined)).toBe(false);
  });

  test("false for an environment world with no terrain", () => {
    expect(hasEnvironmentTerrain({ kind: "environment" })).toBe(false);
  });

  test("true for an environment world with terrain", () => {
    expect(
      hasEnvironmentTerrain({ kind: "environment", terrain: { kind: "terrain", bounds: { w: 1, d: 1 }, height: 1 } }),
    ).toBe(true);
  });
});
