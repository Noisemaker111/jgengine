import { describe, expect, test } from "bun:test";

import { resolveSkyLightOwnership, skyEmitsLights } from "./skyLightingPolicy";

describe("sky lighting policy", () => {
  test("authored lighting owns lights; sky only supplies dome/fog", () => {
    const ownership = resolveSkyLightOwnership(true);
    expect(ownership).toBe("authored");
    expect(skyEmitsLights(ownership)).toBe(false);
  });

  test("without authored lighting the sky emits default sun/hemi", () => {
    const ownership = resolveSkyLightOwnership(false);
    expect(ownership).toBe("sky-default");
    expect(skyEmitsLights(ownership)).toBe(true);
  });

  test("fixed and time-driven skies share the same ownership rule", () => {
    for (const timeOfDay of [false, true]) {
      void timeOfDay;
      expect(skyEmitsLights(resolveSkyLightOwnership(true))).toBe(false);
      expect(skyEmitsLights(resolveSkyLightOwnership(false))).toBe(true);
    }
  });
});
