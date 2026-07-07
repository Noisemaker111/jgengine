import { describe, expect, it } from "bun:test";
import { createAutoTargeter, selectAutoTarget, type AutoTargetDeps } from "./autoTarget";

const positions: Record<string, number> = { a: 5, b: 12, c: 2, d: 20 };
const health: Record<string, number> = { a: 100, b: 30, c: 60, d: 10 };
const pathProgress: Record<string, number> = { a: 0.4, b: 0.9, c: 0.1, d: 0.6 };

const deps: AutoTargetDeps = {
  candidates: () => ["a", "b", "c", "d"],
  distance: (_from, to) => positions[to] ?? null,
  strength: (to) => health[to] ?? 0,
  progress: (to) => pathProgress[to] ?? 0,
};

describe("selectAutoTarget", () => {
  it("nearest picks the smallest distance (Vampire Survivors auto-fire)", () => {
    expect(selectAutoTarget("nearest", "hero", deps)).toBe("c");
  });

  it("farthest picks the largest distance", () => {
    expect(selectAutoTarget("farthest", "hero", deps)).toBe("d");
  });

  it("strongest / weakest pick by strength metric", () => {
    expect(selectAutoTarget("strongest", "hero", deps)).toBe("a");
    expect(selectAutoTarget("weakest", "hero", deps)).toBe("d");
  });

  it("first / last on path pick by progress (Bloons tower priority)", () => {
    expect(selectAutoTarget("first", "hero", deps)).toBe("b");
    expect(selectAutoTarget("last", "hero", deps)).toBe("c");
  });

  it("random uses the supplied rng deterministically", () => {
    expect(selectAutoTarget("random", "hero", { ...deps, rng: () => 0 })).toBe("a");
    expect(selectAutoTarget("random", "hero", { ...deps, rng: () => 0.99 })).toBe("d");
  });

  it("returns null with no candidates and excludes self", () => {
    expect(selectAutoTarget("nearest", "hero", { ...deps, candidates: () => [] })).toBe(null);
    expect(selectAutoTarget("nearest", "a", { ...deps, candidates: () => ["a"] })).toBe(null);
  });

  it("skips candidates whose metric is unresolved", () => {
    const target = selectAutoTarget("nearest", "hero", {
      ...deps,
      candidates: () => ["a", "gone"],
      distance: (_f, to) => (to === "gone" ? null : positions[to] ?? null),
    });
    expect(target).toBe("a");
  });
});

describe("createAutoTargeter", () => {
  it("re-evaluates each pick and honors a policy switch", () => {
    const targeter = createAutoTargeter("nearest", deps);
    expect(targeter.pick("hero")).toBe("c");
    targeter.setPolicy("strongest");
    expect(targeter.policy()).toBe("strongest");
    expect(targeter.pick("hero")).toBe("a");
  });
});
