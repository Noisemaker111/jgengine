import { describe, expect, test } from "bun:test";

import { createInputSnapshot } from "@jgengine/core/runtime/inputSnapshot";

describe("createInputSnapshot", () => {
  test("publish replaces the held-action set", () => {
    const input = createInputSnapshot();
    input.publish(["jump", "sprint"]);
    expect(input.isDown("jump")).toBe(true);
    expect(input.isDown("crouch")).toBe(false);
    expect(input.held()).toEqual(["jump", "sprint"]);
    input.publish([]);
    expect(input.isDown("jump")).toBe(false);
  });

  test("pointer starts null and mirrors the last published state", () => {
    const input = createInputSnapshot();
    expect(input.pointer()).toBeNull();
    input.publishPointer({ x: 0.4, y: -0.2, active: true });
    expect(input.pointer()).toEqual({ x: 0.4, y: -0.2, active: true });
    input.publishPointer(null);
    expect(input.pointer()).toBeNull();
  });
});

describe("InputSnapshot snapshot immutability", () => {
  test("held() returns an owned, frozen array — mutating the source array after publish does not leak in", () => {
    const input = createInputSnapshot();
    const source = ["jump"];
    input.publish(source);
    source.push("sprint");

    expect(input.held()).toEqual(["jump"]);
    expect(Object.isFrozen(input.held())).toBe(true);
  });

  test("pointer() returns a frozen, owned copy — mutating the source object after publishPointer does not leak in", () => {
    const input = createInputSnapshot();
    const source = { x: 0.1, y: 0.2, active: true };
    input.publishPointer(source);
    source.x = 0.9;

    expect(input.pointer()).toEqual({ x: 0.1, y: 0.2, active: true });
    expect(Object.isFrozen(input.pointer())).toBe(true);
  });
});

describe("InputSnapshot.justPressed / justReleased", () => {
  test("fires exactly one frame on press", () => {
    const input = createInputSnapshot();
    input.publish([]);
    input.publish(["jump"]);
    expect(input.justPressed("jump")).toBe(true);
    input.publish(["jump"]);
    expect(input.justPressed("jump")).toBe(false);
  });

  test("stays false while the action is held across many frames", () => {
    const input = createInputSnapshot();
    input.publish(["jump"]);
    for (let frame = 0; frame < 5; frame += 1) {
      input.publish(["jump"]);
      expect(input.justPressed("jump")).toBe(false);
    }
  });

  test("refires after release and repress", () => {
    const input = createInputSnapshot();
    input.publish(["jump"]);
    input.publish([]);
    input.publish(["jump"]);
    expect(input.justPressed("jump")).toBe(true);
  });

  test("justReleased fires exactly one frame after release", () => {
    const input = createInputSnapshot();
    input.publish(["jump"]);
    input.publish([]);
    expect(input.justReleased("jump")).toBe(true);
    input.publish([]);
    expect(input.justReleased("jump")).toBe(false);
  });

  test("first published frame counts as a press when it starts held", () => {
    const input = createInputSnapshot();
    input.publish(["jump"]);
    expect(input.justPressed("jump")).toBe(true);
    expect(input.justReleased("jump")).toBe(false);
  });

  test("justPressed and justReleased are independent per action", () => {
    const input = createInputSnapshot();
    input.publish(["jump"]);
    input.publish(["sprint"]);
    expect(input.justPressed("sprint")).toBe(true);
    expect(input.justReleased("jump")).toBe(true);
    expect(input.justPressed("jump")).toBe(false);
    expect(input.justReleased("sprint")).toBe(false);
  });
});

describe("InputSnapshot.axis", () => {
  test("samples axis bindings against the held-action set (action names, not key codes)", () => {
    const input = createInputSnapshot();
    input.publish(["throttle", "steerLeft"]);
    const axes = input.axis({
      throttle: { positive: ["throttle"] },
      steer: { positive: ["steerRight"], negative: ["steerLeft"] },
    });
    expect(axes.throttle).toBe(1);
    expect(axes.steer).toBe(-1);
  });

  test("respects per-axis ranges and clears when actions release", () => {
    const input = createInputSnapshot();
    input.publish(["gas"]);
    expect(input.axis({ gas: { positive: ["gas"] } }, { gas: { min: 0, max: 1 } }).gas).toBe(1);
    input.publish([]);
    expect(input.axis({ gas: { positive: ["gas"] } }).gas).toBe(0);
  });
});
