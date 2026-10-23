import { describe, expect, test } from "bun:test";

import { createStanding } from "@jgengine/core/progression/standing";
import { createUpgradeTree, type UpgradeNodeDef, type UpgradeState } from "@jgengine/core/progression/upgrades";

const STANDING = createStanding({
  tracks: [{ id: "yard" }],
  outcomes: [{ id: "escape", impacts: { yard: 10 } }],
});

const NODES: readonly UpgradeNodeDef[] = [
  { id: "engine", label: "Salvage V6", cost: { kind: "linear", base: 100, per: 50, round: "round" }, maxRank: 3 },
  { id: "frame", cost: { kind: "power", base: 80, exponent: 1.5, round: "ceil" }, requires: ["engine"] },
  { id: "armor", cost: { kind: "const", value: 400 }, standing: { trackId: "yard", min: 20 } },
];

function wallet(start: number): { pay: (cost: number) => boolean; left: () => number } {
  let money = start;
  return {
    pay(cost) {
      if (money < cost) return false;
      money -= cost;
      return true;
    },
    left: () => money,
  };
}

describe("upgrade tree", () => {
  test("each rank is priced by the node's curve", () => {
    const tree = createUpgradeTree({ nodes: NODES });
    expect(tree.costOf("engine", 1)).toBe(150);
    expect(tree.costOf("engine", 2)).toBe(200);
    expect(tree.costOf("engine", 3)).toBe(250);
    expect(tree.costOf("engine", 4)).toBeNull();
    expect(tree.costOf("frame", 1)).toBe(80);
    expect(tree.costOf("armor", 1)).toBe(400);
    expect(tree.costOf("missing")).toBeNull();
  });

  test("a purchase charges the curve price and raises the rank", () => {
    const tree = createUpgradeTree({ nodes: NODES });
    const money = wallet(1000);
    const bought = tree.buy("engine", "jon", money.pay);
    expect(bought).toEqual({ ok: true, nodeId: "engine", rank: 1, cost: 150 });
    expect(tree.rank("engine")).toBe(1);
    expect(money.left()).toBe(850);
    expect(tree.spendTotal()).toBe(150);
    expect(tree.costOf("engine")).toBe(200);
  });

  test("a rank the wallet cannot cover is refused and nothing moves", () => {
    const tree = createUpgradeTree({ nodes: NODES });
    const money = wallet(120);
    expect(tree.buy("engine", "jon", money.pay)).toEqual({ ok: false, reason: "insufficient-funds" });
    expect(tree.rank("engine")).toBe(0);
    expect(money.left()).toBe(120);
    expect(tree.spendTotal()).toBe(0);
  });

  test("prerequisites and standing gates are checked before any charge", () => {
    const tree = createUpgradeTree({ nodes: NODES, standing: STANDING });
    const money = wallet(5000);
    expect(tree.canBuy("frame", "jon")).toEqual({ ok: false, reason: "missing-prerequisites" });
    expect(tree.buy("armor", "jon", money.pay)).toEqual({ ok: false, reason: "standing" });
    expect(money.left()).toBe(5000);

    STANDING.adjust("jon", "yard", 20);
    expect(tree.buy("armor", "jon", money.pay)).toMatchObject({ ok: true, cost: 400 });
  });

  test("the rank cap refuses further purchases", () => {
    const tree = createUpgradeTree({ nodes: NODES });
    const money = wallet(5000);
    for (let index = 0; index < 3; index += 1) expect(tree.buy("engine", "jon", money.pay).ok).toBe(true);
    expect(tree.buy("engine", "jon", money.pay)).toEqual({ ok: false, reason: "max-rank" });
    expect(money.left()).toBe(5000 - (150 + 200 + 250));
  });

  test("snapshot and restore round-trip ranks and the spend total", () => {
    const tree = createUpgradeTree({ nodes: NODES });
    const money = wallet(5000);
    tree.buy("engine", "jon", money.pay);
    tree.buy("engine", "jon", money.pay);
    tree.buy("frame", "jon", money.pay);
    const state = JSON.parse(JSON.stringify(tree.snapshot())) as UpgradeState;

    const restored = createUpgradeTree({ nodes: NODES, state });
    expect(restored.snapshot()).toEqual(tree.snapshot());
    expect(restored.rank("engine")).toBe(2);
    expect(restored.rank("frame")).toBe(1);
    expect(restored.spendTotal()).toBe(tree.spendTotal());
  });

  test("authored nodes are checked at load", () => {
    expect(() => createUpgradeTree({ nodes: [{ id: "a", cost: { kind: "const", value: 1 } }, { id: "a", cost: { kind: "const", value: 1 } }] })).toThrow(
      /declared twice/,
    );
    expect(() => createUpgradeTree({ nodes: [{ id: "a", cost: { kind: "const", value: 1 }, requires: ["b"] }] })).toThrow(
      /requires unknown node "b"/,
    );
    expect(() => createUpgradeTree({ nodes: [{ id: "a", cost: { kind: "const", value: Number.NaN } }] })).toThrow(
      /cost at rank 1/,
    );
    expect(() => createUpgradeTree({ nodes: [{ id: "a", cost: { kind: "const", value: 1 }, maxRank: 0 }] })).toThrow(
      /maxRank/,
    );
    expect(() =>
      createUpgradeTree({ nodes: [{ id: "a", cost: { kind: "const", value: 1 }, standing: { trackId: "moon" } }], standing: STANDING }),
    ).toThrow(/unknown standing track "moon"/);
  });

  test("the same purchases produce the same tree", () => {
    const build = (): string => {
      const tree = createUpgradeTree({ nodes: NODES });
      const money = wallet(2000);
      tree.buy("engine", "jon", money.pay);
      tree.buy("engine", "jon", money.pay);
      tree.buy("frame", "jon", money.pay);
      return `${JSON.stringify(tree.snapshot())}:${tree.spendTotal()}`;
    };
    expect(build()).toBe(build());
  });
});
