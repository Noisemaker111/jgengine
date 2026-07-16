import { describe, expect, test } from "bun:test";

import { shellDrivesPlayerPose, SHELL_MOVEMENT_ACTIONS } from "./shellMovement";

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
});
