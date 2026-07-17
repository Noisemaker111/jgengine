import { describe, expect, test } from "bun:test";
import {
  createStatGraph,
  statModifierContributions,
  type StatGraphDef,
} from "@jgengine/core/progression/statGraph";
import { createTalentTree } from "@jgengine/core/game/talents";
import { balance, charge, createEmptyWallet, grant, type WalletState } from "@jgengine/core/economy/wallet";

describe("stat graph — core seam", () => {
  test("resolves derived formulas over named inputs", () => {
    const graph = createStatGraph({
      inputs: [{ id: "str", base: 10 }],
      derived: [{ id: "power", deps: ["str"], compute: (c) => c.value("str") * 2 }],
    });
    const sheet = graph.create();
    expect(sheet.get("str")).toBe(10);
    expect(sheet.get("power")).toBe(20);
  });

  test("folds add, mul, override, and clamp contributions in a stable canonical order", () => {
    const graph = createStatGraph({ inputs: [{ id: "hp", base: 100 }] });
    const sheet = graph.create();
    // Registered out of fold order; canonical order is override → add → mul → clampMin → clampMax.
    sheet.addSource("cap", { hp: { source: "cap", op: "clampMax", value: 250 } });
    sheet.addSource("haste", { hp: { source: "haste", op: "mul", value: 2 } });
    sheet.addSource("gear", { hp: { source: "gear", op: "add", value: 50 } });
    // (100 + 50) * 2 = 300, then clampMax 250.
    expect(sheet.get("hp")).toBe(250);
  });

  test("bounds clamp and round the resolved value", () => {
    const graph = createStatGraph({
      inputs: [{ id: "x", base: 3 }],
      derived: [{ id: "y", deps: ["x"], min: 0, max: 10, round: "floor", compute: (c) => c.value("x") * 2.7 }],
    });
    expect(graph.create().get("y")).toBe(8); // floor(8.1)
    expect(graph.create({ x: 100 }).get("y")).toBe(10); // clamped to max
  });

  test("conditional modifiers are just branches inside the formula", () => {
    const graph = createStatGraph({
      inputs: [{ id: "rage", base: 0 }, { id: "power", base: 10 }],
      derived: [
        {
          id: "damage",
          deps: ["rage", "power"],
          compute: (c) => {
            const enraged = c.value("rage") >= 50;
            return [
              { source: "base", op: "add", value: c.value("power") },
              ...(enraged ? [{ source: "enrage", op: "mul" as const, value: 1.5 }] : []),
            ];
          },
        },
      ],
    });
    expect(graph.create({ rage: 10 }).get("damage")).toBe(10);
    expect(graph.create({ rage: 80 }).get("damage")).toBe(15);
  });

  test("detects dependency cycles at build time", () => {
    const def: StatGraphDef = {
      inputs: [],
      derived: [
        { id: "a", deps: ["b"], compute: (c) => c.value("b") },
        { id: "b", deps: ["a"], compute: (c) => c.value("a") },
      ],
    };
    expect(() => createStatGraph(def)).toThrow(/cycle/);
  });

  test("rejects reads of undeclared dependencies", () => {
    const graph = createStatGraph({
      inputs: [{ id: "a", base: 1 }, { id: "b", base: 2 }],
      derived: [{ id: "c", deps: ["a"], compute: (ctx) => ctx.value("b") }],
    });
    expect(() => graph.create().get("c")).toThrow(/undeclared dependency/);
  });

  test("explain() traces provenance so a HUD can answer 'why is this 42?'", () => {
    const graph = createStatGraph({
      inputs: [{ id: "int", base: 20 }],
      derived: [{ id: "spellPower", deps: ["int"], compute: (c) => c.value("int") }],
    });
    const sheet = graph.create();
    sheet.addSource("staff", { spellPower: { source: "staff", op: "add", value: 12 } });
    sheet.addSource("blessing", { spellPower: { source: "blessing", op: "add", value: 10 } });
    const trace = sheet.explain("spellPower");
    expect(trace.value).toBe(42);
    expect(trace.steps.map((s) => [s.source, s.subtotal])).toEqual([
      ["formula", 20],
      ["staff", 32],
      ["blessing", 42],
    ]);
  });

  test("preview() resolves a proposed allocation without committing it", () => {
    const graph = createStatGraph({
      inputs: [{ id: "str", base: 10 }],
      derived: [{ id: "attackPower", deps: ["str"], compute: (c) => c.value("str") }],
    });
    const sheet = graph.create();
    const previewed = sheet.preview((draft) => draft.setBase("str", 15));
    expect(previewed.attackPower).toBe(15);
    // Original sheet is untouched.
    expect(sheet.get("attackPower")).toBe(10);
  });

  test("selective recompute: only downstream stats change when an input changes", () => {
    let computeCount = 0;
    const graph = createStatGraph({
      inputs: [{ id: "str", base: 10 }, { id: "int", base: 10 }],
      derived: [
        { id: "attackPower", deps: ["str"], compute: (c) => c.value("str") },
        {
          id: "spellPower",
          deps: ["int"],
          compute: (c) => {
            computeCount += 1;
            return c.value("int");
          },
        },
      ],
    });
    const sheet = graph.create();
    expect(sheet.get("spellPower")).toBe(10);
    expect(computeCount).toBe(1);
    sheet.setBase("str", 99); // unrelated to spellPower
    expect(sheet.get("attackPower")).toBe(99);
    expect(sheet.get("spellPower")).toBe(10);
    expect(computeCount).toBe(1); // spellPower was not recomputed
  });

  test("serialize round-trips base values and modifier sources", () => {
    const graph = createStatGraph({
      inputs: [{ id: "str", base: 5 }],
      derived: [{ id: "attackPower", deps: ["str"], compute: (c) => c.value("str") * 2 }],
    });
    const sheet = graph.create();
    sheet.setBase("str", 12);
    sheet.addSource("buff", { attackPower: { source: "buff", op: "add", value: 7 } });

    const json = JSON.parse(JSON.stringify(sheet.toJSON()));
    const restored = graph.restore(json);
    expect(restored.values()).toEqual(sheet.values());
    expect(restored.get("attackPower")).toBe(31); // 12*2 + 7
  });

  test("determinism: identical graphs and state yield identical values", () => {
    const def: StatGraphDef = {
      inputs: [{ id: "a", base: 3 }, { id: "b", base: 4 }],
      derived: [{ id: "c", deps: ["a", "b"], compute: (ctx) => ctx.value("a") * ctx.value("b") }],
    };
    const one = createStatGraph(def).create({ a: 7 });
    const two = createStatGraph(def).create({ a: 7 });
    expect(one.values()).toEqual(two.values());
  });
});

