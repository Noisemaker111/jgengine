import { describe, expect, test } from "bun:test";

import {
  assignFightIntents,
  compositionForIntents,
  type FighterState,
  type FightIntent,
} from "@jgengine/core/ai/director/roles";

const threat = [20, 0, 0] as const;

function fighter(id: string, x: number, z: number, health = 1, underFire = false): FighterState {
  return underFire ? { id, position: [x, 0, z], health, underFire } : { id, position: [x, 0, z], health };
}

const line = [fighter("a", 0, 0), fighter("b", 2, 0), fighter("c", 0, -2), fighter("d", 2, -2)];

describe("fight intents", () => {
  test("a squad facing an enemy holds one, flanks one and covers with the rest", () => {
    const orders = assignFightIntents({ fighters: line, threat });
    expect(orders.counts.hold).toBe(1);
    expect(orders.counts.flank).toBe(1);
    expect(orders.counts.cover).toBe(2);
    expect(orders.intents.size).toBe(4);
  });

  test("the anchor is the fighter nearest the squad's centre, the flanker the one furthest out", () => {
    const orders = assignFightIntents({ fighters: line, threat });
    const hold = [...orders.intents].find(([, intent]) => intent === "hold")?.[0];
    const flank = [...orders.intents].find(([, intent]) => intent === "flank")?.[0];
    // Centre of the diamond is (1, -1): b (2,0) and c (0,-2) tie on 1.41; id order breaks it.
    expect(hold).toBe("b");
    // a and d sit at the same lateral distance, so the first flanker is the id-lowest.
    expect(flank).toBe("a");
  });

  test("a wounded fighter falls back instead of holding or flanking", () => {
    const orders = assignFightIntents({
      fighters: [fighter("a", 0, 0, 0.2), fighter("b", 2, 0), fighter("c", 0, -2), fighter("d", 2, -2)],
      threat,
    });
    expect(orders.intents.get("a")).toBe("retreat");
    expect(orders.counts.retreat).toBe(1);
    expect(orders.counts.hold).toBe(1);
    expect([...orders.intents.values()].reduce((sum) => sum + 1, 0)).toBe(4);
  });

  test("a fighter under fire takes cover rather than a flank", () => {
    const orders = assignFightIntents({
      fighters: [fighter("a", -6, 0, 1, true), fighter("b", 2, 0), fighter("c", 0, -2), fighter("d", 2, -2)],
      threat,
    });
    expect(orders.intents.get("a")).toBe("cover");
    const flankers = [...orders.intents].filter(([, intent]) => intent === "flank").map(([id]) => id);
    expect(flankers).not.toContain("a");
  });

  test("with no known enemy the squad advances", () => {
    const orders = assignFightIntents({ fighters: line, threat: null });
    expect(orders.counts.assault).toBe(4);
    expect(orders.counts.hold).toBe(0);
    expect(orders.counts.flank).toBe(0);
  });

  test("two fighters hold and cover; flanking needs a third", () => {
    const orders = assignFightIntents({ fighters: [fighter("a", 0, 0), fighter("b", 2, 0)], threat });
    expect(orders.counts.flank).toBe(0);
    expect(orders.counts.hold).toBe(1);
    expect(orders.counts.cover).toBe(1);
  });

  test("the same squad state gives the same orders in any input order", () => {
    const forward = assignFightIntents({ fighters: line, threat });
    const reversed = assignFightIntents({ fighters: [...line].reverse(), threat });
    expect([...forward.intents.entries()].sort()).toEqual([...reversed.intents.entries()].sort());
    expect(reversed.counts).toEqual(forward.counts);
  });

  test("a large squad puts a third of its fighters on a flank, on both shoulders", () => {
    const squad = [
      fighter("a", 0, -6),
      fighter("b", 0, 6),
      fighter("c", 0, -4),
      fighter("d", 0, 4),
      fighter("e", 0, -2),
      fighter("f", 0, 2),
      fighter("g", 0, 0),
    ];
    const orders = assignFightIntents({ fighters: squad, threat });
    expect(orders.counts.flank).toBeGreaterThanOrEqual(2);
    const flankers = [...orders.intents].filter(([, intent]) => intent === "flank").map(([id]) => id);
    const sides = flankers.map((id) => Math.sign(squad.find((f) => f.id === id)!.position[2]));
    expect(new Set(sides).size).toBe(2);
  });

  test("duties become a squad composition in member order", () => {
    const intents = new Map<string, FightIntent>([
      ["a", "flank"],
      ["b", "hold"],
    ]);
    const composition = compositionForIntents(["b", "a"], intents, (intent) => ({
      id: intent,
      ...(intent === "flank" ? { flankAngle: 0.9 } : {}),
    }));
    expect(composition.roles.map((role) => role.id)).toEqual(["hold", "flank"]);
    expect(composition.roles[1]!.flankAngle).toBe(0.9);
    expect(composition.roles.every((role) => role.count === 1)).toBe(true);
  });
});
