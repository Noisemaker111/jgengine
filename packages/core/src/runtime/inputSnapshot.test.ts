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
