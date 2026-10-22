import { describe, expect, test } from "bun:test";

import { assertWeaponDefinition } from "../combat/weaponDefinition";
import { createDamageRuntime } from "../combat/damageRuntime";
import type { DamageTableDef } from "../combat/damageTable";
import type { HitZoneTable } from "../combat/hitZones";
import { createWeaponSystem } from "../combat/weaponSystem";
import { devtools } from "../devtools/devtools";
import { createItemInstanceRegistry, proceduralLootEntry } from "../item/itemInstanceRegistry";
import { createLootRegistry, lootTable } from "../game/lootTable";
import { seededRng } from "../random/rng";
import {
  MAX_LOOT_AFFIXES,
  assertLootCatalog,
  compareLootItems,
  createLootRoller,
  lootLevelScale,
  rollLoot,
  validateLootItem,
  type LootCatalog,
  type LootItem,
} from "./lootGen";
import { lootWeaponDefinition } from "./lootWeapon";

const catalog: LootCatalog = {
  bases: [
    {
      id: "frame.light",
      name: "Lightframe",
      weight: 3,
      baseStats: { power: 12, cadence: 420, capacity: 14, reload: 900, spread: 0.02, reach: 45 },
      pools: ["edge", "core"],
      slots: [
        { id: "barrel", accepts: "barrel" },
        { id: "grip", accepts: "grip" },
      ],
    },
    {
      id: "frame.heavy",
      name: "Heavyframe",
      weight: 1,
      baseStats: { power: 26, cadence: 240, capacity: 8, reload: 1400, spread: 0.03, reach: 65 },
      pools: ["edge", "core"],
      slots: [
        { id: "barrel", accepts: "barrel" },
        { id: "brace", accepts: "brace" },
      ],
    },
  ],
  parts: [
    { id: "barrel.long", category: "barrel", stats: { reach: 12 }, multipliers: { spread: 0.8 }, weight: 2, namePart: "Long" },
    { id: "barrel.snub", category: "barrel", stats: { spread: 0.01 }, multipliers: { cadence: 1.1 }, weight: 2, namePart: "Snub" },
    { id: "grip.wrapped", category: "grip", stats: { reload: -100 }, weight: 1, namePart: "Wrapped" },
    { id: "grip.open", category: "grip", stats: { cadence: 40 }, weight: 1, namePart: "Open" },
    { id: "brace.wide", category: "brace", stats: { capacity: 2 }, weight: 1, namePart: "Wide" },
    { id: "brace.true", category: "brace", multipliers: { spread: 0.7 }, weight: 1, namePart: "True" },
  ],
  pools: [
    {
      id: "edge",
      affixes: [
        { id: "keen", stat: "power", op: "add", roll: [3, 6], weight: 4, namePart: { position: "prefix", text: "Keen" } },
        { id: "swift", stat: "cadence", op: "add", roll: [20, 50], weight: 4, namePart: { position: "prefix", text: "Swift" } },
        { id: "steady", stat: "spread", op: "mul", roll: [0.7, 0.9], weight: 2, namePart: { position: "suffix", text: "of Steadying" } },
      ],
    },
    {
      id: "core",
      affixes: [
        { id: "deep", stat: "capacity", op: "add", roll: [1, 3], weight: 3, namePart: { position: "prefix", text: "Deep" } },
        { id: "quick", stat: "reload", op: "add", roll: [-120, -60], weight: 3, namePart: { position: "suffix", text: "of Quick Hands" } },
        { id: "far", stat: "reach", op: "add", roll: [4, 10], weight: 3, namePart: { position: "suffix", text: "of Reach" } },
      ],
    },
  ],
  rarities: [
    { id: "common", weight: 60, affixCount: [0, 1] },
    { id: "uncommon", weight: 25, affixCount: 1 },
    { id: "rare", weight: 10, affixCount: [2, 3], statScale: 1.15, namePart: "Rare" },
    { id: "epic", weight: 4, affixCount: [3, 4], statScale: 1.35, namePart: "Epic" },
    { id: "legendary", weight: 1, affixCount: [4, 5], statScale: 1.7, namePart: "Legendary" },
  ],
  manufacturers: [
    { id: "voss", name: "Voss", weight: 2, bias: { power: 5, cadence: -20 }, scale: { spread: 1.1 }, favoredPools: ["edge"] },
    { id: "tallow", name: "Tallow", weight: 2, bias: { cadence: 40, power: -3 }, favoredPools: ["core"] },
    { id: "orrin", name: "Orrin", weight: 1, scale: { reload: 0.85 } },
  ],
  levelScale: [
    [1, 1],
    [15, 1.6],
    [30, 2.4],
    [60, 4],
  ],
};

