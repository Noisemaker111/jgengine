import { describe, expect, test } from "bun:test";

import {
  cloneSnapshot,
  replayCombat,
  serializeBoard,
  type BoardSnapshot,
  type CombatRules,
} from "./combatSnapshot";

const RULES: CombatRules = { attackStat: "atk", healthStat: "hp" };

function board(ownerId: string, units: Array<[string, number, number]>, seed = 1): BoardSnapshot {
  return serializeBoard({
    ownerId,
    seed,
    units: units.map(([id, atk, hp]) => ({ id, stats: { atk, hp } })),
  });
}

describe("serializeBoard snapshot", () => {
  test("captures a deep copy that later board mutation cannot change", () => {
    const source = { atk: 3, hp: 10 };
    const snapshot = serializeBoard({ ownerId: "p1", units: [{ id: "u1", stats: source }] });
    source.atk = 999;
    expect(snapshot.units[0]!.stats.atk).toBe(3);
  });

  test("cloneSnapshot round-trips to an equal but independent value", () => {
    const original = board("p1", [["u1", 3, 10]], 42);
    const copy = cloneSnapshot(original);
    expect(copy).toEqual(original);
    expect(copy.units).not.toBe(original.units);
  });
});

describe("replayCombat determinism and parity", () => {
  test("replaying the same snapshots twice yields identical results", () => {
    const a = board("p1", [["knight", 3, 10], ["archer", 2, 6]], 7);
    const b = board("p2", [["ogre", 4, 12]], 99);

    const first = replayCombat(a, b, RULES);
    const second = replayCombat(cloneSnapshot(a), cloneSnapshot(b), RULES);
    expect(second).toEqual(first);
  });

  test("a stronger recorded board beats a live opponent deterministically", () => {
    const strong = board("p1", [["a1", 5, 20], ["a2", 5, 20]]);
    const weak = board("p2", [["b1", 2, 5]]);
    const result = replayCombat(strong, weak, RULES);
    expect(result.winner).toBe("a");
    expect(result.survivorsA.length).toBeGreaterThan(0);
    expect(result.survivorsB.length).toBe(0);
  });

  test("the board that strikes first wins a mirror match (deterministic initiative)", () => {
    const a = board("p1", [["a1", 5, 5]]);
    const b = board("p2", [["b1", 5, 5]]);
    const result = replayCombat(a, b, RULES);
    expect(result.winner).toBe("a");
    expect(result.survivorsB).toEqual([]);
  });

  test("crit chance is seed-driven, so a fixed seed replays the same crits", () => {
    const rules: CombatRules = { ...RULES, critChance: 0.5, critMultiplier: 3, maxRounds: 50 };
    const a = board("p1", [["a1", 2, 30]], 12345);
    const b = board("p2", [["b1", 2, 30]], 6789);
    const first = replayCombat(a, b, rules);
    const second = replayCombat(a, b, rules);
    expect(first.blows.map((x) => x.crit)).toEqual(second.blows.map((x) => x.crit));
  });

  test("maxRounds bounds an unkillable stalemate", () => {
    const a = board("p1", [["a1", 0, 10]]);
    const b = board("p2", [["b1", 0, 10]]);
    const result = replayCombat(a, b, { ...RULES, maxRounds: 5 });
    expect(result.rounds).toBe(5);
    expect(result.winner).toBe("draw");
  });
});
