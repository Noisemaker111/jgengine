import { describe, expect, test } from "bun:test";
import { createTalentTree } from "@jgengine/core/game/talents";

type Stat = "power" | "critChance";

describe("talent allocation", () => {
  test("allocates a rank and consumes a point", () => {
    const tree = createTalentTree<Stat>({
      points: 3,
      nodes: [{ id: "strike", maxRank: 3 }],
    });
    expect(tree.pointsAvailable()).toBe(3);
    const result = tree.allocate("strike");
    expect(result).toEqual({ ok: true });
    expect(tree.rank("strike")).toBe(1);
    expect(tree.pointsAvailable()).toBe(2);
    expect(tree.pointsSpent()).toBe(1);
  });

  test("fails on unknown node", () => {
    const tree = createTalentTree<Stat>({ points: 1, nodes: [] });
    expect(tree.canAllocate("ghost")).toEqual({ ok: false, reason: "unknown-node" });
    expect(tree.allocate("ghost")).toEqual({ ok: false, reason: "unknown-node" });
  });

  test("fails at max rank", () => {
    const tree = createTalentTree<Stat>({ points: 5, nodes: [{ id: "strike", maxRank: 1 }] });
    tree.allocate("strike");
    expect(tree.canAllocate("strike")).toEqual({ ok: false, reason: "max-rank" });
  });

  test("fails with no points available", () => {
    const tree = createTalentTree<Stat>({ points: 0, nodes: [{ id: "strike", maxRank: 3 }] });
    expect(tree.canAllocate("strike")).toEqual({ ok: false, reason: "no-points" });
  });

  test("grantPoints adds points and ignores non-positive amounts", () => {
    const tree = createTalentTree<Stat>({ points: 0, nodes: [{ id: "strike", maxRank: 3 }] });
    tree.grantPoints(2);
    expect(tree.pointsAvailable()).toBe(2);
    tree.grantPoints(0);
    tree.grantPoints(-5);
    expect(tree.pointsAvailable()).toBe(2);
  });
});

describe("talent requirements", () => {
  test("string requirement needs rank >= 1 on the prerequisite", () => {
    const tree = createTalentTree<Stat>({
      points: 5,
      nodes: [
        { id: "root", maxRank: 1 },
        { id: "child", maxRank: 1, requires: ["root"] },
      ],
    });
    expect(tree.canAllocate("child")).toEqual({ ok: false, reason: "requires" });
    tree.allocate("root");
    expect(tree.canAllocate("child")).toEqual({ ok: true });
  });

  test("object requirement needs a specific rank on the prerequisite", () => {
    const tree = createTalentTree<Stat>({
      points: 5,
      nodes: [
        { id: "root", maxRank: 3 },
        { id: "child", maxRank: 1, requires: [{ nodeId: "root", rank: 2 }] },
      ],
    });
    tree.allocate("root");
    expect(tree.canAllocate("child")).toEqual({ ok: false, reason: "requires" });
    tree.allocate("root");
    expect(tree.canAllocate("child")).toEqual({ ok: true });
  });
});

