import { describe, expect, test } from "bun:test";

import { DEFAULT_WALK_CODES, shellDrivesPlayerPose, SHELL_MOVEMENT_ACTIONS } from "./shellMovement";

describe("shellDrivesPlayerPose", () => {
  test("is false when no movement actions are bound", () => {
    expect(shellDrivesPlayerPose(undefined)).toBe(false);
    expect(shellDrivesPlayerPose({ interact: ["KeyE"] })).toBe(false);
  });

  test("is true when any shell walk action is present", () => {
    for (const action of SHELL_MOVEMENT_ACTIONS) {
      expect(shellDrivesPlayerPose({ [action]: ["KeyW"] })).toBe(true);
    }
  });

  test("DEFAULT_WALK_CODES covers every shell walk action with WASD + Space", () => {
    for (const action of SHELL_MOVEMENT_ACTIONS) {
      expect(DEFAULT_WALK_CODES[action]?.length).toBeGreaterThan(0);
    }
    expect(DEFAULT_WALK_CODES.moveForward).toEqual(["KeyW"]);
    expect(DEFAULT_WALK_CODES.jump).toEqual(["Space"]);
    expect(shellDrivesPlayerPose(DEFAULT_WALK_CODES)).toBe(true);
  });
});
