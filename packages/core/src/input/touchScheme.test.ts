import { describe, expect, test } from "bun:test";

import { createActionStateTracker, toActionStateBindingMap } from "./actionBindings";
import { deriveTouchScheme, touchButtonKind, touchCode, withTouchCodes } from "./touchScheme";

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
      { action: "jump", label: "Jump", icon: null, kind: "primary" },
      { action: "restart", label: "Restart", icon: null, kind: "utility" },
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
    expect(scheme?.buttons).toEqual([{ action: "interact", label: "Interact", icon: null, kind: "primary" }]);
  });

  test("explicit button list wins over derivation and honors custom labels and icons", () => {
    const scheme = deriveTouchScheme(
      { hardDrop: ["Space"], hold: ["KeyC"], taunt: ["KeyT"] },
      {
        reserved: RESERVED,
        firstPerson: false,
        config: {
          buttons: [
            { action: "hardDrop", label: "Drop" },
            { action: "hold", icon: "star" },
            { action: "taunt", icon: false, kind: "utility" },
          ],
        },
      },
    );
    expect(scheme?.buttons).toEqual([
      { action: "hardDrop", label: "Drop", icon: null, kind: "primary" },
      { action: "hold", label: "Hold", icon: "star", kind: "primary" },
      { action: "taunt", label: "Taunt", icon: false, kind: "utility" },
    ]);
  });

  test("flight-style bindings map pitch/yaw to the joystick and split primary from utility buttons", () => {
    const scheme = deriveTouchScheme(
      {
        pitchUp: ["ArrowUp"],
        pitchDown: ["ArrowDown"],
        yawLeft: ["ArrowLeft"],
        yawRight: ["ArrowRight"],
        thrust: ["KeyW"],
        airbrake: ["KeyS"],
        dodge: ["Space"],
        restart: ["KeyR"],
        start: ["Enter"],
      },
      { reserved: RESERVED, firstPerson: false },
    );
    expect(scheme?.joystick).toEqual({ up: "pitchUp", down: "pitchDown", left: "yawLeft", right: "yawRight" });
    expect(scheme?.buttons.filter((button) => button.kind === "primary").map((button) => button.action)).toEqual([
      "thrust",
      "airbrake",
      "dodge",
    ]);
    expect(scheme?.buttons.filter((button) => button.kind === "utility").map((button) => button.action)).toEqual([
      "restart",
      "start",
    ]);
  });

  test("driving-style bindings map accelerate/brake/steer to the joystick", () => {
    const scheme = deriveTouchScheme(
      { accelerate: ["KeyW"], brake: ["KeyS"], steerLeft: ["KeyA"], steerRight: ["KeyD"], boost: ["Space"] },
      { reserved: RESERVED, firstPerson: false },
    );
    expect(scheme?.joystick).toEqual({ up: "accelerate", down: "brake", left: "steerLeft", right: "steerRight" });
    expect(scheme?.buttons.map((button) => button.action)).toEqual(["boost"]);
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

describe("touchButtonKind", () => {
  test("meta actions and toggle-style prefixes are utility, gameplay verbs are primary", () => {
    expect(touchButtonKind("restart")).toBe("utility");
    expect(touchButtonKind("start")).toBe("utility");
    expect(touchButtonKind("pause")).toBe("utility");
    expect(touchButtonKind("toggleMute")).toBe("utility");
    expect(touchButtonKind("cycleCamera")).toBe("utility");
    expect(touchButtonKind("zoomIn")).toBe("utility");
    expect(touchButtonKind("toggler")).toBe("primary");
    expect(touchButtonKind("fire")).toBe("primary");
    expect(touchButtonKind("dodge")).toBe("primary");
  });
});