describe("talent branch point thresholds", () => {
  test("gates a node on cumulative points spent in its branch", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [
        { id: "a", branch: "fire", maxRank: 3 },
        { id: "b", branch: "fire", maxRank: 3 },
        { id: "capstone", branch: "fire", maxRank: 1, requiresPointsInBranch: 3 },
      ],
    });
    expect(tree.canAllocate("capstone")).toEqual({ ok: false, reason: "branch-points" });
    tree.allocate("a");
    tree.allocate("a");
    expect(tree.canAllocate("capstone")).toEqual({ ok: false, reason: "branch-points" });
    tree.allocate("b");
    expect(tree.canAllocate("capstone")).toEqual({ ok: true });
  });

  test("a node's own ranks do not count toward its own branch requirement", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [{ id: "solo", branch: "fire", maxRank: 5, requiresPointsInBranch: 1 }],
    });
    tree.hydrate({ points: 10, ranks: { solo: 1 } });
    expect(tree.pointsInBranch("fire")).toBe(1);
    expect(tree.canAllocate("solo")).toEqual({ ok: false, reason: "branch-points" });
  });

  test("branches are isolated from one another", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [
        { id: "a", branch: "fire", maxRank: 3 },
        { id: "b", branch: "ice", maxRank: 3 },
        { id: "capstone", branch: "fire", maxRank: 1, requiresPointsInBranch: 2 },
      ],
    });
    tree.allocate("b");
    tree.allocate("b");
    expect(tree.canAllocate("capstone")).toEqual({ ok: false, reason: "branch-points" });
    expect(tree.pointsInBranch("fire")).toBe(0);
    expect(tree.pointsInBranch("ice")).toBe(2);
  });

  test("nodes without a branch share the default branch", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [
        { id: "a", maxRank: 3 },
        { id: "b", maxRank: 3, requiresPointsInBranch: 1 },
      ],
    });
    expect(tree.canAllocate("b")).toEqual({ ok: false, reason: "branch-points" });
    tree.allocate("a");
    expect(tree.canAllocate("b")).toEqual({ ok: true });
    expect(tree.pointsInBranch("")).toBe(1);
  });
});

describe("talent resolved aggregation", () => {
  test("sums add modifiers scaled by rank across nodes", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [
        { id: "a", maxRank: 3, modifiersPerRank: { power: { add: 5 } } },
        { id: "b", maxRank: 3, modifiersPerRank: { power: { add: 2 } } },
      ],
    });
    tree.allocate("a");
    tree.allocate("a");
    tree.allocate("b");
    expect(tree.resolved().stats.power).toEqual({ add: 12 });
  });

  test("compounds multiply modifiers per rank", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [{ id: "a", maxRank: 3, modifiersPerRank: { critChance: { multiply: 1.1 } } }],
    });
    tree.allocate("a");
    tree.allocate("a");
    const multiply = tree.resolved().stats.critChance?.multiply ?? 0;
    expect(multiply).toBeCloseTo(1.1 * 1.1, 10);
  });

  test("combines add and multiply contributions from different nodes on the same stat", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [
        { id: "a", maxRank: 3, modifiersPerRank: { power: { add: 4 } } },
        { id: "b", maxRank: 3, modifiersPerRank: { power: { multiply: 1.2 } } },
      ],
    });
    tree.allocate("a");
    tree.allocate("b");
    expect(tree.resolved().stats.power).toEqual({ add: 4, multiply: 1.2 });
  });

  test("nodes at rank zero do not contribute", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [
        { id: "a", maxRank: 3, modifiersPerRank: { power: { add: 5 } } },
        { id: "b", maxRank: 3, modifiersPerRank: { power: { add: 2 } } },
      ],
    });
    tree.allocate("a");
    expect(tree.resolved().stats.power).toEqual({ add: 5 });
  });
});

describe("talent resolved caching", () => {
  test("returns the same reference across repeated calls with no changes", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [{ id: "a", maxRank: 3, modifiersPerRank: { power: { add: 5 } } }],
    });
    tree.allocate("a");
    const first = tree.resolved();
    const second = tree.resolved();
    expect(first).toBe(second);
  });

  test("invalidates the cache after a new allocation", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [{ id: "a", maxRank: 3, modifiersPerRank: { power: { add: 5 } } }],
    });
    tree.allocate("a");
    const first = tree.resolved();
    tree.allocate("a");
    const second = tree.resolved();
    expect(first).not.toBe(second);
    expect(second.stats.power).toEqual({ add: 10 });
  });

  test("invalidates the cache after reset", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [{ id: "a", maxRank: 3, modifiersPerRank: { power: { add: 5 } } }],
    });
    tree.allocate("a");
    const first = tree.resolved();
    tree.reset();
    const second = tree.resolved();
    expect(first).not.toBe(second);
    expect(second.stats.power).toBeUndefined();
  });

  test("invalidates the cache after hydrate", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [{ id: "a", maxRank: 3, modifiersPerRank: { power: { add: 5 } } }],
    });
    tree.allocate("a");
    const first = tree.resolved();
    tree.hydrate({ points: 0, ranks: { a: 3 } });
    const second = tree.resolved();
    expect(first).not.toBe(second);
    expect(second.stats.power).toEqual({ add: 15 });
  });
});

