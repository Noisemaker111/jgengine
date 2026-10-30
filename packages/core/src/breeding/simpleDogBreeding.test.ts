import { describe, expect, test } from "bun:test";

import { inheritValues } from "../inheritance/inheritance";
import { tierAt, type ThresholdBoundary } from "../threshold/thresholds";

function rngOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

describe("simple dog breeding", () => {
  test("two parents pass their values on, and a puppy becomes an adult by its age", () => {
    const sire = { size: 60, speed: 40, coat: 10 };
    const dam = { size: 50, speed: 55, coat: 10 };
    const puppy = inheritValues(sire, dam, rngOf(29), { defaultRule: { pick: "either", higherChance: 0.55 } });
    expect([sire.size, dam.size]).toContain(puppy.values.size);
    expect([sire.speed, dam.speed]).toContain(puppy.values.speed);
    expect(puppy.mutations).toEqual([]);
    // A two-step stage list is all the growing needs.
    const stages: ThresholdBoundary[] = [
      { id: "puppy", at: 0 },
      { id: "adult", at: 1 },
    ];
    const stageAt = (months: number) => tierAt(stages, months / 12)?.id ?? "";
    expect(stageAt(0)).toBe("puppy");
    expect(stageAt(11.9)).toBe("puppy");
    expect(stageAt(12)).toBe("adult");
  });
});
