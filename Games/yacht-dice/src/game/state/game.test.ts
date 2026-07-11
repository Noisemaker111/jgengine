import { describe, expect, test } from "bun:test";

import type { RecordStorage } from "@jgengine/core/game/recordBook";

import { CATEGORIES } from "../score/categories";
import { grandTotal } from "../score/sheet";
import {
  MAX_ROLLS,
  bank,
  createGame,
  createRecords,
  roll,
  toggleHold,
  type YachtState,
} from "./game";

function fresh(seed = "seed-a"): YachtState {
  return createGame(seed, false, null, {});
}

describe("rolling", () => {
  test("the same seed produces the same first roll (daily reproducibility)", () => {
    expect(roll(fresh("daily-2026")).dice).toEqual(roll(fresh("daily-2026")).dice);
  });

  test("different seeds generally diverge", () => {
    const a = roll(fresh("seed-a")).dice;
    const b = roll(fresh("seed-b")).dice;
    expect(a).not.toEqual(b);
  });

  test("the first roll rerolls all five dice and spends one roll", () => {
    const rolled = roll(fresh());
    expect(rolled.hasRolled).toBe(true);
    expect(rolled.rollsLeft).toBe(MAX_ROLLS - 1);
    expect(rolled.spins.every((s) => s === 1)).toBe(true);
    for (const die of rolled.dice) {
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(6);
    }
  });

  test("held dice keep their value across a reroll; unheld advance the cursor", () => {
    const first = roll(fresh());
    const withHolds = toggleHold(toggleHold(first, 0), 2);
    const second = roll(withHolds);
    expect(second.dice[0]).toBe(first.dice[0]);
    expect(second.dice[2]).toBe(first.dice[2]);
    expect(second.spins[0]).toBe(1);
    expect(second.spins[2]).toBe(1);
    expect(second.draws).toBe(first.draws + 3);
  });

  test("a full identical action sequence is deterministic end to end", () => {
    const play = (): YachtState => {
      let g = roll(fresh("repeat"));
      g = toggleHold(g, 1);
      g = roll(g);
      g = roll(g);
      return g;
    };
    expect(play().dice).toEqual(play().dice);
  });

  test("rolling is blocked after three rolls", () => {
    let g = roll(roll(roll(fresh())));
    expect(g.rollsLeft).toBe(0);
    const before = g.dice.slice();
    g = roll(g);
    expect(g.rollsLeft).toBe(0);
    expect(g.dice).toEqual(before);
  });
});

describe("holding gates", () => {
  test("holding before the first roll is a no-op", () => {
    const before = fresh();
    expect(toggleHold(before, 0)).toBe(before);
  });

  test("out-of-range indices are ignored", () => {
    const rolled = roll(fresh());
    expect(toggleHold(rolled, 9)).toBe(rolled);
  });
});

describe("banking and turns", () => {
  test("banking before rolling is a no-op", () => {
    const before = fresh();
    expect(bank(before, "chance")).toBe(before);
  });

  test("banking a category ends the turn and resets the dice", () => {
    const next = bank(roll(fresh()), "chance");
    expect(next.sheet.scores.chance).toBeDefined();
    expect(next.phase).toBe("playing");
    expect(next.rollsLeft).toBe(MAX_ROLLS);
    expect(next.hasRolled).toBe(false);
    expect(next.held.every((h) => h === false)).toBe(true);
    expect(next.spins.every((s) => s === 0)).toBe(true);
    expect(next.lastBank?.category).toBe("chance");
  });

  test("banking all thirteen categories ends the game with recorded bests", () => {
    let g = fresh("full-game");
    for (const category of CATEGORIES) {
      g = bank(roll(g), category);
    }
    expect(g.phase).toBe("over");
    expect(typeof g.bestTotal).toBe("number");
    expect(g.bestTotal ?? 0).toBeGreaterThanOrEqual(grandTotal(g.sheet));
  });
});

describe("record book wiring", () => {
  function stub(): { storage: RecordStorage; store: Map<string, string> } {
    const store = new Map<string, string>();
    return {
      store,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
    };
  }

  test("higher scores improve; lower ones do not", () => {
    const book = createRecords(stub().storage);
    expect(book.submit({ total: 210, yacht: 50 }).improved).toContain("total");
    expect(book.submit({ total: 180 }).improved).not.toContain("total");
    expect(book.bestOf("total")).toBe(210);
  });

  test("bests persist through the storage round-trip", () => {
    const backing = stub();
    createRecords(backing.storage).submit({ total: 305, chance: 28 });
    const reopened = createRecords(backing.storage);
    expect(reopened.bestOf("total")).toBe(305);
    expect(reopened.bestOf("chance")).toBe(28);
  });
});
