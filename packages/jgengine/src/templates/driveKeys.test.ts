import { expect, test } from "bun:test";

import { driveMjs } from "./gameFiles";
import { holdDriveInput, type DriveInputDeps } from "./driveSteps";
import { focusGameSurface, gameSurfaceCenter, holdComplete, mouseButtonForCode } from "./gameSurfaceFocus";

function deps(clock: { t: number }): DriveInputDeps {
  return {
    focusGameSurface, holdComplete, mouseButtonForCode, gameSurfaceCenter,
    sleep: async () => { clock.t += 100; },
    now: () => clock.t,
  } as unknown as DriveInputDeps;
}

test("the portable drive.mjs holds input through the shared holdDriveInput", () => {
  expect(driveMjs).toContain("holdDriveInput(session, code, holdMs");
});

test("holds a chord until a frame renders, focusing the play surface first", async () => {
  const clock = { t: 0 };
  let focused = false;
  let reads = 0;
  const events: string[] = [];
  const surface = { focus: () => { focused = true; } };
  const document = { querySelector: () => ({ closest: () => surface }), get activeElement() { return focused ? surface : null; } };
  await holdDriveInput({
    send: async (_method: string, args?: Record<string, unknown>) => {
      if (args?.type === "keyDown") expect(focused).toBe(true);
      if (typeof args?.type === "string") events.push(`${args.type}:${String(args.code)}`);
    },
    evaluate: async (expression: string) => {
      if (expression.endsWith("(document)")) return new Function("document", "return " + expression)(document);
      if (expression === "globalThis.__jgFrames ?? 0") return reads++ < 2 ? 0 : 1;
      return undefined;
    },
  }, "KeyW+KeyD", 0, deps(clock));
  expect(clock.t).toBe(200);
  expect(events).toEqual(["keyDown:KeyW", "keyDown:KeyD", "keyUp:KeyW", "keyUp:KeyD"]);
});

test("releases held keys if frame sampling fails", async () => {
  let reads = 0;
  const events: string[] = [];
  await expect(holdDriveInput({
    send: async (_method: string, args?: Record<string, unknown>) => { if (typeof args?.type === "string") events.push(args.type); },
    evaluate: async (expression: string) => {
      if (expression === "globalThis.__jgFrames ?? 0" && reads++ > 0) throw new Error("closed page");
      return 0;
    },
  }, "KeyA", 0, deps({ t: 0 }))).rejects.toThrow("closed page");
  expect(events).toEqual(["keyDown", "keyUp"]);
});
