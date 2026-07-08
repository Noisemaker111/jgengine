import { describe, expect, test } from "bun:test";

import { createInputChannel, type InputFrame } from "./inputChannel";

describe("createInputChannel", () => {
  test("starts at a neutral frame", () => {
    const channel = createInputChannel();
    expect(channel.isHeld("jump")).toBe(false);
    expect(channel.axis()).toEqual({ forward: 0, right: 0 });
    expect(channel.aim()).toEqual({ yaw: 0, pitch: 0 });
    expect(channel.jumpHeld()).toBe(false);
    expect(channel.sprintHeld()).toBe(false);
    expect(channel.pointerLocked()).toBe(false);
    expect(channel.snapshot().held.size).toBe(0);
  });

  test("publish/read round-trip reflects the latest frame", () => {
    const channel = createInputChannel();
    const frame: InputFrame = {
      held: new Set(["moveForward", "sprint"]),
      forward: 1,
      right: -1,
      jump: true,
      sprint: true,
      yaw: 1.5,
      pitch: -0.3,
      pointerLocked: true,
    };
    channel.publish(frame);
    expect(channel.isHeld("moveForward")).toBe(true);
    expect(channel.isHeld("interact")).toBe(false);
    expect(channel.axis()).toEqual({ forward: 1, right: -1 });
    expect(channel.aim()).toEqual({ yaw: 1.5, pitch: -0.3 });
    expect(channel.jumpHeld()).toBe(true);
    expect(channel.sprintHeld()).toBe(true);
    expect(channel.pointerLocked()).toBe(true);
    expect(channel.snapshot()).toEqual(frame);
  });

  test("publishing a new frame replaces the previous one entirely", () => {
    const channel = createInputChannel();
    channel.publish({
      held: new Set(["jump"]),
      forward: 1,
      right: 0,
      jump: true,
      sprint: false,
      yaw: 0,
      pitch: 0,
      pointerLocked: false,
    });
    channel.publish({
      held: new Set(),
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      yaw: 0,
      pitch: 0,
      pointerLocked: false,
    });
    expect(channel.isHeld("jump")).toBe(false);
    expect(channel.jumpHeld()).toBe(false);
  });
});
