import { describe, expect, test } from "bun:test";
import { createTalentTree, type TalentNodeDef } from "@jgengine/core/game/talents";
import { talentTreeView, talentTreeViewFrom } from "@jgengine/core/game/talentTreeView";

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

describe("talentTreeViewFrom (any unlock rule)", () => {
  test("drives layout/state/edges from a caller-supplied status — no point model", () => {
    // A money-gated upgrade tree: a node is unlocked (rank 1) once its cash threshold is passed and
    // its prerequisite is unlocked; nothing here spends talent points.
    const cost: Record<string, number> = { root: 50, mid: 120, capstone: 300 };
    const unlocked = new Set<string>(["root"]);
    const gold = 150;

    const view = talentTreeViewFrom(nodes, (node) => {
      const has = unlocked.has(node.id);
      const prereqMet = (node.requires ?? []).every((r) => unlocked.has(typeof r === "string" ? r : r.nodeId));
      return { rank: has ? 1 : 0, allocatable: !has && prereqMet && gold >= (cost[node.id] ?? 0) };
    });
    const node = (id: string) => view.nodes.find((n) => n.id === id)!;

    // root unlocked → learned; mid affordable + prereq met → available & allocatable; capstone locked.
    expect(node("root").state).toBe("learned");
    expect(node("mid").state).toBe("available");
    expect(node("mid").allocatable).toBe(true);
    expect(node("mid").requires[0]).toEqual({ from: "root", rank: 1, met: true });
    expect(node("capstone").state).toBe("locked");
    expect(node("capstone").allocatable).toBe(false);
    // Same topology as the point-spend path.
    expect(view.tiers).toBe(3);
    expect(view.branches).toEqual(["fire", "ice"]);
  });

  test("gates allocatable independently of state — affordability can withhold an available node", () => {
    // Broke: prerequisite met so mid is 'available', but the game's rule says not allocatable yet.
    const unlocked = new Set<string>(["root"]);
    const view = talentTreeViewFrom(nodes, (node) => ({
      rank: unlocked.has(node.id) ? 1 : 0,
      allocatable: false, // e.g. not enough cash for anything
    }));
    const mid = view.nodes.find((n) => n.id === "mid")!;
    expect(mid.state).toBe("available"); // prereq (root rank 1) met
    expect(mid.allocatable).toBe(false); // but the game withholds it
  });

  test("defaults point totals to zero when omitted", () => {
    const view = talentTreeViewFrom(nodes, () => ({ rank: 0, allocatable: false }));
    expect(view.pointsAvailable).toBe(0);
    expect(view.pointsSpent).toBe(0);
  });

  test("point-spend talentTreeView matches an equivalent talentTreeViewFrom", () => {
    const tree = createTalentTree<Stat>({ points: 4, nodes });
    tree.allocate("root");
    const adapter = talentTreeView(nodes, tree);
    const manual = talentTreeViewFrom(
      nodes,
      (node) => ({ rank: tree.rank(node.id), allocatable: tree.canAllocate(node.id).ok }),
      { pointsAvailable: tree.pointsAvailable(), pointsSpent: tree.pointsSpent() },
    );
    expect(manual).toEqual(adapter);
  });
});
