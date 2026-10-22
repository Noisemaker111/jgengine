import { describe, expect, test } from "bun:test";

import { devtools } from "../devtools/devtools";
import { createStats } from "../stats/statModifiers";
import type { StatModifierSet } from "../stats/statModifiers";
import { defineXpCurve } from "./xpCurve";
import {
  assertSkillTreeConfig,
  createSkillTree,
  type SkillNodeDef,
  type SkillSynergyDef,
  type SkillTree,
} from "./skillTree";

// Test fixture only: a two-branch tree shaped to prove breadth beats depth. Games author their own.
const nodes: readonly SkillNodeDef[] = [
  { id: "strike", branch: "edge", maxRank: 3, passives: { damage: { add: 1 } } },
  {
    id: "guard",
    branch: "edge",
    requires: [{ nodeId: "strike", rank: 1 }],
    maxRank: 2,
    passives: { armor: { add: 2 } },
    actives: [{ id: "brace", cooldownMs: 6000 }],
  },
  {
    id: "momentum",
    branch: "edge",
    requires: [{ nodeId: "guard", rank: 1 }],
    maxRank: 3,
    passives: { speed: { add: 0.1 } },
  },
  { id: "focus", branch: "signal", maxRank: 2, passives: { crit: { add: 0.05 } } },
  {
    id: "sight",
    branch: "signal",
    requires: [{ nodeId: "focus", rank: 1 }],
    maxRank: 2,
    passives: { range: { add: 2 } },
    actives: [{ id: "mark", cooldownMs: 12000 }],
  },
  {
    id: "temper",
    branch: "signal",
    cost: 2,
    maxRank: 1,
    requires: [{ nodeId: "focus", rank: 1 }],
    passives: { damage: { multiply: 1.1 } },
  },
];

const synergies: readonly SkillSynergyDef[] = [
  {
    id: "overload",
    requires: [
      { nodeId: "strike", rank: 2 },
      { nodeId: "sight", rank: 1 },
    ],
    passives: { damage: { add: 2 }, crit: { add: 0.1 } },
    actives: [{ id: "overload", cooldownMs: 20000 }],
  },
];

const xp = defineXpCurve({ growth: "linear", step: 120, growthRate: 40, maxLevel: 30 });

function pointsAtLevel(level: number): number {
  return (level - xp.startLevel) * 1;
}

function build(ids: readonly string[], points: number): SkillTree {
  const tree = createSkillTree({ nodes, synergies, points });
  for (const id of ids) {
    const result = tree.spend(id);
    expect(result.ok).toBe(true);
  }
  expect(tree.pointsAvailable()).toBe(0);
  return tree;
}

function addOf(stats: StatModifierSet<string>, stat: string): number {
  return stats[stat]?.add ?? 0;
}

describe("skill tree data and legality", () => {
  test("prerequisites, cost, exclusivity and branch points each refuse with a named reason", () => {
    const tree = createSkillTree({ nodes, synergies, points: 1 });
    expect(tree.spend("sight")).toMatchObject({ ok: false, reason: "requires" });
    expect(tree.spend("nope")).toMatchObject({ ok: false, reason: "unknown-node" });

    expect(tree.spend("strike").ok).toBe(true);
    expect(tree.spend("strike")).toMatchObject({ ok: false, reason: "no-points" });
    expect(tree.pointsSpent()).toBe(1);

    const costed = createSkillTree({ nodes, synergies, points: 3 });
    costed.spend("focus");
    const spent = costed.spend("temper");
    expect(spent).toEqual({ ok: true, spent: 2, pointsAvailable: 0 });
    expect(costed.pointsSpent()).toBe(3);

    const exclusive = createSkillTree({
      nodes: [
        { id: "left", maxRank: 1, excludes: ["right"] },
        { id: "right", maxRank: 1 },
      ],
      points: 2,
    });
    expect(exclusive.spend("left").ok).toBe(true);
    expect(exclusive.spend("right")).toMatchObject({ ok: false, reason: "excluded" });

    const branchGated = createSkillTree({
      nodes: [
        { id: "a", branch: "one", maxRank: 3 },
        { id: "deep", branch: "one", requiresPointsInBranch: 2, maxRank: 1 },
      ],
      points: 3,
    });
    expect(branchGated.spend("deep")).toMatchObject({ ok: false, reason: "branch-points" });
    branchGated.spend("a");
    branchGated.spend("a");
    expect(branchGated.spend("deep").ok).toBe(true);
  });

  test("tree data is validated before play", () => {
    expect(() => assertSkillTreeConfig({
      nodes: [{ id: "a", maxRank: 1 }],
      synergies: [{ id: "solo", requires: [{ nodeId: "a" }] }],
    })).toThrow(/two different nodes/);
    expect(() => assertSkillTreeConfig({ nodes: [{ id: "a", maxRank: 1, requires: ["ghost"] as never }] })).toThrow(/unknown node/);
    expect(() => assertSkillTreeConfig({ nodes: [{ id: "a", cost: 0 }] })).toThrow(/cost/);
    expect(() => assertSkillTreeConfig({ nodes: [{ id: "a" }, { id: "a" }] })).toThrow(/declared twice/);
  });
});

