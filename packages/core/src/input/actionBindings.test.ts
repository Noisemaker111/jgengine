import { describe, expect, test } from "bun:test";

import {
  actionLabel,
  actionRepeatIntervals,
  bindingLabel,
  bindingMatches,
  createActionRepeater,
  createActionStateTracker,
  hotbarSlotActionIndex,
  hotbarSlotBindings,
  isHotbarSlotAction,
  normalizeKeyCode,
  resolveActionCommand,
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

describe("hotbarSlotBindings", () => {
  test("generates Digit codes with default action names", () => {
    const map = hotbarSlotBindings(3);
    expect(map).toEqual({ hotbarSlot1: ["Digit1"], hotbarSlot2: ["Digit2"], hotbarSlot3: ["Digit3"] });
  });

  test("tenth slot binds Digit0 and action names are customizable", () => {
    const map = hotbarSlotBindings(10, { action: (slot) => `slot${slot}` });
    expect(map.slot10).toEqual(["Digit0"]);
    expect(map.slot1).toEqual(["Digit1"]);
  });

  test("rejects counts outside 1..10", () => {
    expect(() => hotbarSlotBindings(0)).toThrow();
    expect(() => hotbarSlotBindings(11)).toThrow();
  });
});

describe("hotbar slot action detection", () => {
  test("matches slotN and hotbarSlotN case-insensitively", () => {
    expect(hotbarSlotActionIndex("slot1")).toBe(0);
    expect(hotbarSlotActionIndex("hotbarSlot3")).toBe(2);
    expect(hotbarSlotActionIndex("HotbarSlot10")).toBe(9);
    expect(isHotbarSlotAction("slot4")).toBe(true);
  });

  test("rejects non-slot action names", () => {
    expect(hotbarSlotActionIndex("openBackpack")).toBeNull();
    expect(hotbarSlotActionIndex("interact")).toBeNull();
    expect(isHotbarSlotAction("jump")).toBe(false);
  });
});

describe("resolveActionCommand", () => {
  const reserved = new Set(["jump", "moveForward"]);

  test("prefers a command of the same name", () => {
    const has = (command: string) => command === "openQuestLog";
    expect(resolveActionCommand("openQuestLog", has, reserved)).toBe("openQuestLog");
  });

  test("falls back to ui.<action> when only that command exists", () => {
    const has = (command: string) => command === "ui.openBackpack";
    expect(resolveActionCommand("openBackpack", has, reserved)).toBe("ui.openBackpack");
  });

  test("returns null for reserved actions even if a command exists", () => {
    expect(resolveActionCommand("jump", () => true, reserved)).toBeNull();
  });

  test("returns null for hotbar-slot actions", () => {
    expect(resolveActionCommand("hotbarSlot2", () => true, reserved)).toBeNull();
  });

  test("returns null when neither the action nor ui.<action> command exists", () => {
    expect(resolveActionCommand("openParty", () => false, reserved)).toBeNull();
  });
});

describe("createActionRepeater", () => {
  test("the down edge always fires and restarts the timer", () => {
    const repeater = createActionRepeater({ fire: 100 });
    expect(repeater.due("fire", true, true, 0)).toBe(true);
    expect(repeater.due("fire", true, false, 50)).toBe(false);
  });

  test("fires again every intervalMs while held", () => {
    const repeater = createActionRepeater({ fire: 100 });
    expect(repeater.due("fire", true, true, 0)).toBe(true);
    expect(repeater.due("fire", true, false, 99)).toBe(false);
    expect(repeater.due("fire", true, false, 100)).toBe(true);
    expect(repeater.due("fire", true, false, 150)).toBe(false);
    expect(repeater.due("fire", true, false, 200)).toBe(true);
  });

  test("releasing resets so the next press fires immediately", () => {
    const repeater = createActionRepeater({ fire: 100 });
    repeater.due("fire", true, true, 0);
    repeater.due("fire", true, false, 100);
    expect(repeater.due("fire", false, false, 120)).toBe(false);
    expect(repeater.due("fire", true, true, 130)).toBe(true);
    expect(repeater.due("fire", true, false, 140)).toBe(false);
  });

  test("actions without a configured interval never repeat past the edge", () => {
    const repeater = createActionRepeater({});
    expect(repeater.due("jump", true, true, 0)).toBe(true);
    expect(repeater.due("jump", true, false, 1000)).toBe(false);
  });

  test("reset clears all timers", () => {
    const repeater = createActionRepeater({ fire: 100 });
    repeater.due("fire", true, true, 0);
    repeater.reset();
    expect(repeater.due("fire", true, false, 50)).toBe(false);
  });
});

describe("actionRepeatIntervals", () => {
  test("collects repeatMs from object-form entries only", () => {
    expect(
      actionRepeatIntervals({
        fire: { hold: ["Mouse0"], repeatMs: 120 },
        jump: ["Space"],
        toggle: { toggle: ["KeyC"] },
      }),
    ).toEqual({ fire: 120 });
  });

  test("returns an empty map when nothing declares repeatMs", () => {
    expect(actionRepeatIntervals({ jump: ["Space"] })).toEqual({});
  });
});

describe("binding labels", () => {
  test("bindingLabel shortens common codes", () => {
    expect(bindingLabel("Digit4")).toBe("4");
    expect(bindingLabel("KeyB")).toBe("B");
    expect(bindingLabel("mouse0")).toBe("LMB");
    expect(bindingLabel("ShiftLeft")).toBe("Shift");
    expect(bindingLabel("Escape")).toBe("Esc");
  });

  test("actionLabel reads arrays and hold/toggle configs", () => {
    expect(actionLabel({ jump: ["Space"] }, "jump")).toBe("Space");
    expect(actionLabel({ crouch: { toggle: ["KeyC"] } }, "crouch")).toBe("C");
    expect(actionLabel({ aim: { hold: ["mouse2"] } }, "aim")).toBe("RMB");
    expect(actionLabel({}, "missing")).toBeNull();
  });
});