describe("stat graph — first adopters (issue #914)", () => {
  // Adopter 1: a hero-style attribute mapping. STR/AGI/INT drive combat outputs,
  // reproducing claudecraft's constants (ATTACK_POWER_PER_STR=1, HP_PER_STA=10, SPELL_POWER_PER_INT=0.5).
  const heroGraph = createStatGraph({
    inputs: [
      { id: "str", base: 0, min: 0 },
      { id: "agi", base: 0, min: 0 },
      { id: "sta", base: 0, min: 0 },
      { id: "int", base: 0, min: 0 },
    ],
    derived: [
      { id: "attackPower", deps: ["str", "agi"], round: "floor", compute: (c) => c.value("str") * 1 + Math.floor(c.value("agi") / 2) },
      { id: "maxHp", deps: ["sta"], compute: (c) => 100 + c.value("sta") * 10 },
      { id: "spellPower", deps: ["int"], compute: (c) => c.value("int") * 0.5 },
      { id: "critPct", deps: ["agi"], compute: (c) => 5 + c.value("agi") * 0.05 },
    ],
  });

  test("hero mapping derives combat stats and explains a buffed value", () => {
    const sheet = heroGraph.create({ str: 20, agi: 30, sta: 40, int: 10 });
    expect(sheet.get("attackPower")).toBe(35); // 20 + floor(30/2)
    expect(sheet.get("maxHp")).toBe(500); // 100 + 40*10
    expect(sheet.get("spellPower")).toBe(5); // 10*0.5

    sheet.addSource("mightBuff", { str: { source: "mightBuff", op: "add", value: 10 } });
    expect(sheet.get("attackPower")).toBe(45); // buffed STR flows into attackPower
    const trace = sheet.explain("str");
    expect(trace.steps.some((s) => s.source === "mightBuff")).toBe(true);
  });

  // Adopter 2: a Fallout-style NONCOMBAT Intelligence mapping. The SAME input id "int"
  // drives XP gain, crafting yield, dialogue access, and settlement productivity — and NO
  // combat output. Proves the engine privileges no single semantic for an input id.
  const wastelandGraph = createStatGraph({
    inputs: [{ id: "int", base: 1, min: 1, max: 10 }],
    derived: [
      { id: "xpGainMult", deps: ["int"], compute: (c) => 1 + c.value("int") * 0.03 },
      { id: "craftingYield", deps: ["int"], round: "floor", compute: (c) => 1 + c.value("int") / 4 },
      { id: "dialogueAccess", deps: ["int"], compute: (c) => (c.value("int") >= 7 ? 1 : 0) },
      { id: "settlementProductivity", deps: ["int"], compute: (c) => c.value("int") * 5 },
    ],
  });

  test("noncombat intelligence mapping: same id, radically different outputs, no combat stat", () => {
    const dim = wastelandGraph.create({ int: 3 });
    expect(dim.get("xpGainMult")).toBeCloseTo(1.09);
    expect(dim.get("craftingYield")).toBe(1);
    expect(dim.get("dialogueAccess")).toBe(0);
    expect(dim.get("settlementProductivity")).toBe(15);

    const bright = wastelandGraph.create({ int: 9 });
    expect(bright.get("dialogueAccess")).toBe(1);
    expect(bright.get("settlementProductivity")).toBe(45);

    // This graph has no attackPower/combat derived — INT means something wholly different here.
    expect(wastelandGraph.derivedIds).not.toContain("attackPower");
    expect(heroGraph.derivedIds).toContain("attackPower");
  });

  // Adopter 3: a ranked ability/perk path built on the EXISTING talent tree (ranked nodes)
  // and the EXISTING wallet (progression currency), feeding the graph as one modifier source.
  type PerkStat = "rifleDamage";
  const perkNodes = [
    { id: "gunNut", branch: "commando", maxRank: 3, modifiersPerRank: { rifleDamage: { add: 5 } } },
    { id: "sniper", branch: "commando", maxRank: 2, requires: [{ nodeId: "gunNut", rank: 2 }], modifiersPerRank: { rifleDamage: { multiply: 1.1 } } },
  ] as const;

  const perkGraph = createStatGraph({
    inputs: [{ id: "rifleDamage", base: 20 }],
    derived: [{ id: "shotDamage", deps: ["rifleDamage"], round: "round", compute: (c) => c.value("rifleDamage") }],
  });

  /** Compose ranked talents + a wallet currency into a spend/refund transaction, then reflect ranks into the graph. */
  function buyRank(tree: ReturnType<typeof createTalentTree<PerkStat>>, wallet: WalletState, nodeId: string) {
    if (!tree.canAllocate(nodeId).ok) return { ok: false as const, wallet };
    const charged = charge(wallet, "perkPoints", 1);
    if (charged.status === "rejected") return { ok: false as const, wallet };
    tree.allocate(nodeId);
    return { ok: true as const, wallet: charged.state };
  }

  test("ranked perk path: spend currency on ranks, feed them into the graph, then respec/refund", () => {
    const tree = createTalentTree<PerkStat>({ nodes: perkNodes as never, points: 3 });
    let wallet = grant(createEmptyWallet(), "perkPoints", 3);
    const sheet = perkGraph.create();

    const reflect = () => sheet.addSource("perks", statModifierContributions("perks", tree.resolved().stats));
    reflect();
    expect(sheet.get("shotDamage")).toBe(20); // no ranks yet

    for (const node of ["gunNut", "gunNut", "sniper"]) wallet = buyRank(tree, wallet, node).wallet;
    reflect();
    expect(tree.rank("gunNut")).toBe(2);
    expect(tree.rank("sniper")).toBe(1);
    expect(balance(wallet, "perkPoints")).toBe(0);
    // rifleDamage = (20 + 5*2) * 1.1^1 = 33
    expect(sheet.get("shotDamage")).toBe(33);

    // Respec: refund all spent points to the currency and clear the ranks.
    const refund = tree.pointsSpent();
    tree.reset();
    wallet = grant(wallet, "perkPoints", refund);
    reflect();
    expect(balance(wallet, "perkPoints")).toBe(3);
    expect(sheet.get("shotDamage")).toBe(20);
  });

  test("statModifierContributions bridges the shared StatModifierSet shape into graph sources", () => {
    const contribs = statModifierContributions("gear", { rifleDamage: { add: 4, multiply: 1.25 } });
    expect(contribs.rifleDamage).toEqual([
      { source: "gear", op: "add", value: 4 },
      { source: "gear", op: "mul", value: 1.25 },
    ]);
  });
});
