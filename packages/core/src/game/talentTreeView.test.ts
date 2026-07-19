import { describe, expect, test } from "bun:test";
import { createTalentTree, type TalentNodeDef } from "@jgengine/core/game/talents";
import { talentTreeView } from "@jgengine/core/game/talentTreeView";

type Stat = "power" | "critChance";

const nodes: TalentNodeDef<Stat>[] = [
  { id: "root", branch: "fire", maxRank: 2 },
  { id: "mid", branch: "fire", maxRank: 3, requires: ["root"] },
  { id: "capstone", branch: "fire", maxRank: 1, requires: [{ nodeId: "mid", rank: 2 }] },
  { id: "chill", branch: "ice", maxRank: 1 },
];

describe("talentTreeView layout", () => {
  test("assigns tiers by prerequisite depth and lists branches in definition order", () => {
    const tree = createTalentTree<Stat>({ points: 5, nodes });
    const view = talentTreeView(nodes, tree);
    const tierOf = (id: string) => view.nodes.find((n) => n.id === id)!.tier;
    expect(tierOf("root")).toBe(0);
    expect(tierOf("mid")).toBe(1);
    expect(tierOf("capstone")).toBe(2);
    expect(tierOf("chill")).toBe(0);
    expect(view.tiers).toBe(3);
    expect(view.branches).toEqual(["fire", "ice"]);
  });

  test("empty tree reports zero tiers and no branches", () => {
    const tree = createTalentTree<Stat>({ points: 0, nodes: [] });
    const view = talentTreeView([], tree);
    expect(view.tiers).toBe(0);
    expect(view.branches).toEqual([]);
    expect(view.nodes).toEqual([]);
  });
});

describe("talentTreeView node state", () => {
  test("derives locked/available/learned/maxed and allocatable from the live tree", () => {
    const tree = createTalentTree<Stat>({ points: 5, nodes });
    let view = talentTreeView(nodes, tree);
    const node = (id: string) => view.nodes.find((n) => n.id === id)!;

    // Fresh tree: root is available (no prereqs), mid/capstone locked, chill available.
    expect(node("root").state).toBe("available");
    expect(node("root").allocatable).toBe(true);
    expect(node("mid").state).toBe("locked");
    expect(node("mid").allocatable).toBe(false);
    expect(node("capstone").state).toBe("locked");

    tree.allocate("root");
    view = talentTreeView(nodes, tree);
    // root now learned (1/2), mid unlocked → available.
    expect(node("root").state).toBe("learned");
    expect(node("mid").state).toBe("available");
    expect(node("mid").requires[0]).toEqual({ from: "root", rank: 1, met: true });

    tree.allocate("root");
    view = talentTreeView(nodes, tree);
    expect(node("root").state).toBe("maxed");
    expect(node("root").allocatable).toBe(false);
  });

  test("reports prerequisite edges with unmet ranks", () => {
    const tree = createTalentTree<Stat>({ points: 1, nodes });
    tree.allocate("root");
    tree.allocate("mid");
    const view = talentTreeView(nodes, tree);
    const capstone = view.nodes.find((n) => n.id === "capstone")!;
    // capstone requires mid rank 2, but mid is only rank 1 → edge unmet, node locked.
    expect(capstone.requires[0]).toEqual({ from: "mid", rank: 2, met: false });
    expect(capstone.state).toBe("locked");
  });

  test("tracks point totals from the tree", () => {
    const tree = createTalentTree<Stat>({ points: 4, nodes });
    tree.allocate("root");
    const view = talentTreeView(nodes, tree);
    expect(view.pointsSpent).toBe(1);
    expect(view.pointsAvailable).toBe(3);
  });
});
