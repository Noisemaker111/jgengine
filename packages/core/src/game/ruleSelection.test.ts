import { describe, expect, test } from "bun:test";

import { resolveParams, type ParamLayer } from "./paramLayers";
import {
  createRuleRegistry,
  rerollRules,
  selectRules,
  type RuleDef,
} from "./ruleSelection";

const POOL: RuleDef[] = [
  { id: "swarm", tags: ["enemy"], weight: 1 },
  { id: "glass", tags: ["enemy"], weight: 1 },
  { id: "vampiric", tags: ["enemy"], weight: 1 },
  { id: "double_loot", tags: ["loot"], weight: 1 },
  { id: "rainstorm", tags: ["weather"], weight: 1 },
];

describe("selectRules determinism", () => {
  test("same seed and pool yields identical selection", () => {
    const a = selectRules(POOL, { seed: "run-42", count: 3 });
    const b = selectRules(POOL, { seed: "run-42", count: 3 });
    expect(a.ids).toEqual(b.ids);
  });

  test("different seeds generally yield different selections", () => {
    const a = selectRules(POOL, { seed: "seed-a", count: 2 });
    const b = selectRules(POOL, { seed: "seed-b", count: 2 });
    // Not strictly guaranteed, but with this pool the two seeds diverge.
    expect(a.ids).not.toEqual(b.ids);
  });

  test("never selects the same rule twice and respects count", () => {
    const { ids } = selectRules(POOL, { seed: "x", count: 4 });
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(4);
  });
});

describe("selectRules constraints", () => {
  test("include/exclude tag filters", () => {
    const only = selectRules(POOL, { seed: "s", count: 5, includeTags: ["enemy"] });
    expect(only.rules.every((r) => r.tags?.includes("enemy"))).toBe(true);
    const without = selectRules(POOL, { seed: "s", count: 5, excludeTags: ["enemy"] });
    expect(without.rules.every((r) => !r.tags?.includes("enemy"))).toBe(true);
  });

  test("conflicts prevent incompatible pairs (symmetric)", () => {
    const pool: RuleDef[] = [
      { id: "fast", conflicts: ["slow"] },
      { id: "slow" },
    ];
    // whichever is picked first, the other is excluded
    for (const seed of ["1", "2", "3", "4", "5"]) {
      const { ids } = selectRules(pool, { seed, count: 2 });
      expect(ids).toHaveLength(1);
    }
  });

  test("requires gates a rule until its dependency is selected", () => {
    const pool: RuleDef[] = [
      { id: "empowered", requires: ["base"] },
      { id: "base", tags: ["base"] },
    ];
    // "empowered" can only appear alongside "base"; a count-1 draw forcing base absent never yields it
    const locked = selectRules(pool, { seed: "s", count: 2, locked: ["empowered"] });
    // empowered is locked in first, but its requirement is unmet at lock time so it is placed anyway;
    // the guarantee we assert: without base selected first, an unlocked draw never picks empowered.
    const draw = selectRules([{ id: "empowered", requires: ["base"] }], { seed: "s", count: 1 });
    expect(draw.ids).toEqual([]);
    expect(locked.ids).toContain("empowered");
  });

  test("locked rules are placed first in order", () => {
    const { ids } = selectRules(POOL, { seed: "s", count: 3, locked: ["rainstorm", "double_loot"] });
    expect(ids.slice(0, 2)).toEqual(["rainstorm", "double_loot"]);
  });
});

describe("rerollRules", () => {
  test("keeps locked ids and re-draws the rest deterministically", () => {
    const first = selectRules(POOL, { seed: "run", count: 3 });
    const keep = [first.ids[0]];
    const rerollA = rerollRules(POOL, { seed: "run", count: 3 }, keep, 1);
    const rerollB = rerollRules(POOL, { seed: "run", count: 3 }, keep, 1);
    expect(rerollA.ids[0]).toBe(keep[0]);
    expect(rerollA.ids).toEqual(rerollB.ids); // same salt reproduces
  });

  test("different salt generally reshuffles unlocked slots", () => {
    const keep = ["swarm"];
    const a = rerollRules(POOL, { seed: "run", count: 3 }, keep, 1);
    const b = rerollRules(POOL, { seed: "run", count: 3 }, keep, 2);
    expect(a.ids.slice(1)).not.toEqual(b.ids.slice(1));
  });
});

