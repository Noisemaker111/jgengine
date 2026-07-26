import { describe, expect, it } from "bun:test";

import { createCastRunner } from "./castRunner";

describe("castRunner", () => {
  it("runs a cast to completion and reports bar state along the way", () => {
    const runner = createCastRunner();
    expect(runner.state()).toBeNull();
    expect(runner.begin({ abilityId: "fireball", castTimeMs: 2000 })).toBe(true);
    expect(runner.casting()).toBe(true);

    expect(runner.tick(0.5)).toBeNull();
    const state = runner.state()!;
    expect(state.abilityId).toBe("fireball");
    expect(state.fraction).toBeCloseTo(0.25, 5);
    expect(state.remainingMs).toBe(1500);

    expect(runner.tick(1.4)).toBeNull();
    expect(runner.tick(0.1)).toEqual({ kind: "completed", abilityId: "fireball" });
    expect(runner.casting()).toBe(false);
    expect(runner.state()).toBeNull();
  });

  it("rejects overlapping begins until the current cast resolves", () => {
    const runner = createCastRunner();
    runner.begin({ abilityId: "heal", castTimeMs: 1000 });
    expect(runner.begin({ abilityId: "smite", castTimeMs: 500 })).toBe(false);
    runner.interrupt();
    expect(runner.begin({ abilityId: "smite", castTimeMs: 500 })).toBe(true);
  });

  it("interrupts once accumulated movement exceeds the tolerance", () => {
    const runner = createCastRunner();
    runner.begin({ abilityId: "heal", castTimeMs: 1000, moveTolerance: 0.1 });
    expect(runner.tick(0.1, 0.06)).toBeNull();
    expect(runner.tick(0.1, 0.06)).toEqual({ kind: "interrupted", abilityId: "heal", reason: "moved" });
    expect(runner.casting()).toBe(false);
  });

  it("infinite tolerance casts on the move", () => {
    const runner = createCastRunner();
    runner.begin({ abilityId: "hymn", castTimeMs: 100, moveTolerance: Number.POSITIVE_INFINITY });
    expect(runner.tick(0.05, 10)).toBeNull();
    expect(runner.tick(0.05, 10)).toEqual({ kind: "completed", abilityId: "hymn" });
  });

  it("manual interrupt returns the event once and only while casting", () => {
    const runner = createCastRunner();
    expect(runner.interrupt()).toBeNull();
    runner.begin({ abilityId: "heal", castTimeMs: 1000 });
    expect(runner.interrupt("replaced")).toEqual({ kind: "interrupted", abilityId: "heal", reason: "replaced" });
    expect(runner.interrupt()).toBeNull();
  });

  it("zero cast time completes on the next tick", () => {
    const runner = createCastRunner();
    runner.begin({ abilityId: "jab", castTimeMs: 0 });
    expect(runner.state()!.fraction).toBe(1);
    expect(runner.tick(0)).toEqual({ kind: "completed", abilityId: "jab" });
  });
});

describe("moveDeadzone", () => {
  const CONFIG = { abilityId: "heal", castTimeMs: 2000, moveTolerance: 0.04, moveDeadzone: 0.04 };

  it("jitter under the deadzone never accumulates, however many frames pass", () => {
    // The failure this exists to prevent: 0.01 of ground-snap noise per frame silently summing past
    // a 0.04 tolerance and cancelling a cast the player never interrupted.
    const runner = createCastRunner();
    runner.begin(CONFIG);
    // 2000ms at 1/60s ≈ 120 ticks; stay just short of completion so every tick is genuinely quiet.
    for (let i = 0; i < 110; i += 1) {
      expect(runner.tick(1 / 60, 0.01)).toBeNull();
    }
    // ...and it then COMPLETES rather than interrupting, despite 110 frames of accumulated jitter.
    let event = null;
    for (let i = 0; i < 20 && event === null; i += 1) event = runner.tick(1 / 60, 0.01);
    expect(event).toEqual({ kind: "completed", abilityId: "heal" });
  });

  it("without a deadzone the same jitter does cancel the cast", () => {
    const runner = createCastRunner();
    runner.begin({ ...CONFIG, moveDeadzone: undefined });
    let event = null;
    for (let i = 0; i < 200 && event === null; i += 1) event = runner.tick(1 / 60, 0.01);
    expect(event).toEqual({ kind: "interrupted", abilityId: "heal", reason: "moved" });
  });

  it("real movement above the deadzone still interrupts", () => {
    const runner = createCastRunner();
    runner.begin(CONFIG);
    expect(runner.tick(1 / 60, 0.01)).toBeNull();
    expect(runner.tick(1 / 60, 0.5)).toEqual({ kind: "interrupted", abilityId: "heal", reason: "moved" });
  });

  it("movement exactly at the deadzone is jitter, not travel", () => {
    const runner = createCastRunner();
    runner.begin(CONFIG);
    for (let i = 0; i < 50; i += 1) expect(runner.tick(1 / 60, 0.04)).toBeNull();
  });

  it("defaults to 0, so existing callers are unchanged", () => {
    const runner = createCastRunner();
    runner.begin({ abilityId: "bolt", castTimeMs: 2000 });
    expect(runner.tick(1 / 60, 0.05)).toEqual({ kind: "interrupted", abilityId: "bolt", reason: "moved" });
  });
});
