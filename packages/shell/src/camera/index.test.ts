import { describe, expect, test } from "bun:test";

import { cameraShake, defaultCameraShake } from "./index";

describe("camera barrel", () => {
  test("cameraShake() feeds the one controller the rigs apply", () => {
    defaultCameraShake.restore({ ...defaultCameraShake.snapshot(), trauma: 0 });
    cameraShake(0.5);
    expect(defaultCameraShake.trauma()).toBeGreaterThan(0);
    defaultCameraShake.restore({ ...defaultCameraShake.snapshot(), trauma: 0 });
  });
});