describe("two builds at one level", () => {
  const level = 7;
  const points = pointsAtLevel(level);

  test("the same level and the same spent points produce different stats and actions", () => {
    const edge = build(["strike", "strike", "strike", "guard", "guard", "momentum"], points);
    const signal = build(["focus", "focus", "sight", "sight", "strike", "strike"], points);

    expect(xp.levelForXp(xp.totalXpFor(level)).level).toBe(level);
    expect(edge.pointsSpent()).toBe(points);
    expect(signal.pointsSpent()).toBe(points);

    const edgeOut = edge.resolved();
    const signalOut = signal.resolved();
    expect(edgeOut.stats).not.toEqual(signalOut.stats);
    expect(addOf(edgeOut.stats, "damage")).toBe(3);
    expect(addOf(edgeOut.stats, "armor")).toBe(4);
    expect(addOf(edgeOut.stats, "speed")).toBeCloseTo(0.1, 6);
    expect(edgeOut.activeIds).toEqual(["brace"]);
    expect(edgeOut.synergies).toEqual([]);

    expect(addOf(signalOut.stats, "damage")).toBe(4);
    expect(addOf(signalOut.stats, "crit")).toBeCloseTo(0.2, 6);
    expect(addOf(signalOut.stats, "range")).toBe(4);
    expect(signalOut.activeIds).toEqual(["mark", "overload"]);
    expect(signalOut.synergies).toEqual(["overload"]);
  });

  test("a synergy build beats the same points spent down one branch", () => {
    const both = build(["strike", "strike", "focus", "sight"], 4);
    const one = build(["strike", "strike", "strike", "guard"], 4);

    expect(both.pointsSpent()).toBe(one.pointsSpent());
    const bothOut = both.resolved();
    const oneOut = one.resolved();
    expect(addOf(bothOut.stats, "damage")).toBeGreaterThan(addOf(oneOut.stats, "damage"));
    expect(addOf(bothOut.stats, "damage")).toBe(4);
    expect(addOf(oneOut.stats, "damage")).toBe(3);
    expect(bothOut.activeIds).toContain("overload");
    expect(oneOut.activeIds).not.toContain("overload");
  });

  test("a spent tree changes computed stats through the shared stat block", () => {
    const tree = build(["strike", "strike"], 2);
    const stats = createStats({ damage: 10, armor: 5 });
    stats.addSource("tree", tree.resolved().stats);
    expect(stats.get("damage")).toBe(12);
    stats.removeSource("tree");
    expect(stats.get("damage")).toBe(10);
  });
});

describe("respec and persistence", () => {
  test("respec refunds exactly the points spent and clears the tree", () => {
    const tree = build(["strike", "strike", "focus", "temper"], 5);
    expect(tree.pointsSpent()).toBe(5);

    const result = tree.respec();
    expect(result).toEqual({ refunded: 5, pointsAvailable: 5 });
    expect(tree.pointsSpent()).toBe(0);
    expect(tree.pointsAvailable()).toBe(5);
    expect(tree.resolved()).toMatchObject({ stats: {}, actives: [], synergies: [], ranks: {} });
  });

  test("snapshot survives JSON and restores the same build", () => {
    const tree = build(["strike", "strike", "focus", "sight"], 4);
    const saved = JSON.parse(JSON.stringify(tree.snapshot()));
    const restored = createSkillTree({ nodes, synergies });
    expect(restored.restore(saved)).toBe(true);
    expect(restored.snapshot()).toEqual(tree.snapshot());
    expect(restored.resolved()).toEqual(tree.resolved());
  });

  test("restore refuses malformed state without changing the tree", () => {
    const tree = build(["strike"], 1);
    const before = tree.snapshot();
    expect(tree.restore({ points: 1, ranks: { ghost: 1 } })).toBe(false);
    expect(tree.restore({ points: 1, ranks: { strike: 9 } })).toBe(false);
    expect(tree.restore({ points: -1, ranks: {} })).toBe(false);
    expect(tree.snapshot()).toEqual(before);
  });

  test("the devtools probe reports points, ranks and live synergies", () => {
    const tree = createSkillTree({ nodes, synergies, points: 4 }, { devtoolsName: "test.skillTree" });
    tree.spend("strike");
    tree.spend("strike");
    const probe = devtools.probes.read()["test.skillTree"] as Record<string, unknown>;
    expect(probe).toMatchObject({ pointsAvailable: 2, pointsSpent: 2, ranks: { strike: 2 }, synergies: [] });
    tree.dispose();
    expect(devtools.probes.read()["test.skillTree"]).toBeUndefined();
  });
});
