import { describe, expect, test } from "bun:test";

import { createActionStateTracker, toActionStateBindingMap } from "./actionBindings";
import { deriveTouchScheme, touchCode, withTouchCodes } from "./touchScheme";

const RESERVED = new Set([
  "moveForward",
  "moveBack",
  "moveLeft",
  "moveRight",
  "turnLeft",
  "turnRight",
  "sprint",
  "jump",
  "tabTarget",
  "clearTarget",
  "useAbility",
  "interact",
]);

describe("withTouchCodes", () => {
  test("appends a synthetic code per action that drives the tracker like a key", () => {
    const tracker = createActionStateTracker(
      toActionStateBindingMap(withTouchCodes({ jump: ["Space"], sprint: { toggle: ["KeyT"] } })),
    );
    expect(tracker.handleDown(touchCode("jump"))).toBe("jump");
    expect(tracker.isDown("jump")).toBe(true);
    expect(tracker.wasPressed("jump")).toBe(true);
    tracker.handleUp(touchCode("jump"));
    expect(tracker.isDown("jump")).toBe(false);

    tracker.handleDown(touchCode("sprint"));
    tracker.handleUp(touchCode("sprint"));
    expect(tracker.isDown("sprint")).toBe(true);
  });

  test("keeps physical codes working", () => {
    const tracker = createActionStateTracker(toActionStateBindingMap(withTouchCodes({ jump: ["Space"] })));
    expect(tracker.handleDown("Space")).toBe("jump");
  });
});

describe("deriveTouchScheme", () => {
  test("reserved movement actions become the joystick, remaining actions become buttons", () => {
    const scheme = deriveTouchScheme(
      { moveLeft: ["KeyA"], moveRight: ["KeyD"], jump: ["Space"], restart: ["KeyR"] },
      { reserved: RESERVED, firstPerson: false },
    );
    expect(scheme?.joystick).toEqual({ up: null, down: null, left: "moveLeft", right: "moveRight" });
    expect(scheme?.buttons).toEqual([
      { action: "jump", label: "Jump", icon: null },
      { action: "restart", label: "Restart", icon: null },
    ]);
    expect(scheme?.look).toBe(false);
  });

  test("turn actions fill the horizontal axis when strafing is unbound", () => {
    const scheme = deriveTouchScheme(
      { moveForward: ["KeyW"], turnLeft: ["KeyA"], turnRight: ["KeyD"] },
      { reserved: RESERVED, firstPerson: false },
    );
    expect(scheme?.joystick).toEqual({ up: "moveForward", down: null, left: "turnLeft", right: "turnRight" });
  });

  test("gesture-bound and hidden actions drop out of the derived buttons", () => {
    const scheme = deriveTouchScheme(
      {
        shiftLeft: ["ArrowLeft"],
        shiftRight: ["ArrowRight"],
        rotateCw: ["ArrowUp"],
        hardDrop: ["Space"],
        restart: ["KeyR"],
      },
      {
        reserved: RESERVED,
        firstPerson: false,
        config: {
          gestures: { tap: "rotateCw", swipeDown: "hardDrop", drag: { left: "shiftLeft", right: "shiftRight" } },
          hidden: ["restart"],
        },
      },
    );
    expect(scheme?.joystick).toBeNull();
    expect(scheme?.buttons).toEqual([]);
    expect(scheme?.gestures?.tap).toBe("rotateCw");
  });

  test("hotbar slot actions and non-buttonable reserved actions never become buttons", () => {
    const scheme = deriveTouchScheme(
      { moveForward: ["KeyW"], tabTarget: ["Tab"], slot1: ["Digit1"], interact: ["KeyE"] },
      { reserved: RESERVED, firstPerson: false },
    );
    expect(scheme?.buttons).toEqual([{ action: "interact", label: "Interact", icon: null }]);
  });

  test("explicit button list wins over derivation and honors custom labels and icons", () => {
    const scheme = deriveTouchScheme(
      { hardDrop: ["Space"], hold: ["KeyC"], taunt: ["KeyT"] },
      {
        reserved: RESERVED,
        firstPerson: false,
        config: { buttons: [{ action: "hardDrop", label: "Drop" }, { action: "hold", icon: "star" }, { action: "taunt", icon: false }] },
      },
    );
    expect(scheme?.buttons).toEqual([
      { action: "hardDrop", label: "Drop", icon: null },
      { action: "hold", label: "Hold", icon: "star" },
      { action: "taunt", label: "Taunt", icon: false },
    ]);
  });

  test("first person defaults look on; touch: false disables everything", () => {
    const scheme = deriveTouchScheme({ moveForward: ["KeyW"] }, { reserved: RESERVED, firstPerson: true });
    expect(scheme?.look).toBe(true);
    expect(scheme?.lookSensitivity).toBeGreaterThan(0);
    expect(deriveTouchScheme({ moveForward: ["KeyW"] }, { reserved: RESERVED, firstPerson: true, config: false })).toBeNull();
  });

  test("returns null when nothing is derivable", () => {
    expect(deriveTouchScheme({}, { reserved: RESERVED, firstPerson: false })).toBeNull();
    expect(deriveTouchScheme(undefined, { reserved: RESERVED, firstPerson: false })).toBeNull();
  });
});
