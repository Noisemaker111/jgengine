import { expect, test } from "bun:test";

import { createPacedSchedule, pickWeighted } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Wave schedule
 * A Schedule fires each wave on a pace, a Table picks the enemy for every spawn, and the wave index sets how many.
 */
test("wave schedule", () => {
  const rng = seededRng("waves");
  const waves = createPacedSchedule({ firstAt: 10, every: 30, count: 3 }, rng);
  const enemies = [{ id: "grunt", weight: 5 }, { id: "brute", weight: 1 }];
  const spawned: string[] = [];
  const tick = (now: number) => {
    for (const wave of waves.due(now)) {
      for (let n = 0; n < 5 + wave * 2; n += 1) spawned.push(pickWeighted(rng, enemies, (e) => e.weight)?.id ?? "grunt");
    }
  };

  tick(9);
  expect(spawned).toHaveLength(0);
  tick(10);
  expect(spawned).toHaveLength(5);
  tick(100);
  expect(spawned).toHaveLength(5 + 7 + 9);
  expect(waves.done()).toBe(true);
  expect(spawned.filter((id) => id === "grunt").length).toBeGreaterThan(spawned.length / 2);
});
