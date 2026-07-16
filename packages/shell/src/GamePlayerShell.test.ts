import { describe, expect, test } from "bun:test";

import {
  applyMotionImpulses,
  hasEnvironmentTerrain,
  nearbyObstacles,
  resolvePhysicsTuning,
} from "./GamePlayerShell";
import { heldActionsFor, shouldFireBoundAction } from "./boundActionDispatch";
import { resolveWorldSky } from "./worldSky";
import { advanceVoxelPlayer, createVoxelPlayerBody } from "@jgengine/core/movement/voxelController";
import { resolveMovementIntent, createEmptyMovementKeys } from "@jgengine/core/movement/movementModel";

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

describe("resolvePhysicsTuning", () => {
  test("returns undefined when no physics config is declared", () => {
    expect(resolvePhysicsTuning(undefined)).toBeUndefined();
    const empty = resolvePhysicsTuning({});
    expect(empty?.gravityAcceleration).toBeUndefined();
    expect(empty?.jumpVelocity).toBeUndefined();
  });

  test("reads the physics config live so devtools edits apply mid-session", () => {
    const physics = { gravity: -24, jumpVelocity: 7 };
    const tuning = resolvePhysicsTuning(physics)!;
    expect(tuning.gravityAcceleration).toBe(24);
    physics.gravity = -48;
    physics.jumpVelocity = 9;
    expect(tuning.gravityAcceleration).toBe(48);
    expect(tuning.jumpVelocity).toBe(9);
  });

  test("negates the signed gravity into a positive downward magnitude", () => {
    // Games declare gravity as a signed acceleration (negative = down); the
    // controllers subtract a positive magnitude, so the sign must flip here.
    expect(resolvePhysicsTuning({ gravity: -24 })).toEqual({ gravityAcceleration: 24 });
  });

  test("passes jumpVelocity through unchanged and preserves it alongside gravity", () => {
    expect(resolvePhysicsTuning({ gravity: -20, jumpVelocity: 7 })).toEqual({
      gravityAcceleration: 20,
      jumpVelocity: 7,
    });
  });

  test("a player standing on the void with down-gravity falls instead of levitating (regression)", () => {
    // The levitation bug: passing gravity: -24 straight through made the voxel
    // controller integrate velocityY += 24*dt, launching airborne players up.
    const body = createVoxelPlayerBody(0, 5, 0);
    body.grounded = false;
    const intent = resolveMovementIntent(createEmptyMovementKeys(), true);
    const noSolids = () => false;
    const tuning = resolvePhysicsTuning({ gravity: -24 });
    for (let frame = 0; frame < 30; frame += 1) {
      advanceVoxelPlayer(body, intent, 0, 1, 2, 1 / 60, noSolids, undefined, tuning);
    }
    expect(body.velocityY).toBeLessThan(0);
    expect(body.y).toBeLessThan(5);
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
