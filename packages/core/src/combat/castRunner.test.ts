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
