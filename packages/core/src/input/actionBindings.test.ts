import { describe, expect, test } from "bun:test";

import {
  bindingMatches,
  createActionStateTracker,
  normalizeKeyCode,
  resolveBoundAction,
  type ActionBindingMap,
  type ActionStateBindingMap,
} from "./actionBindings";

describe("bindingMatches", () => {
  test("matches primary and secondary codes", () => {
    const binding = { primary: "KeyE", secondary: "Enter" };
    expect(bindingMatches("KeyE", binding)).toBe(true);
    expect(bindingMatches("Enter", binding)).toBe(true);
    expect(bindingMatches("KeyQ", binding)).toBe(false);
  });

  test("null secondary never matches", () => {
    expect(bindingMatches("Space", { primary: "KeyE", secondary: null })).toBe(false);
  });
});

describe("resolveBoundAction", () => {
  const bindings: ActionBindingMap<"jump" | "interact", string> = {
    jump: { primary: "Space", secondary: null },
    interact: { primary: "KeyE", secondary: "Space" },
  };

  test("returns the first action bound to the code in map order", () => {
    expect(resolveBoundAction("Space", bindings)).toBe("jump");
    expect(resolveBoundAction("KeyE", bindings)).toBe("interact");
  });

  test("returns null for unbound codes", () => {
    expect(resolveBoundAction("KeyZ", bindings)).toBeNull();
  });
});

describe("normalizeKeyCode", () => {
  test("collapses left/right modifier variants", () => {
    expect(normalizeKeyCode("ShiftLeft")).toBe("Shift");
    expect(normalizeKeyCode("ShiftRight")).toBe("Shift");
    expect(normalizeKeyCode("ControlLeft")).toBe("Control");
    expect(normalizeKeyCode("ControlRight")).toBe("Control");
  });

  test("passes other codes through", () => {
    expect(normalizeKeyCode("KeyW")).toBe("KeyW");
    expect(normalizeKeyCode("Space")).toBe("Space");
  });
});

describe("createActionStateTracker", () => {
  const bindings: ActionStateBindingMap<"jump" | "crouch" | "aim"> = {
    jump: [{ primary: "Space", secondary: null }],
    crouch: { hold: [{ primary: "KeyC", secondary: null }], toggle: [{ primary: "KeyZ", secondary: null }] },
    aim: { hold: [{ primary: "Mouse2", secondary: null }], toggle: [{ primary: "KeyV", secondary: null }] },
  };

  test("flat binding list behaves as hold", () => {
    const tracker = createActionStateTracker(bindings);
    tracker.handleDown("Space");
    expect(tracker.isDown("jump")).toBe(true);
    tracker.handleUp("Space");
    expect(tracker.isDown("jump")).toBe(false);
  });

  test("hold binding is down only while held", () => {
    const tracker = createActionStateTracker(bindings);
    tracker.handleDown("KeyC");
    expect(tracker.isDown("crouch")).toBe(true);
    tracker.handleUp("KeyC");
    expect(tracker.isDown("crouch")).toBe(false);
  });

  test("toggle binding latches on press and unlatches on the next press", () => {
    const tracker = createActionStateTracker(bindings);
    tracker.handleDown("KeyZ");
    expect(tracker.isDown("crouch")).toBe(true);
    tracker.handleUp("KeyZ");
    expect(tracker.isDown("crouch")).toBe(true);
    tracker.handleDown("KeyZ");
    expect(tracker.isDown("crouch")).toBe(false);
  });

  test("wasPressed is true for the frame after a down edge and clears on endFrame", () => {
    const tracker = createActionStateTracker(bindings);
    tracker.handleDown("Mouse2");
    expect(tracker.wasPressed("aim")).toBe(true);
    tracker.endFrame();
    expect(tracker.wasPressed("aim")).toBe(false);
  });

  test("repeated down events for an already-held code do not double-toggle", () => {
    const tracker = createActionStateTracker(bindings);
    tracker.handleDown("KeyV");
    tracker.handleDown("KeyV");
    expect(tracker.isDown("aim")).toBe(true);
  });

  test("reset clears held, toggled, and pressed state", () => {
    const tracker = createActionStateTracker(bindings);
    tracker.handleDown("KeyC");
    tracker.handleDown("KeyZ");
    tracker.reset();
    expect(tracker.isDown("crouch")).toBe(false);
    expect(tracker.wasPressed("crouch")).toBe(false);
  });
});