describe("talent abilities", () => {
  test("collects granted abilities from allocated nodes in definition order, deduplicated", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [
        { id: "a", maxRank: 2, grantsAbilities: ["fireball", "spark"] },
        { id: "b", maxRank: 2, grantsAbilities: ["spark", "nova"] },
      ],
    });
    tree.allocate("a");
    tree.allocate("b");
    expect(tree.resolved().abilities).toEqual(["fireball", "spark", "nova"]);
  });

  test("a node contributes its abilities once rank reaches 1, additional ranks do not duplicate", () => {
    const tree = createTalentTree<Stat>({
      points: 10,
      nodes: [{ id: "a", maxRank: 2, grantsAbilities: ["fireball"] }],
    });
    tree.allocate("a");
    tree.allocate("a");
    expect(tree.resolved().abilities).toEqual(["fireball"]);
  });
});

describe("talent reset", () => {
  test("refunds spent points and clears ranks", () => {
    const tree = createTalentTree<Stat>({
      points: 5,
      nodes: [{ id: "a", maxRank: 3 }],
    });
    tree.allocate("a");
    tree.allocate("a");
    expect(tree.pointsAvailable()).toBe(3);
    tree.reset();
    expect(tree.pointsAvailable()).toBe(5);
    expect(tree.pointsSpent()).toBe(0);
    expect(tree.rank("a")).toBe(0);
  });
});

describe("talent snapshot / hydrate", () => {
  test("round-trips points and ranks", () => {
    const tree = createTalentTree<Stat>({
      points: 5,
      nodes: [
        { id: "a", maxRank: 3 },
        { id: "b", maxRank: 3 },
      ],
    });
    tree.allocate("a");
    tree.allocate("a");
    tree.allocate("b");
    const snapshot = tree.snapshot();
    expect(snapshot).toEqual({ points: 2, ranks: { a: 2, b: 1 } });

    const other = createTalentTree<Stat>({
      points: 0,
      nodes: [
        { id: "a", maxRank: 3 },
        { id: "b", maxRank: 3 },
      ],
    });
    other.hydrate(snapshot);
    expect(other.pointsAvailable()).toBe(2);
    expect(other.rank("a")).toBe(2);
    expect(other.rank("b")).toBe(1);
  });

  test("clamps an out-of-range rank and drops unknown node ids", () => {
    const tree = createTalentTree<Stat>({
      points: 0,
      nodes: [{ id: "a", maxRank: 2 }],
    });
    tree.hydrate({ points: 3, ranks: { a: 99, ghost: 5 } });
    expect(tree.rank("a")).toBe(2);
    expect(tree.rank("ghost")).toBe(0);
    expect(tree.pointsAvailable()).toBe(3);
  });
});

describe("talent duplicate node definitions", () => {
  test("last definition wins for duplicate node ids", () => {
    const tree = createTalentTree<Stat>({
      points: 5,
      nodes: [
        { id: "a", maxRank: 1, modifiersPerRank: { power: { add: 1 } } },
        { id: "a", maxRank: 3, modifiersPerRank: { power: { add: 9 } } },
      ],
    });
    tree.allocate("a");
    tree.allocate("a");
    expect(tree.rank("a")).toBe(2);
    expect(tree.resolved().stats.power).toEqual({ add: 18 });
  });
});
