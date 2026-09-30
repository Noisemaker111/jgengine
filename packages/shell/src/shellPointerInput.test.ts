import { expect, test } from "bun:test";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { shellPointerInput } from "./shellPointerInput";

test("only the play canvas feeds mouse bindings; release outside, cancel and owner disposal retire held buttons", () => {
  const tracker = createActionStateTracker<string>(toActionStateBindingMap({ fire: ["mouse0"], alternate: ["mouse2"] }));
  let active = true;
  const input = shellPointerInput(tracker, () => active);
  const left = { pointerId: 1, button: 0 };
  input.down(left, false);
  expect(tracker.wasPressed("fire")).toBe(false);
  input.down(left, true);
  expect(tracker.isDown("fire")).toBe(true);
  expect(tracker.wasPressed("fire")).toBe(true);
  tracker.endFrame();
  input.down(left, true);
  expect(tracker.wasPressed("fire")).toBe(false);
  expect(input.up({ pointerId: 2, button: 0 })).toBe(false);
  expect(tracker.isDown("fire")).toBe(true);
  expect(input.up(left)).toBe(true);
  expect(tracker.isDown("fire")).toBe(false);
  expect(input.up(left)).toBe(false);
  active = false; input.down(left, true);
  expect(tracker.isDown("fire")).toBe(false);
  active = true; input.down(left, true);
  input.down({ pointerId: 1, button: 2 }, true);
  input.cancel(1);
  expect(tracker.isDown("fire")).toBe(false);
  expect(tracker.isDown("alternate")).toBe(false);
});

test("explicit mouse binding owns its click while unbound clicks preserve legacy primary behavior", () => {
  const tracker = createActionStateTracker<string>(toActionStateBindingMap({ fire: { hold: ["mouse0"], repeatMs: 30 } }));
  const input = shellPointerInput(tracker, () => true);
  input.down({ pointerId: 7, button: 0 }, true);
  expect(input.up({ pointerId: 7, button: 0 })).toBe(true);
  input.down({ pointerId: 7, button: 1 }, true);
  expect(input.up({ pointerId: 7, button: 1 })).toBe(false);
  input.down({ pointerId: 7, button: 0 }, true);
  input.cancel();
  expect(tracker.isDown("fire")).toBe(false);
});