const WEAPON_TEMPLATE = {
  id: "fixture.emitter",
  roundsPerMinute: 300,
  fireMode: "single" as const,
  delivery: { kind: "hitscan" as const, maxRange: 40 },
  magazine: { capacity: 10, reloadMs: 1000, reserve: 40 },
  handling: { spread: { base: 0.01 } },
  damage: { type: "kinetic", base: 5 },
};

const WEAPON_STATS = {
  roundsPerMinute: "cadence",
  damage: "power",
  magazineCapacity: "capacity",
  reloadMs: "reload",
  spreadBase: "spread",
  maxRange: "reach",
};

function bare(stats: Record<string, number>): LootItem {
  return {
    baseId: "frame.light",
    manufacturer: "voss",
    rarity: "common",
    level: 1,
    name: "Bare Lightframe",
    parts: [],
    affixes: [],
    stats,
  };
}

describe("loot generation", () => {
  test("same seed rolls the same item, and a different seed moves it", () => {
    const one = rollLoot(catalog, seededRng("b3.1-determinism"));
    const two = rollLoot(catalog, seededRng("b3.1-determinism"));
    const other = rollLoot(catalog, seededRng("b3.1-other"));
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    expect(JSON.stringify(one)).not.toBe(JSON.stringify(other));
  });

  test("10,000 drops match the declared rarity distribution within 4 sigma", () => {
    const roller = createLootRoller(catalog);
    const rng = seededRng("b3.1-distribution");
    const counts = new Map<string, number>();
    const drops = 10_000;
    const names = new Set<string>();
    const baseName = new Map(catalog.bases.map((base) => [base.id, base.name] as const));
    const makerName = new Map(catalog.manufacturers.map((maker) => [maker.id, maker.name] as const));

    for (let i = 0; i < drops; i += 1) {
      const item = roller.roll(rng, { level: 20 });
      counts.set(item.rarity, (counts.get(item.rarity) ?? 0) + 1);
      names.add(item.name);
      expect(validateLootItem(item, catalog)).toEqual([]);
      expect(item.name).toContain(baseName.get(item.baseId)!);
      expect(item.name).toContain(makerName.get(item.manufacturer)!);
    }

    const totalWeight = catalog.rarities.reduce((sum, rarity) => sum + rarity.weight, 0);
    const rows: string[] = [];
    for (const rarity of catalog.rarities) {
      const target = rarity.weight / totalWeight;
      const measured = (counts.get(rarity.id) ?? 0) / drops;
      const sigma = Math.sqrt((target * (1 - target)) / drops);
      const tolerance = 4 * sigma;
      rows.push(
        `${rarity.id.padEnd(10)} target ${(target * 100).toFixed(2)}%  measured ${(measured * 100).toFixed(2)}%  tolerance ${(tolerance * 100).toFixed(2)}%`,
      );
      expect(Math.abs(measured - target)).toBeLessThanOrEqual(tolerance);
    }
    console.log(`rarity distribution over ${drops} drops (b3.1-distribution):\n${rows.join("\n")}`);

    expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBe(drops);
    expect(names.size).toBeGreaterThan(100);
    expect(roller.stats().rolls).toBe(drops);
  });

  test("level scaling raises base and additive affix stats", () => {
    const options = { baseId: "frame.light", manufacturer: "voss", rarity: "legendary" } as const;
    const low = rollLoot(catalog, seededRng("b3.1-level"), { ...options, level: 1 });
    const high = rollLoot(catalog, seededRng("b3.1-level"), { ...options, level: 60 });
    expect(lootLevelScale(catalog, 1)).toBe(1);
    expect(lootLevelScale(catalog, 60)).toBe(4);
    expect(high.stats.power!).toBeGreaterThan(low.stats.power! * 3);
    expect(high.affixes.map((affix) => affix.stat)).toEqual(low.affixes.map((affix) => affix.stat));
    expect(high.affixes[0]!.value).toBeCloseTo(low.affixes[0]!.value * 4, 6);
  });

  test("manufacturer personality moves the same roll's stats", () => {
    const options = { baseId: "frame.light", rarity: "rare", level: 30 } as const;
    const voss = rollLoot(catalog, seededRng("b3.1-maker"), { ...options, manufacturer: "voss" });
    const tallow = rollLoot(catalog, seededRng("b3.1-maker"), { ...options, manufacturer: "tallow" });
    expect(voss.stats.power!).toBeGreaterThan(tallow.stats.power!);
    expect(tallow.stats.cadence!).toBeGreaterThan(voss.stats.cadence!);
    expect(voss.name.startsWith("Voss ")).toBe(true);
    expect(tallow.name.startsWith("Tallow ")).toBe(true);
  });

  test("a rolled weapon validates against its catalog and fires through the weapon system", () => {
    const item = rollLoot(catalog, seededRng("b3.1-weapon"), { level: 30, baseId: "frame.light", rarity: "epic", manufacturer: "orrin" });
    expect(validateLootItem(item, catalog)).toEqual([]);
    const definition = lootWeaponDefinition(item, { template: WEAPON_TEMPLATE, stats: WEAPON_STATS });
    assertWeaponDefinition(definition);

    const table: DamageTableDef = { types: [{ id: "kinetic", vs: { flesh: 1 } }], armor: { halfValue: 100, maxMitigation: 0.9 } };
    const zones: HitZoneTable = { zones: [{ id: "body", multiplier: 1 }], defaultZone: "body" };
    const damage = createDamageRuntime({ table, zones, rng: () => 0.5 });
    damage.registerTarget("dummy", { resistance: "flesh", armor: 0 });

    const system = createWeaponSystem(definition, {
      rng: seededRng("b3.1-fire"),
      damage,
      origin: () => [0, 0, 0],
      raycast: (from, direction, maxRange) => ({
        target: "dummy",
        point: [from[0] + direction[0] * maxRange * 0.5, from[1], from[2] + direction[2] * maxRange * 0.5],
      }),
    });

    expect(definition.roundsPerMinute).toBeCloseTo(item.stats.cadence!, 6);
    expect(definition.damage.base).toBeCloseTo(item.stats.power!, 6);
    expect(definition.magazine!.capacity).toBe(Math.round(item.stats.capacity!));
    expect(definition.delivery.kind === "hitscan" && definition.delivery.maxRange).toBeCloseTo(item.stats.reach!, 6);

    system.setTrigger(true);
    const ticked = system.tick(1 / 60);
    expect(ticked.shots).toHaveLength(1);
    expect(ticked.impacts).toHaveLength(1);
    expect(system.ammo().loaded).toBe(definition.magazine!.capacity - 1);
    expect(system.stats().damage).toBeGreaterThan(0);
    system.dispose();
  });

  test("a generated drop registers under its base id and resolves through a loot table", () => {
    const instances = createItemInstanceRegistry<LootItem>("loot");
    const table = lootTable({
      id: "drops",
      entries: [
        {
          count: 1,
          weight: 1,
          generate: proceduralLootEntry(instances, (rng) => {
            const item = rollLoot(catalog, rng, { level: 10 });
            return { baseId: item.baseId, def: item };
          }),
        },
      ],
    });
    const loot = createLootRegistry({ rng: seededRng("b3.1-table") });
    loot.register(table);

    const drops = loot.roll("drops", seededRng("b3.1-table"));
    expect(drops).toHaveLength(1);
    const registered = instances.get(drops[0]!.item!);
    expect(registered).toBeDefined();
    expect(validateLootItem(registered!, catalog)).toEqual([]);
    expect(registered!.name).not.toBe("");
  });

  test("affix count is bounded even when a rarity asks for more than the catalog offers", () => {
    const item = rollLoot(catalog, seededRng("b3.1-affix-cap"), { rarity: "legendary" });
    expect(item.affixes.length).toBeLessThanOrEqual(MAX_LOOT_AFFIXES);
    expect(item.affixes.length).toBeLessThanOrEqual(6);
  });

  test("catalogs fail loudly when a base names a missing pool or a slot fits no part", () => {
    expect(() => assertLootCatalog({ ...catalog, bases: [{ ...catalog.bases[0]!, pools: ["missing"] }] })).toThrow(/missing/);
    expect(() =>
      assertLootCatalog({
        ...catalog,
        bases: [{ ...catalog.bases[0]!, slots: [{ id: "sight", accepts: "sight" }] }],
      }),
    ).toThrow(/sight/);
    expect(() =>
      rollLoot(catalog, seededRng("b3.1-pin"), { manufacturer: "orrin", baseId: "frame.light", rarity: "missing" }),
    ).toThrow(/missing/);
  });

  test("validation reports each defect with its own code", () => {
    const good = rollLoot(catalog, seededRng("b3.1-validate"), { baseId: "frame.light", rarity: "rare", manufacturer: "voss" });
    expect(validateLootItem(good, catalog)).toEqual([]);

    const missingPart = { ...good, parts: good.parts.slice(1) };
    expect(validateLootItem(missingPart, catalog).map((issue) => issue.code)).toContain("missing-slot-part");

    const wrongCategory = {
      ...good,
      parts: good.parts.map((part, index) => (index === 0 ? { ...part, partId: "grip.open" } : part)),
    };
    expect(validateLootItem(wrongCategory, catalog).map((issue) => issue.code)).toContain("part-category");

    const unknown = {
      ...good,
      baseId: "frame.missing",
      manufacturer: "unknown",
      rarity: "unknown",
      level: 0,
      name: " ",
      stats: { power: Number.NaN },
    };
    const codes = validateLootItem(unknown, catalog).map((issue) => issue.code);
    for (const code of ["unknown-base", "unknown-manufacturer", "unknown-rarity", "invalid-level", "empty-name", "non-finite-stat"]) {
      expect(codes).toContain(code);
    }

    const wrongMaker = rollLoot(catalog, seededRng("b3.1-maker-check"), { baseId: "frame.light", rarity: "common", manufacturer: "voss" });
    const restricted: LootCatalog = {
      ...catalog,
      manufacturers: [{ id: "voss", name: "Voss", bases: ["frame.light"] }],
    };
    const codesForRestricted = validateLootItem({ ...wrongMaker, baseId: "frame.heavy" }, restricted).map((issue) => issue.code);
    expect(codesForRestricted).toContain("manufacturer-base");
  });

  test("comparison returns per-stat deltas and a weighted score", () => {
    const a = bare({ power: 10, cadence: 20, reload: 900 });
    const b = bare({ power: 12, cadence: 18, reload: 700 });

    const plain = compareLootItems(a, b);
    expect(plain.deltas).toEqual([
      { stat: "cadence", a: 20, b: 18, delta: -2 },
      { stat: "power", a: 10, b: 12, delta: 2 },
      { stat: "reload", a: 900, b: 700, delta: -200 },
    ]);
    expect(plain.scoreA).toBe(930);
    expect(plain.scoreB).toBe(730);
    expect(plain.better).toBe("a");

    const weighted = compareLootItems(a, b, { weights: { power: 10 }, lowerIsBetter: ["reload"] });
    expect(weighted.scoreB - weighted.scoreA).toBeCloseTo(10 * (12 - 10) + (18 - 20) + (900 - 700), 6);
    expect(weighted.better).toBe("b");

    expect(compareLootItems(a, a).better).toBe("equal");
  });

  test("the roller counts rarities, probes them, and round-trips its counters", () => {
    const name = "loot.test.roller";
    const roller = createLootRoller(catalog, { devtoolsName: name });
    const rng = seededRng("b3.1-roller");
    for (let i = 0; i < 40; i += 1) roller.roll(rng, { level: 5 });
    const state = roller.stats();
    expect(state.rolls).toBe(40);
    expect(Object.values(state.byRarity).reduce((sum, count) => sum + count, 0)).toBe(40);
    expect(devtools.probes.read()[name]).toEqual(state);

    expect(roller.restore({ rolls: 2, byRarity: { rare: 2 } })).toBe(true);
    expect(roller.stats()).toEqual({ rolls: 2, byRarity: { rare: 2 } });
    expect(roller.restore({ rolls: -1, byRarity: {} })).toBe(false);
    expect(roller.restore({ rolls: 1, byRarity: { rare: 1.5 } })).toBe(false);
    expect(roller.stats()).toEqual({ rolls: 2, byRarity: { rare: 2 } });

    roller.reset();
    expect(roller.stats()).toEqual({ rolls: 0, byRarity: {} });
    roller.dispose();
    expect(devtools.probes.read()[name]).toBeUndefined();
  });
});
