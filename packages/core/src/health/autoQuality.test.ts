import { describe, expect, test } from "bun:test";

import { createAutoQuality } from "./autoQuality";

const TIERS = ["low", "medium", "high", "ultra"] as const;

function rig(initial: (typeof TIERS)[number], overrides: Partial<Parameters<typeof createAutoQuality>[0]["config"]> = {}) {
  let t = 0;
  const auto = createAutoQuality({
    tiers: TIERS,
    initial,
    now: () => t,
    config: { targetFrameMs: 16.7, windowFrames: 10, warmupMs: 1000, downCooldownMs: 2000, upCooldownMs: 10_000, ...overrides },
  });
  /** Run `frames` frames of `ms` each, advancing the fake clock by the frame time. */
  const run = (frames: number, ms: number) => {
    const changes = [];
    for (let i = 0; i < frames; i += 1) {
      t += ms;
      const change = auto.observe(ms);
      if (change !== null) changes.push(change);
    }
    return changes;
  };
  return { auto, run, advance: (ms: number) => { t += ms; } };
}

describe("auto quality", () => {
  test("ignores frames during warmup", () => {
    const { auto, run } = rig("high");
    expect(run(20, 30)).toEqual([]);
    expect(auto.tier()).toBe("high");
  });

  test("steps down one tier when p95 stays over the threshold", () => {
    const { auto, run, advance } = rig("high");
    advance(2000);
    const changes = run(10, 30);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ from: "high", to: "medium", direction: "down" });
    expect(auto.tier()).toBe("medium");
  });

  test("a cooldown and a fresh window separate two down steps", () => {
    const { auto, run, advance } = rig("ultra");
    advance(2000);
    run(10, 30);
    expect(auto.tier()).toBe("high");
    expect(run(5, 30)).toEqual([]);
    run(70, 30);
    expect(auto.tier()).toBe("medium");
    run(200, 30);
    expect(auto.tier()).toBe("low");
    expect(run(400, 30)).toEqual([]);
  });

  test("a single spike inside the window does not move the tier", () => {
    const { auto, run, advance } = rig("high");
    advance(1000);
    expect(run(9, 14)).toEqual([]);
    expect(run(1, 80)).toEqual([]);
    expect(auto.tier()).toBe("high");
  });

  test("steps up only after the long cooldown and only when well under target", () => {
    const { auto, run, advance } = rig("medium");
    advance(1000);
    expect(run(10, 14)).toEqual([]);
    advance(10_000);
    expect(run(10, 14)).toEqual([]);
    expect(auto.tier()).toBe("medium");
    expect(run(10, 8)).toHaveLength(1);
    expect(auto.tier()).toBe("high");
  });

  test("an up step that is undone quickly doubles the next up cooldown", () => {
    const { auto, run, advance } = rig("medium");
    advance(1000);
    advance(10_000);
    run(10, 8);
    expect(auto.tier()).toBe("high");
    advance(2000);
    run(10, 30);
    expect(auto.tier()).toBe("medium");
    // Past one up cooldown, still inside the doubled one.
    advance(10_000);
    expect(run(10, 8)).toEqual([]);
    advance(10_000);
    expect(run(10, 8)).toHaveLength(1);
  });

  test("respects the tier bounds", () => {
    const { auto, run, advance } = rig("medium", { minTier: 1, maxTier: 2 });
    advance(1000);
    expect(run(50, 40)).toEqual([]);
    expect(auto.tier()).toBe("medium");
    advance(10_000);
    run(10, 5);
    expect(auto.tier()).toBe("high");
    advance(100_000);
    expect(run(50, 5)).toEqual([]);
  });

  test("setTier adopts the player's tier and restarts the cooldowns", () => {
    const { auto, run, advance } = rig("high");
    advance(1000);
    auto.setTier("ultra");
    expect(auto.tier()).toBe("ultra");
    expect(run(10, 30)).toEqual([]);
    advance(2000);
    expect(run(10, 30)).toHaveLength(1);
  });

  test("ignores hidden-tab frames and non-finite values", () => {
    const { auto, run, advance } = rig("high");
    advance(1000);
    expect(run(30, 5000)).toEqual([]);
    expect(auto.observe(Number.NaN)).toBeNull();
    expect(auto.observe(-4)).toBeNull();
    expect(auto.tier()).toBe("high");
  });

  test("snapshot and restore round-trip, reset clears", () => {
    const { auto, run, advance } = rig("high");
    advance(2000);
    run(10, 30);
    const state = auto.snapshot();
    expect(state.tier).toBe("medium");
    auto.reset("ultra");
    expect(auto.tier()).toBe("ultra");
    auto.restore(state);
    expect(auto.tier()).toBe("medium");
    expect(auto.snapshot()).toEqual(state);
  });

  test("rejects a non-positive target", () => {
    expect(() => createAutoQuality({ tiers: TIERS, initial: "low", now: () => 0, config: { targetFrameMs: 0 } })).toThrow();
  });
});
