import { describe, expect, test } from "bun:test";

import { inheritValues } from "../inheritance/inheritance";
import { createPhaseSchedule } from "../time/stateSchedule";

function rngOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const DAY = 86_400;

describe("simple dog breeding", () => {
  test("two parents pass their values on, and a puppy becomes an adult by its age", () => {
    const sire = { size: 60, speed: 40, coat: 10 };
    const dam = { size: 50, speed: 55, coat: 10 };
    const puppy = inheritValues(sire, dam, rngOf(29), { defaultRule: { pick: "either", higherChance: 0.55 } });
    expect([sire.size, dam.size]).toContain(puppy.values.size);
    expect([sire.speed, dam.speed]).toContain(puppy.values.speed);
    expect(puppy.values.coat).toBe(10);
    expect(puppy.mutations).toEqual([]);

    const growth = createPhaseSchedule({
      phases: [
        { state: "puppy", durationSeconds: 90 * DAY },
        { state: "adult", durationSeconds: 1 },
      ],
    });
    expect(growth.state()).toBe("puppy");
    growth.tick(89 * DAY);
    expect(growth.state()).toBe("puppy");
    growth.tick(1 * DAY);
    expect(growth.state()).toBe("adult");
  });
});
