import { describe, expect, test } from "bun:test";

import { createActionStateTracker, toActionStateBindingMap } from "./actionBindings";
import { deriveTouchScheme, touchButtonKind, touchButtonShape, touchCode, withTouchCodes } from "./touchScheme";

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
  test("reserved movement actions become the joystick, remaining non-lifecycle actions become buttons", () => {
    const scheme = deriveTouchScheme(
      { moveLeft: ["KeyA"], moveRight: ["KeyD"], jump: ["Space"], restart: ["KeyR"] },
      { reserved: RESERVED, firstPerson: false },
    );
    expect(scheme?.joystick).toEqual({ up: null, down: null, left: "moveLeft", right: "moveRight" });
    expect(scheme?.buttons).toEqual([
      { action: "jump", label: "Jump", icon: null, kind: "primary", shape: "circle", anchor: null, image: null },
    ]);
    expect(scheme?.look).toBe(false);
    expect(scheme?.layout).toEqual({ movement: "bottom-left", actions: "bottom-right", utility: "bottom-center" });
    expect(scheme?.style).toBe("glass");
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
    expect(scheme?.buttons).toEqual([
      { action: "interact", label: "Interact", icon: null, kind: "primary", shape: "circle", anchor: null, image: null },
    ]);
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
      { action: "hardDrop", label: "Drop", icon: null, kind: "primary", shape: "circle", anchor: null, image: null },
      { action: "hold", label: "Hold", icon: "star", kind: "primary", shape: "circle", anchor: null, image: null },
      { action: "taunt", label: "Taunt", icon: false, kind: "utility", shape: "circle", anchor: null, image: null },
    ]);
  });

  test("shape and anchor come from the spec, or derive from the action name", () => {
    const scheme = deriveTouchScheme(
      { brake: ["KeyS"], handbrake: ["Space"], nitro: ["KeyN"] },
      {
        reserved: RESERVED,
        firstPerson: false,
        config: {
          buttons: [
            { action: "brake", anchor: "right" },
            "handbrake",
            { action: "nitro", shape: "trigger", anchor: "bottom-right" },
          ],
        },
      },
    );
    expect(scheme?.buttons).toEqual([
      { action: "brake", label: "Brake", icon: null, kind: "primary", shape: "pedal", anchor: "right", image: null },
      { action: "handbrake", label: "Handbrake", icon: null, kind: "primary", shape: "lever", anchor: null, image: null },
      { action: "nitro", label: "Nitro", icon: null, kind: "primary", shape: "trigger", anchor: "bottom-right", image: null },
    ]);
  });

  test("a custom image and square slot shape make a game-art spell slot trivial", () => {
    const scheme = deriveTouchScheme(
      { spellFire: ["Digit1"], inventory: ["KeyI"] },
      {
        reserved: RESERVED,
        firstPerson: false,
        config: {
          buttons: [
            { action: "spellFire", image: "data:image/svg+xml,<svg/>", anchor: "right" },
            "inventory",
          ],
        },
      },
    );
    expect(scheme?.buttons).toEqual([
      { action: "spellFire", label: "Spell Fire", icon: null, kind: "primary", shape: "square", anchor: "right", image: "data:image/svg+xml,<svg/>" },
      { action: "inventory", label: "Inventory", icon: null, kind: "utility", shape: "square", anchor: null, image: null },
    ]);
  });

  test("layout and style resolve from config, falling back to the classic bottom glass defaults", () => {
    const custom = deriveTouchScheme(
      { fire: ["KeyF"] },
      { reserved: RESERVED, firstPerson: false, config: { layout: { actions: "right" }, style: "arcade" } },
    );
    expect(custom?.layout).toEqual({ movement: "bottom-left", actions: "right", utility: "bottom-center" });
    expect(custom?.style).toBe("arcade");
  });

  test("flight-style bindings map pitch/yaw to the joystick and drop lifecycle actions from the dock", () => {
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
    expect(scheme?.buttons.map((button) => button.action)).toEqual(["thrust", "airbrake", "dodge"]);
  });

  test("session-lifecycle actions never auto-derive a button, but an explicit list still docks them", () => {
    const derived = deriveTouchScheme(
      { fire: ["KeyF"], restart: ["KeyR"], start: ["Enter"], pause: ["KeyP"], menu: ["Escape"] },
      { reserved: RESERVED, firstPerson: false },
    );
    expect(derived?.buttons.map((button) => button.action)).toEqual(["fire"]);

    const explicit = deriveTouchScheme(
      { fire: ["KeyF"], pause: ["KeyP"] },
      { reserved: RESERVED, firstPerson: false, config: { buttons: ["fire", "pause"] } },
    );
    expect(explicit?.buttons.map((button) => button.action)).toEqual(["fire", "pause"]);
  });

  test("driving-style bindings map accelerate/brake/steer to the joystick", () => {
    const scheme = deriveTouchScheme(
      { accelerate: ["KeyW"], brake: ["KeyS"], steerLeft: ["KeyA"], steerRight: ["KeyD"], boost: ["Space"] },
      { reserved: RESERVED, firstPerson: false },
    );
    expect(scheme?.joystick).toEqual({ up: "accelerate", down: "brake", left: "steerLeft", right: "steerRight" });
    expect(scheme?.buttons.map((button) => button.action)).toEqual(["boost"]);
  });

  test("a horizontal movement axis steers only, freeing throttle/brake to become pedal buttons", () => {
    const scheme = deriveTouchScheme(
      { throttle: ["KeyW"], brake: ["KeyS"], steerLeft: ["KeyA"], steerRight: ["KeyD"] },
      { reserved: RESERVED, firstPerson: false, config: { movement: { axis: "horizontal" } } },
    );
    expect(scheme?.joystick).toEqual({ up: null, down: null, left: "steerLeft", right: "steerRight" });
    expect(scheme?.buttons.map((button) => ({ action: button.action, shape: button.shape }))).toEqual([
      { action: "throttle", shape: "pedal" },
      { action: "brake", shape: "pedal" },
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

describe("touchButtonShape", () => {
  test("driving, firing, and steering verbs get their physical silhouette; the rest stay circles", () => {
    expect(touchButtonShape("brake")).toBe("pedal");
    expect(touchButtonShape("accelerate")).toBe("pedal");
    expect(touchButtonShape("handbrake")).toBe("lever");
    expect(touchButtonShape("fire")).toBe("trigger");
    expect(touchButtonShape("steerLeft")).toBe("wheel");
    expect(touchButtonShape("spellFire")).toBe("square");
    expect(touchButtonShape("slot1Cast")).toBe("square");
    expect(touchButtonShape("inventory")).toBe("square");
    expect(touchButtonShape("jump")).toBe("circle");
    expect(touchButtonShape("interact")).toBe("circle");
  });
});

describe("touch control modes (#1370)", () => {
  const INPUT = {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    jump: ["Space"],
    fire: ["mouse0"],
    flightAirbrake: ["KeyX"],
    exitVehicle: ["KeyF"],
  };
  const CONFIG = {
    buttons: ["fire", "jump"],
    modes: {
      car: { buttons: [{ action: "jump", label: "Handbrake" }, "exitVehicle"] },
      aircraft: { buttons: ["flightAirbrake", "exitVehicle"], movement: { axis: "both" as const } },
    },
  };

  test("base config applies when no mode is active", () => {
    const scheme = deriveTouchScheme(INPUT, { reserved: RESERVED, firstPerson: false, config: CONFIG });
    expect(scheme?.buttons.map((b) => b.action)).toEqual(["fire", "jump"]);
  });

  test("an active mode replaces the matching base fields", () => {
    const scheme = deriveTouchScheme(INPUT, { reserved: RESERVED, firstPerson: false, config: CONFIG, mode: "car" });
    expect(scheme?.buttons.map((b) => b.action)).toEqual(["jump", "exitVehicle"]);
    expect(scheme?.buttons[0]?.label).toBe("Handbrake");
    // Movement joystick still derives from the base fields the mode leaves untouched.
    expect(scheme?.joystick?.up).toBe("moveForward");
  });

  test("an unknown mode falls back to the base config", () => {
    const scheme = deriveTouchScheme(INPUT, { reserved: RESERVED, firstPerson: false, config: CONFIG, mode: "boat" });
    expect(scheme?.buttons.map((b) => b.action)).toEqual(["fire", "jump"]);
  });
});
