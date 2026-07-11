import { describe, expect, test } from "bun:test";

import { generateDeal, reshuffleRemaining } from "./deal";
import { isFree, SLOT_COUNT } from "./layout";
import { matchable } from "./tiles";

function fullBoard(): Set<number> {
  const present = new Set<number>();
  for (let i = 0; i < SLOT_COUNT; i += 1) present.add(i);
  return present;
}

function replay(
  start: ReadonlySet<number>,
  faces: ReadonlyArray<string | null>,
  solution: ReadonlyArray<readonly [number, number]>,
): boolean {
  const present = new Set<number>(start);
  for (const [a, b] of solution) {
    if (!present.has(a) || !present.has(b)) return false;
    if (!isFree(a, present) || !isFree(b, present)) return false;
    const fa = faces[a];
    const fb = faces[b];
    if (fa === null || fb === null || !matchable(fa, fb)) return false;
    present.delete(a);
    present.delete(b);
  }
  return present.size === 0;
}

describe("solvable deal generation", () => {
  const seeds = ["2026-07-11", "daily", "turtle", "mahjong-preview"];
  for (let i = 0; i < 40; i += 1) seeds.push(`seed-${i}`);

  test("every seed yields a full 144-tile deal whose recorded solution solves it", () => {
    for (const seed of seeds) {
      const deal = generateDeal(seed);
      expect(deal.faces.filter((f) => f !== null).length).toBe(144);
      expect(deal.solution.length).toBe(72);
      expect(replay(fullBoard(), deal.faces, deal.solution)).toBe(true);
    }
  });

  test("a seed is deterministic", () => {
    const a = generateDeal("determinism");
    const b = generateDeal("determinism");
    expect(a.faces).toEqual(b.faces);
    expect(a.solution).toEqual(b.solution);
  });
});

describe("reshuffle solvability", () => {
  test("reshuffling remaining tiles from a mid-game state stays solvable", () => {
    for (const seed of ["rs-a", "rs-b", "rs-c", "2026-07-11"]) {
      const deal = generateDeal(seed);
      for (const removed of [10, 30, 55, 68]) {
        const present = fullBoard();
        for (let i = 0; i < removed; i += 1) {
          present.delete(deal.solution[i][0]);
          present.delete(deal.solution[i][1]);
        }
        const result = reshuffleRemaining(present, deal.faces, `${seed}-r${removed}`);
        expect(result).not.toBeNull();
        const shuffled = result as NonNullable<typeof result>;
        // preserves which positions are occupied
        expect(shuffled.faces.filter((f) => f !== null).length).toBe(present.size);
        expect(replay(present, shuffled.faces, shuffled.solution)).toBe(true);
      }
    }
  });
});
