import { describe, expect, test } from "bun:test";

import { holdDriveInput, type DriveInputDeps, type DriveSession } from "./driveSteps";
import { holdComplete } from "./gameSurfaceFocus";

describe("holdDriveInput until", () => {
  /** A page whose position advances only while the key is down, at whatever rate frames arrive. */
  function walkingPage(stepPerPoll: number) {
    const clock = { t: 0 };
    const page = { held: false, z: 1, frames: 0, sent: [] as string[] };
    const session: DriveSession = {
      send: async (method, params) => {
        if (method === "Input.dispatchKeyEvent") { page.held = params?.["type"] === "keyDown"; page.sent.push(String(params?.["type"])); }
        return undefined;
      },
      evaluate: async (expression) => (expression.includes("__jgFrames ?? 0") ? page.frames : true),
    };
    const deps: DriveInputDeps = {
      focusGameSurface: () => true, holdComplete, mouseButtonForCode: () => null, gameSurfaceCenter: () => null,
      sleep: async (ms: number) => { clock.t += ms; page.frames += 1; if (page.held) page.z -= stepPerPoll; },
      now: () => clock.t,
    };
    const arrived = { check: async () => page.z < -3.5, describe: "z < -3.5" };
    return { session, deps, page, arrived };
  }

  test("keeps the key down until the arrival holds, however slowly the page steps", async () => {
    for (const stride of [0.4, 0.05]) {
      const run = walkingPage(stride);
      await holdDriveInput(run.session, "KeyW", 0, run.deps, { ...run.arrived, timeoutMs: 60_000 });
      expect(run.page.z).toBeLessThan(-3.5);
      expect(run.page.z).toBeGreaterThan(-3.5 - stride - 1e-9);
      expect(run.page.sent).toEqual(["keyDown", "keyUp"]);
    }
  });

  test("releases and fails naming the check when the arrival never comes", async () => {
    const run = walkingPage(0);
    await expect(holdDriveInput(run.session, "KeyW", 0, run.deps, { ...run.arrived, timeoutMs: 500 }))
      .rejects.toThrow("z < -3.5: not true after 500ms of holding KeyW");
    expect(run.page.sent).toEqual(["keyDown", "keyUp"]);
  });
});
