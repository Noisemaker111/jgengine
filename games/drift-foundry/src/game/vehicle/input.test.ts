import { expect, test } from "bun:test";
import { createInputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import { createDriveInput } from "./input";

test("keyboard and touch releases preserve the other held source, then reset clears both", () => {
  const drive = createDriveInput();
  const host = createInputSnapshot();
  drive.keyDown("KeyW");
  drive.press("throttle");
  drive.release("throttle");
  expect(drive.sample(.05, host, true).throttle).toBeGreaterThan(0);
  drive.press("throttle");
  drive.keyUp("KeyW");
  expect(drive.isDown("throttle")).toBe(true);
  drive.reset();
  expect(drive.sample(.05, host, true).throttle).toBe(0);
});

test("closing settings refreshes bindings and releases held keys without duplicating jump edges", () => {
  let code = "KeyW";
  const drive = createDriveInput(() => ({ throttle: [code], jumpHop: ["Space"] }));
  drive.keyDown("KeyW");
  code = "KeyI";
  drive.refreshBindings();
  drive.keyDown("KeyW");
  expect(drive.isDown("throttle")).toBe(false);
  drive.keyDown("KeyI");
  expect(drive.isDown("throttle")).toBe(true);
  drive.keyDown("Space");
  expect(drive.consumeJump()).toBe(true);
  expect(drive.consumeJump()).toBe(false);
  drive.sample(.05, createInputSnapshot(), true);
  drive.keyDown("Space");
  expect(drive.consumeJump()).toBe(false);
});


test("released keyboard pedals coast the real published vehicle into a savable parked run", async () => {
  const { createRunSession } = await import("../run/session");
  const saved = new Map<string, string>();
  const session = createRunSession(undefined, { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value); } });
  const drive = createDriveInput();
  const host = createInputSnapshot();
  const step = () => session.tick(1 / 30, drive.sample(1 / 30, host, true), { jumpPressed: false, plowBracing: false });
  session.start(); drive.keyDown("KeyW");
  for (let frame = 0; frame < 120; frame++) step();
  expect(session.snapshot().pose.speedKmh).toBeGreaterThan(1);
  drive.keyUp("KeyW");
  expect(drive.sample(1 / 30, host, true).throttle).toBe(0);
  for (let frame = 0; frame < 180; frame++) step();
  expect(session.snapshot().pose.speedKmh).toBe(0);
  session.togglePause();
  expect(session.snapshot().parkedRun).not.toBeNull();
});

test("released touch pedals retain another held source and intentionally small analog input", () => {
  const drive = createDriveInput();
  const host = createInputSnapshot();
  drive.press("throttle");drive.sample(.05, host, true);drive.release("throttle");
  expect(drive.sample(.05, host, true).throttle).toBe(0);
  drive.keyDown("KeyW");drive.press("throttle");drive.release("throttle");
  expect(drive.sample(.05, host, true).throttle).toBeGreaterThan(0);
  drive.keyUp("KeyW");host.publishAnalog({ throttle: .001 });
  expect(drive.sample(.05, host, true).throttle).toBeGreaterThan(0);
  host.publishAnalog(null);drive.press("brake");drive.sample(.05, host, true);drive.release("brake");
  expect(drive.sample(.05, host, true).brake).toBe(0);
});
