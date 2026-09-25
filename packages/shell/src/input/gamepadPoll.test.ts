import { describe, expect, test } from "bun:test";

import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { gamepadFeelOptions, type GamepadSample } from "@jgengine/core/input/gamepadModel";

<<<<<<< HEAD
import { createLocalPlayers } from "@jgengine/core/runtime/localPlayers";

import { emptyGamepadPoll, emptyGamepadRoute, gamepadCodes, routeGamepads, stepGamepadPoll } from "./gamepadPoll";
=======
import { emptyGamepadPoll, gamepadCodes, rebindGamepadPoll, stepGamepadPoll } from "./gamepadPoll";
>>>>>>> origin/main

const input = { steerRight: ["KeyD", "padaxis:0+"], throttle: ["KeyW", "pad:7"], jump: ["Space"] };
const pad = (axis: number, trigger: number): GamepadSample => ({
  axes: [axis],
  buttons: [...Array.from({ length: 7 }, () => ({ pressed: false, value: 0 })), { pressed: trigger > 0, value: trigger }],
  connected: true,
});

describe("stepGamepadPoll", () => {
  test("keeps only pad codes and presses/releases tracker actions on change", () => {
    const bindings = gamepadCodes(input);
    expect(bindings).toEqual({ steerRight: ["padaxis:0+"], throttle: ["pad:7"] });
    const tracker = createActionStateTracker(toActionStateBindingMap(input));
    const poll = emptyGamepadPoll();
    const options = gamepadFeelOptions({ deadzone: 0, triggerDeadzone: 0.1 });
    const analog = stepGamepadPoll(poll, [pad(0.5, 0.55)], bindings, options, tracker, null);
    expect(tracker.isDown("steerRight")).toBe(true);
    expect(tracker.isDown("throttle")).toBe(true);
    expect(analog?.steerRight).toBeCloseTo(0.5 / 0.95, 5);
    expect(analog?.throttle).toBeCloseTo(0.5, 5);
    expect(stepGamepadPoll(poll, [pad(0, 0.05)], bindings, options, tracker, analog)).toBeNull();
    expect(tracker.isDown("steerRight")).toBe(false);
    expect(tracker.isDown("throttle")).toBe(false);
  });

  test("merges over another source's analog map and drops pad values once released", () => {
    const bindings = gamepadCodes(input);
    const tracker = createActionStateTracker(toActionStateBindingMap(input));
    const poll = emptyGamepadPoll();
    const options = gamepadFeelOptions({ deadzone: 0 });
    const touch = { moveForward: 0.4, steerRight: 0.2 };
    const first = stepGamepadPoll(poll, [pad(0.95, 0)], bindings, options, tracker, touch);
    expect(first).toEqual({ moveForward: 0.4, steerRight: 1 });
    const second = stepGamepadPoll(poll, [pad(0, 0)], bindings, options, tracker, first);
    expect(second).toEqual({ moveForward: 0.4, steerRight: 0.2 });
    expect(second).toBe(first);
    expect(stepGamepadPoll(poll, [null], bindings, options, tracker, null)).toBeNull();
  });

  test("a context swap keeps keyboard holds and moves pad holds to the new map", () => {
    const onFoot = { forward: ["KeyW", "pad:7"], jump: ["Space", "pad:0"] };
    const driving = { throttle: ["KeyW", "pad:7"], horn: ["KeyH", "pad:0"] };
    const tracker = createActionStateTracker<string>(toActionStateBindingMap(onFoot));
    const poll = emptyGamepadPoll();
    const options = gamepadFeelOptions({ deadzone: 0, triggerDeadzone: 0 });
    const held: GamepadSample = {
      axes: [0],
      buttons: [{ pressed: true, value: 1 }, ...Array.from({ length: 6 }, () => ({ pressed: false, value: 0 })), { pressed: true, value: 1 }],
      connected: true,
    };
    tracker.handleDown("KeyW");
    stepGamepadPoll(poll, [held], gamepadCodes(onFoot), options, tracker, null);
    expect(tracker.isDown("jump")).toBe(true);

    tracker.rebind(toActionStateBindingMap(driving));
    rebindGamepadPoll(poll, gamepadCodes(onFoot), gamepadCodes(driving), tracker);
    expect(tracker.isDown("throttle")).toBe(true);
    stepGamepadPoll(poll, [held], gamepadCodes(driving), options, tracker, null);
    expect(tracker.isDown("horn")).toBe(true);
    expect(tracker.isDown("throttle")).toBe(true);

    const released: GamepadSample = { ...held, buttons: held.buttons.map(() => ({ pressed: false, value: 0 })) };
    stepGamepadPoll(poll, [released], gamepadCodes(driving), options, tracker, null);
    expect(tracker.isDown("horn")).toBe(false);
    expect(tracker.isDown("throttle")).toBe(true);
    tracker.handleUp("KeyW");
    expect(tracker.isDown("throttle")).toBe(false);
  });
});

describe("routeGamepads", () => {
  const idle = (): GamepadSample => ({ axes: [0.3], buttons: [{ pressed: false, value: 0 }], connected: true });
  const pressing = (): GamepadSample => ({ axes: [0], buttons: [{ pressed: true, value: 1 }], connected: true });

  test("one seat sends every pad to the primary player, even before a button press", () => {
    const seats = createLocalPlayers({ maxSlots: 1, primaryUserId: "u1" });
    const route = routeGamepads([idle(), idle()], seats, emptyGamepadRoute());
    expect(route.primary.every((pad) => pad !== null)).toBe(true);
    expect(route.seatCount).toBe(0);
    expect(route.joined).toEqual([]);
  });

  test("a second pad hot-joins its own seat on a button press, not on stick drift", () => {
    const seats = createLocalPlayers({ maxSlots: 2, primaryUserId: "u1" });
    const route = emptyGamepadRoute();
    routeGamepads([pressing(), idle()], seats, route);
    expect(route.primary[0]).not.toBeNull();
    expect(route.primary[1]).toBeNull();
    expect(route.seatCount).toBe(0);
    routeGamepads([idle(), pressing()], seats, route);
    expect(route.joined.map((slot) => slot.userId)).toEqual(["u1:p2"]);
    expect(route.seatCount).toBe(1);
    expect(route.seats[0]?.slotId).toBe("slot:1");
    routeGamepads([idle(), idle()], seats, route);
    expect(route.joined).toEqual([]);
    expect(route.seatCount).toBe(1);
  });
});

