import { describe, expect, test } from "bun:test";
import { launchCue, LAUNCH_CUE_SECONDS } from "./launchCue";

const pose = (speedKmh: number, airborne = false) => ({ speedKmh, airborne }) as { speedKmh: number; airborne: boolean };

describe("launchCue", () => {
  test("prompts the throttle while the buggy is idle at the start", () => {
    expect(launchCue({ runTime: 0.3, pose: pose(0) })).toBe("HOLD W TO ROLL");
  });

  test("clears as soon as the buggy is rolling", () => {
    expect(launchCue({ runTime: 0.4, pose: pose(4) })).toBeNull();
  });

  test("does not prompt once the opening window has passed, even if stopped", () => {
    expect(launchCue({ runTime: LAUNCH_CUE_SECONDS, pose: pose(0) })).toBeNull();
  });

  test("does not prompt while airborne", () => {
    expect(launchCue({ runTime: 1, pose: pose(0, true) })).toBeNull();
  });
});
