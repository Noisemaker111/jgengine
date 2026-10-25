import { describe, expect, test } from "bun:test";

import { upgradeOptions, upgradePathActions, upgradePathFacts, upgradeProgress, upgradeStepAction, type UpgradePathsDecl } from "./upgradePaths";
import { createWorldModel, defineWorldModel } from "./worldModel";

const ladder: UpgradePathsDecl = {
  kind: "archer",
  trunk: [
    { label: "Fletching", cost: { "keep.gold": -40 }, effect: { damage: 4 } },
    { label: "Barbed tips", cost: { "keep.gold": -80 }, effect: { damage: 6 } },
  ],
  branches: [
    {
      id: "longbow",
      label: "Longbow",
      steps: [
        { label: "Marksmen", detail: "Range +3", cost: { "keep.gold": -150 }, effect: { range: 3 } },
        { label: "Headhunters", cost: { "keep.gold": -250 }, effect: { damage: 30 } },
      ],
    },
    {
      id: "volley",
      label: "Volley",
      steps: [{ label: "Rangers", cost: { "keep.gold": -140 }, effect: { shots: 2 } }],
    },
  ],
};

function keep(gold = 2000) {
  const def = defineWorldModel({
    factions: { keep: { facts: { gold } } },
    slots: { plot: { a: { position: [0, 0] }, b: { position: [5, 0] } } },
    kinds: {
      archer: {
        label: "Archer",
        slot: "plot",
        cost: { "keep.gold": -50 },
        refund: 0.5,
        facts: { damage: 8, range: 8, shots: 1, ...upgradePathFacts(ladder) },
      },
    },
    actions: upgradePathActions(ladder),
  });
  const world = createWorldModel(def);
  world.place("archer", { slot: "a" });
  return world;
}

const trunk = (n: number) => upgradeStepAction("archer", null, n);
const step = (branch: string, n: number) => upgradeStepAction("archer", branch, n);

describe("upgrade paths", () => {
  test("the trunk climbs in order and a step out of order is refused with the step it needs", () => {
    const world = keep();
    expect(world.canAct(trunk(2), "archer-1")?.message).toBe("Needs Fletching first");
    expect(world.act(trunk(1), "archer-1").ok).toBe(true);
    expect(world.num("archer-1.damage")).toBe(12);
    expect(world.canAct(trunk(1), "archer-1")?.reason).toBe("locked");
    expect(world.act(trunk(2), "archer-1").ok).toBe(true);
    expect(world.num("archer-1.damage")).toBe(18);
    expect(world.num("keep.gold")).toBe(2000 - 50 - 40 - 80);
  });

  test("branches open only after the trunk, and taking one closes the other", () => {
    const world = keep();
    expect(world.canAct(step("longbow", 1), "archer-1")?.message).toBe("Opens after Barbed tips, one path only");
    world.act(trunk(1), "archer-1");
    world.act(trunk(2), "archer-1");
    expect(upgradeOptions(world, ladder, "archer-1").map((option) => option.label)).toEqual(["Marksmen", "Rangers"]);
    expect(world.act(step("longbow", 1), "archer-1").ok).toBe(true);
    expect(world.fact("archer-1.branch")).toBe("longbow");
    expect(world.num("archer-1.range")).toBe(11);
    expect(world.canAct(step("volley", 1), "archer-1")?.reason).toBe("locked");
    expect(upgradeOptions(world, ladder, "archer-1").map((option) => option.action)).toEqual([step("longbow", 2)]);
    expect(world.act(step("longbow", 2), "archer-1").ok).toBe(true);
    expect(upgradeOptions(world, ladder, "archer-1")).toEqual([]);
    expect(upgradeProgress(world, ladder, "archer-1")).toEqual({ tier: 2, branch: "longbow", branchTier: 2, complete: true });
  });

  test("options carry the world's price and its refusal when the purse is short", () => {
    const world = keep(100);
    const [next] = upgradeOptions(world, ladder, "archer-1");
    expect(next).toMatchObject({ action: trunk(1), branch: null, step: 1, label: "Fletching", cost: { "keep.gold": -40 } });
    expect(next!.refusal).toBeNull();
    world.act(trunk(1), "archer-1");
    expect(upgradeOptions(world, ladder, "archer-1")[0]!.refusal?.reason).toBe("cost");
  });

  test("two instances climb separately, and a sale refunds a share of every step it took", () => {
    const world = keep(1000);
    world.place("archer", { slot: "b" });
    world.act(trunk(1), "archer-1");
    expect(upgradeProgress(world, ladder, "archer-2").tier).toBe(0);
    const before = world.num("keep.gold");
    world.remove("archer-1");
    expect(world.num("keep.gold")).toBe(before + (50 + 40) * 0.5);
  });

  test("custom fact names and a lone ladder with no branches", () => {
    const lone: UpgradePathsDecl = { kind: "ride", trunk: [{ label: "Paint", cost: {} }], facts: { tier: "level" } };
    const def = defineWorldModel({
      factions: { park: { facts: { cash: 0 } } },
      kinds: { ride: { label: "Ride", facts: { ...upgradePathFacts(lone) } } },
      actions: upgradePathActions(lone),
    });
    const world = createWorldModel(def);
    world.place("ride");
    expect(world.act(upgradeStepAction("ride", null, 1), "ride-1").ok).toBe(true);
    expect(world.num("ride-1.level")).toBe(1);
    expect(upgradeProgress(world, lone, "ride-1").complete).toBe(true);
  });

  test("a duplicate or reserved branch id fails at declaration", () => {
    expect(() => upgradePathActions({ kind: "x", branches: [{ id: "a", label: "A", steps: [] }, { id: "a", label: "A", steps: [] }] })).toThrow(/twice/);
    expect(() => upgradePathActions({ kind: "x", branches: [{ id: "trunk", label: "T", steps: [] }] })).toThrow(/reserved/);
  });
});
