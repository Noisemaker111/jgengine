import { describe, expect, test } from "bun:test";

import { cityRevealState } from "./cityScene";

describe("city road reveal ordering", () => {
  test("pavement and sidewalk ribbons reveal before aprons, markings, glow, or traffic", () => {
    const early = cityRevealState(0.65);
    expect(early.ribbonProgress).toBeGreaterThan(0);
    expect(early.ribbonProgress).toBeLessThan(1);
    expect(early.junctionsVisible).toBe(false);
    expect(early.dressingOpacity).toBe(0);

    const complete = cityRevealState(1.3);
    expect(complete.ribbonProgress).toBe(1);
    expect(complete.junctionsVisible).toBe(true);
    expect(complete.dressingOpacity).toBeGreaterThan(0);
  });

  test("instant capture state resolves every layer in one frame", () => {
    expect(cityRevealState(0, true)).toEqual({
      ribbonProgress: 1,
      junctionsVisible: true,
      dressingOpacity: 1,
    });
  });
});
