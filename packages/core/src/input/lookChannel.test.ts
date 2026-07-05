import { describe, expect, test } from "bun:test";

import { createLookChannel } from "./lookChannel";

describe("createLookChannel", () => {
  test("consume scales, negates, and clears accumulated deltas", () => {
    const channel = createLookChannel({ sensitivity: 0.002 });
    channel.accumulate(10, -5);
    channel.accumulate(5, 0);
    expect(channel.consume()).toEqual({ yaw: -15 * 0.002, pitch: 5 * 0.002 });
    const drained = channel.consume();
    expect(drained.yaw).toBeCloseTo(0);
    expect(drained.pitch).toBeCloseTo(0);
  });

  test("pose registers round-trip", () => {
    const channel = createLookChannel({ sensitivity: 0.002 });
    channel.setYaw(1.5);
    channel.setPitch(-0.3);
    expect(channel.readYaw()).toBe(1.5);
    expect(channel.readPitch()).toBe(-0.3);
  });

  test("vertical offset clamps to [0, max]", () => {
    const channel = createLookChannel({ sensitivity: 1, maxVerticalOffset: 1.15 });
    channel.setVerticalOffset(2);
    expect(channel.readVerticalOffset()).toBe(1.15);
    channel.setVerticalOffset(-1);
    expect(channel.readVerticalOffset()).toBe(0);
    channel.setVerticalOffset(0.5);
    expect(channel.readVerticalOffset()).toBe(0.5);
  });
});
