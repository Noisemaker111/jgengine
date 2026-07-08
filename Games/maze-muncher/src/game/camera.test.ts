import { describe, expect, test } from "bun:test";

import { CAMERA_FRUSTUM_DEFAULTS } from "@jgengine/core/game/playableGame";

import { game } from "../game.config";
import { FOG_NEAR, getFogFar } from "../loop";

describe("maze-muncher first-person camera", () => {
  test("mounts the first-person rig following the player", () => {
    expect(game.camera?.rig).toBe("first");
    expect(game.camera?.followEntityId ?? undefined).not.toBeNull();
  });

  test("eye height sits below the walls so the corridors enclose the view", () => {
    const eye = game.camera?.firstPerson?.eyeHeight ?? 1.6;
    expect(eye).toBeGreaterThan(0);
    expect(eye).toBeLessThan(3);
  });

  test("disables the shell weapon viewmodel", () => {
    expect(game.camera?.firstPerson?.viewmodel).toBe(false);
  });

  test("the render frustum reaches past the fog so content in view still draws", () => {
    const far = game.camera?.frustum?.far ?? CAMERA_FRUSTUM_DEFAULTS.far;
    expect(far).toBeGreaterThan(getFogFar());
    expect(getFogFar()).toBeGreaterThan(FOG_NEAR);
  });
});
