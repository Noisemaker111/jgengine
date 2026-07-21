import { afterEach, describe, expect, test } from "bun:test";

import { devtools } from "./devtools";
import {
  armTextureErrors,
  reportTextureLoadError,
  resetTextureErrors,
  textureErrorsSnapshot,
} from "./textureErrors";

function warnCount(): number {
  return devtools.logs.list().filter((entry) => entry.level === "warn").length;
}

afterEach(() => {
  armTextureErrors(false);
  devtools.logs.clear();
});

describe("textureErrors collector", () => {
  test("records reported texture URLs with per-URL counts when armed", () => {
    armTextureErrors(true);
    reportTextureLoadError("/textures/bark.png");
    reportTextureLoadError("/textures/bark.png");
    reportTextureLoadError("/textures/leaf.png");

    const snapshot = textureErrorsSnapshot();
    expect(snapshot).toEqual([
      { url: "/textures/bark.png", count: 2 },
      { url: "/textures/leaf.png", count: 1 },
    ]);
  });

  test("stays empty and reports nothing when disarmed (production is a no-op)", () => {
    armTextureErrors(false);
    reportTextureLoadError("/textures/bark.png");
    expect(textureErrorsSnapshot()).toEqual([]);
    expect(warnCount()).toBe(0);
  });

  test("emits ONE deduped devtools warn per newly-seen failure set", () => {
    devtools.logs.clear();
    armTextureErrors(true);
    reportTextureLoadError("/textures/bark.png");
    reportTextureLoadError("/textures/bark.png");
    // Same URL again does not change the failure signature → no new warn line.
    expect(warnCount()).toBe(1);
    reportTextureLoadError("/textures/leaf.png");
    // A new URL widens the set → one more warn line.
    expect(warnCount()).toBe(2);
    const warn = devtools.logs.list().find((entry) => entry.level === "warn");
    expect(warn?.message ?? "").toContain("textures 404");
  });

  test("arming resets the tally so a fresh observation starts empty", () => {
    armTextureErrors(true);
    reportTextureLoadError("/textures/bark.png");
    expect(textureErrorsSnapshot()).toHaveLength(1);
    armTextureErrors(true);
    expect(textureErrorsSnapshot()).toEqual([]);
  });

  test("resetTextureErrors clears the tally without disarming", () => {
    armTextureErrors(true);
    reportTextureLoadError("/textures/bark.png");
    resetTextureErrors();
    expect(textureErrorsSnapshot()).toEqual([]);
    // Still armed: a subsequent error is recorded.
    reportTextureLoadError("/textures/leaf.png");
    expect(textureErrorsSnapshot()).toEqual([{ url: "/textures/leaf.png", count: 1 }]);
  });
});
