import { describe, expect, test } from "bun:test";

import { cameraShakeDemoGame } from "./cameraShakeDemo";

describe("camera shake demo", () => {
  test("holds the shake on the shell's controller so a still frame shows it", () => {
    expect(cameraShakeDemoGame.camera?.shake?.decayPerSecond).toBe(0);
  });
});