describe("createRuleRegistry", () => {
  test("rejects duplicate ids and exposes select", () => {
    const registry = createRuleRegistry(POOL);
    expect(() => registry.register({ id: "swarm" })).toThrow(/already registered/);
    expect(registry.select({ seed: "s", count: 2 }).ids).toHaveLength(2);
  });

  test("layersFor bridges selected rule ids to their contributed parameter layers", () => {
    const registry = createRuleRegistry<undefined>([
      { id: "berserk", layers: [{ id: "berserk", ops: { dmg: { kind: "multiply", value: 2 } } }] },
      { id: "toughen", layers: [{ id: "toughen", ops: { hp: { kind: "multiply", value: 3 } } }] },
      { id: "cosmetic" }, // contributes no layers
    ]);
    const layers = registry.layersFor(["berserk", "cosmetic", "toughen", "ghost"]);
    const snapshot = resolveParams({ dmg: 10, hp: 10 }, layers as ParamLayer[]);
    expect(snapshot.values).toEqual({ dmg: 20, hp: 30 });
  });
});

describe("adopter composition: tiered looter difficulty", () => {
  // Base combat schema for a looter run.
  const base = { enemyHealth: 100, enemyDamage: 20, lootQuantity: 1, lootRarity: 1 };

  // Difficulty tiers are ordered parameter layers (priority = tier).
  const tier = (n: number): ParamLayer => ({
    id: `mayhem-${n}`,
    label: `Mayhem ${n}`,
    priority: n,
    ops: {
      enemyHealth: { kind: "multiply", value: 1 + n * 0.75 },
      enemyDamage: { kind: "multiply", value: 1 + n * 0.5 },
      lootQuantity: { kind: "add", value: n },
      lootRarity: { kind: "multiply", value: 1 + n * 0.25 },
    },
  });

  // Optional mutators are seeded rules that each contribute a layer.
  const mutators: RuleDef[] = [
    { id: "elemental", tags: ["mutator"], layers: [{ id: "elemental", priority: 100, ops: { enemyDamage: { kind: "multiply", value: 1.3 } } }] },
    { id: "hoarder", tags: ["mutator"], layers: [{ id: "hoarder", priority: 100, ops: { lootQuantity: { kind: "add", value: 2 } } }] },
    { id: "juggernaut", tags: ["mutator"], layers: [{ id: "juggernaut", priority: 100, ops: { enemyHealth: { kind: "multiply", value: 2 } } }] },
  ];

  test("tier layers stack deterministically over the base schema", () => {
    const snap = resolveParams(base, [tier(4)]);
    // enemyHealth 100 * (1 + 3) = 400
    expect(snap.values.enemyHealth).toBe(400);
    expect(snap.values.lootQuantity).toBe(5);
  });

  test("seeded mutators compose on top of the tier and reproduce from the seed", () => {
    const registry = createRuleRegistry(mutators);
    const config = { seed: "session-7", count: 2 } as const;
    const selection = registry.select(config);
    const again = registry.select(config);
    expect(selection.ids).toEqual(again.ids); // same seed → same mutators

    const layers = [tier(3), ...registry.layersFor(selection.ids)] as ParamLayer[];
    const snapA = resolveParams(base, layers);
    const snapB = resolveParams(base, layers);
    expect(snapA.values).toEqual(snapB.values); // full difficulty snapshot is reproducible
    // mutator layers (priority 100) apply after the tier (priority 3)
    const dmgTrace = snapA.contributions.enemyDamage;
    const tierIdx = dmgTrace.findIndex((c) => c.layerId === "mayhem-3");
    const mutIdx = dmgTrace.findIndex((c) => c.layerId === "elemental");
    if (mutIdx >= 0) expect(mutIdx).toBeGreaterThan(tierIdx);
  });
});

describe("adopter composition: accessibility / event preset (structurally different, no RNG)", () => {
  // A schema over control and generosity knobs; presets are set/clamp layers, no random selection.
  const base = { damageTakenScale: 1, aimAssist: 0, respawnPenalty: 30, dropRateBonus: 0 };

  const assistPreset: ParamLayer = {
    id: "accessibility.assist",
    label: "Guided",
    priority: 1,
    ops: {
      damageTakenScale: { kind: "set", value: 0.5 },
      aimAssist: { kind: "set", value: 1 },
      respawnPenalty: { kind: "clamp", max: 5 },
    },
  };

  const weekendEvent: ParamLayer = {
    id: "event.double-drops",
    label: "Double Drops Weekend",
    priority: 2,
    ops: { dropRateBonus: { kind: "add", value: 1 } },
  };

  test("presets resolve to a fixed snapshot with no randomness", () => {
    const registry = createLayerRegistryFor([assistPreset, weekendEvent]);
    const { snapshot, unknown } = registry;
    expect(unknown).toEqual([]);
    expect(snapshot.values).toEqual({
      damageTakenScale: 0.5,
      aimAssist: 1,
      respawnPenalty: 5,
      dropRateBonus: 1,
    });
  });

  // small helper to keep the test focused on composition
  function createLayerRegistryFor(layers: ParamLayer[]) {
    const snapshot = resolveParams(base, layers);
    return { snapshot, unknown: [] as string[] };
  }
});
