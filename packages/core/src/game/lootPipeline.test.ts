import { describe, expect, test } from "bun:test";

import { createLootRegistry, type LootTableDef } from "./lootTable";
import {
  createLootPipeline,
  defineLootPipeline,
  type LootModifier,
  type LootResolveContext,
} from "./lootPipeline";

/** Deterministic seeded RNG (mulberry32) so every test can assert exact rolls and replay them. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const worldPool: LootTableDef = {
  id: "world_pool",
  entries: [
    { currency: "gold", count: [1, 5], weight: 60 },
    { item: "common_scrap", count: 1, weight: 30 },
    { item: "rare_gem", count: 1, weight: 10 },
  ],
};

const dedicatedBossPool: LootTableDef = {
  id: "boss_pool",
  entries: [
    { item: "boss_blade", count: 1, weight: 70 },
    { item: "boss_crown", count: 1, weight: 30 },
  ],
};

const pityPool: LootTableDef = {
  id: "pity_pool",
  entries: [{ item: "consolation_token", count: 1, weight: 1 }],
};

// A world drop list that can roll nothing at all (independent mode), to exercise fallbacks.
const stingyPool: LootTableDef = {
  id: "stingy_pool",
  mode: "independent",
  entries: [{ item: "lucky_drop", count: 1, chance: 0.01 }],
};

/** Example genre context — kept OUT of core; the pipeline only sees what the game hands it. */
interface RunContext {
  isBoss: boolean;
  luck: number;
}

/** Example luck policy: multiplies the rare-tier entry's weight. Lives in game space, not core. */
function luckModifier(rareItem: string): LootModifier<RunContext> {
  return {
    id: "luck",
    plan(plan, ctx) {
      return {
        ...plan,
        entries: plan.entries.map((planEntry) =>
          planEntry.entry.item === rareItem ? { ...planEntry, weight: planEntry.weight * (1 + ctx.luck) } : planEntry,
        ),
      };
    },
  };
}

/** Example quantity policy: scales every rolled currency drop count by a factor. */
const doubleCurrency: LootModifier<RunContext> = {
  id: "double-currency",
  drops(drops) {
    return drops.map((drop) => (drop.currency !== undefined ? { ...drop, count: drop.count * 2 } : drop));
  },
};

function registryResolver(...tables: LootTableDef[]): (id: string) => LootTableDef | undefined {
  const registry = createLootRegistry();
  for (const table of tables) registry.register(table);
  const byId = new Map(tables.map((table) => [table.id, table]));
  return (id) => byId.get(id);
}

describe("lootPipeline", () => {
  test("defineLootPipeline rejects empty and duplicate-stage definitions", () => {
    expect(() => defineLootPipeline({ id: "empty", stages: [] })).toThrow();
    expect(() =>
      defineLootPipeline({
        id: "dupe",
        stages: [
          { id: "s", table: worldPool },
          { id: "s", table: worldPool },
        ],
      }),
    ).toThrow();
  });

  test("determinism: same seed yields identical drops and provenance", () => {
    const pipeline = createLootPipeline<RunContext>({ id: "p", stages: [{ id: "world", table: worldPool }] });
    const run = (): LootResolveContext<RunContext> => ({ ctx: { isBoss: false, luck: 0 }, rng: seededRng(42), seed: 42 });
    const a = pipeline.resolve(run());
    const b = pipeline.resolve(run());
    expect(a).toEqual(b);
    expect(a.drops.length).toBe(1);
    expect(a.seed).toBe(42);
  });

  test("determinism: unmodified pipeline matches the base loot table RNG order exactly", () => {
    const table: LootTableDef = { id: "t", rolls: 3, entries: worldPool.entries };
    const registry = createLootRegistry();
    registry.register(table);
    const baseline = registry.roll("t", seededRng(7));

    const pipeline = createLootPipeline({ id: "p", stages: [{ id: "s", table }] });
    const resolved = pipeline.resolve({ ctx: {}, rng: seededRng(7) });
    expect(resolved.drops).toEqual(baseline);
  });

  test("serialize round-trip: resolution survives JSON stringify/parse unchanged", () => {
    const pipeline = createLootPipeline<RunContext>({
      id: "p",
      stages: [
        { id: "world", table: worldPool, modifiers: [luckModifier("rare_gem"), doubleCurrency] },
        { id: "boss", table: dedicatedBossPool, when: (ctx) => ctx.isBoss },
      ],
    });
    const resolution = pipeline.resolve({ ctx: { isBoss: true, luck: 5 }, rng: seededRng(99), seed: "run-99" });
    const roundTripped = JSON.parse(JSON.stringify(resolution));
    expect(roundTripped).toEqual(resolution);
    expect(resolution.seed).toBe("run-99");
  });

  test("fallback: a pity stage only fires when earlier pools produced nothing", () => {
    const pipeline = createLootPipeline({
      id: "p",
      stages: [
        { id: "world", table: stingyPool },
        { id: "pity", table: pityPool, kind: "fallback" },
      ],
    });
    // Seed chosen so the 1%-chance stingy pool misses -> pity fallback fires.
    const resolved = pipeline.resolve({ ctx: {}, rng: seededRng(1) });
    const worldTrace = resolved.stages.find((stage) => stage.stageId === "world");
    const pityTrace = resolved.stages.find((stage) => stage.stageId === "pity");
    expect(worldTrace?.status).toBe("empty");
    expect(pityTrace?.status).toBe("rolled");
    expect(resolved.drops).toEqual([{ item: "consolation_token", count: 1 }]);
  });

  test("fallback: does not fire when an earlier pool already dropped", () => {
    const pipeline = createLootPipeline({
      id: "p",
      stages: [
        { id: "world", table: worldPool },
        { id: "pity", table: pityPool, kind: "fallback" },
      ],
    });
    const resolved = pipeline.resolve({ ctx: {}, rng: seededRng(3) });
    const pityTrace = resolved.stages.find((stage) => stage.stageId === "pity");
    expect(pityTrace?.status).toBe("fell-through");
    expect(pityTrace?.reason).toBe("prior-drops-present");
    expect(resolved.drops.some((drop) => drop.item === "consolation_token")).toBe(false);
  });

  test("gate: a stage whose `when` returns false is skipped and traced", () => {
    const pipeline = createLootPipeline<RunContext>({
      id: "p",
      stages: [{ id: "boss", table: dedicatedBossPool, when: (ctx) => ctx.isBoss }],
    });
    const resolved = pipeline.resolve({ ctx: { isBoss: false, luck: 0 }, rng: seededRng(5) });
    expect(resolved.drops).toEqual([]);
    expect(resolved.stages[0]?.status).toBe("skipped");
    expect(resolved.stages[0]?.reason).toBe("gate-false");
  });

  test("replace: an override stage discards prior drops and provenance", () => {
    const pipeline = createLootPipeline<RunContext>({
      id: "p",
      stages: [
        { id: "world", table: worldPool },
        { id: "boss", table: dedicatedBossPool, kind: "replace", when: (ctx) => ctx.isBoss },
      ],
    });
    const resolved = pipeline.resolve({ ctx: { isBoss: true, luck: 0 }, rng: seededRng(11) });
    expect(resolved.drops.every((drop) => drop.item?.startsWith("boss_"))).toBe(true);
    expect(resolved.provenance.every((record) => record.stageId === "boss")).toBe(true);
    expect(resolved.stages.find((stage) => stage.stageId === "boss")?.status).toBe("replaced");
  });

  test("modifier: luck reweights an entry and provenance records original vs effective weight", () => {
    // With overwhelming luck the rare gem should win; provenance shows the boosted weight.
    const pipeline = createLootPipeline<RunContext>({
      id: "p",
      stages: [{ id: "world", table: worldPool, modifiers: [luckModifier("rare_gem")] }],
    });
    const resolved = pipeline.resolve({ ctx: { isBoss: false, luck: 1000 }, rng: seededRng(2) });
    const gem = resolved.provenance.find((record) => record.item === "rare_gem");
    expect(gem).toBeDefined();
    expect(gem?.originalWeight).toBe(10);
    expect(gem?.effectiveWeight).toBe(10 * 1001);
    expect(gem?.modifiers).toContain("luck");
  });

  test("modifier: quantity policy scales rolled counts", () => {
    const goldOnly: LootTableDef = { id: "gold_only", entries: [{ currency: "gold", count: 3, weight: 1 }] };
    const pipeline = createLootPipeline<RunContext>({
      id: "p",
      stages: [{ id: "world", table: goldOnly, modifiers: [doubleCurrency] }],
    });
    const resolved = pipeline.resolve({ ctx: { isBoss: false, luck: 0 }, rng: seededRng(4) });
    expect(resolved.drops).toEqual([{ currency: "gold", count: 6 }]);
  });

  test("provenance: records stage, table, and entry index for every drop", () => {
    const pipeline = createLootPipeline({
      id: "p",
      stages: [{ id: "world", table: worldPool }],
    });
    const resolved = pipeline.resolve({ ctx: {}, rng: seededRng(8) });
    expect(resolved.provenance.length).toBe(resolved.drops.length);
    for (const record of resolved.provenance) {
      expect(record.stageId).toBe("world");
      expect(record.tableId).toBe("world_pool");
      expect(record.entryIndex).toBeGreaterThanOrEqual(0);
    }
  });

  test("empty pool: gating out all entries yields an empty stage, not a throw", () => {
    const gateAll: LootModifier = {
      id: "gate-all",
      plan(plan) {
        return { ...plan, entries: plan.entries.map((entry) => ({ ...entry, eligible: false })) };
      },
    };
    const pipeline = createLootPipeline({ id: "p", stages: [{ id: "world", table: worldPool, modifiers: [gateAll] }] });
    const resolved = pipeline.resolve({ ctx: {}, rng: seededRng(6) });
    expect(resolved.drops).toEqual([]);
    expect(resolved.stages[0]?.status).toBe("empty");
    expect(resolved.stages[0]?.reason).toBe("empty-pool");
  });

  test("duplicate policy: stack merges same-item drops into summed counts", () => {
    const repeater: LootTableDef = { id: "repeater", rolls: 5, entries: [{ item: "arrow", count: 2, weight: 1 }] };
    const pipeline = createLootPipeline({ id: "p", stages: [{ id: "s", table: repeater }], stack: true });
    const resolved = pipeline.resolve({ ctx: {}, rng: seededRng(12) });
    expect(resolved.drops).toEqual([{ item: "arrow", count: 10 }]);
  });

  test("cap: maxDrops trims the result and traces the cap", () => {
    const repeater: LootTableDef = { id: "repeater", rolls: 5, entries: [{ item: "arrow", count: 1, weight: 1 }] };
    const pipeline = createLootPipeline({ id: "p", stages: [{ id: "s", table: repeater }], maxDrops: 2 });
    const resolved = pipeline.resolve({ ctx: {}, rng: seededRng(13) });
    expect(resolved.drops.length).toBe(2);
    expect(resolved.provenance.length).toBe(2);
    expect(resolved.stages.some((stage) => stage.stageId === "@cap")).toBe(true);
  });

  test("resolver: string table ids resolve against the injected resolver; unknown ids throw", () => {
    const pipeline = createLootPipeline(
      { id: "p", stages: [{ id: "world", table: "world_pool" }] },
      { resolveTable: registryResolver(worldPool) },
    );
    const resolved = pipeline.resolve({ ctx: {}, rng: seededRng(14) });
    expect(resolved.drops.length).toBe(1);

    const broken = createLootPipeline({ id: "b", stages: [{ id: "world", table: "missing" }] });
    expect(() => broken.resolve({ ctx: {}, rng: seededRng(1) })).toThrow(/unknown table/);
  });

  test("composition: world + dedicated boss pool + luck reads end-to-end", () => {
    const pipeline = createLootPipeline<RunContext>(
      {
        id: "encounter",
        stages: [
          { id: "world", table: "world_pool", modifiers: [luckModifier("rare_gem"), doubleCurrency] },
          { id: "boss", table: "boss_pool", when: (ctx) => ctx.isBoss },
        ],
      },
      { resolveTable: registryResolver(worldPool, dedicatedBossPool) },
    );
    const resolved = pipeline.resolve({ ctx: { isBoss: true, luck: 2 }, rng: seededRng(21), seed: 21 });
    // Two stages contributed (world always rolls once, boss gated in).
    const rolledStages = resolved.stages.filter((stage) => stage.status === "rolled");
    expect(rolledStages.map((stage) => stage.stageId)).toEqual(["world", "boss"]);
    expect(resolved.provenance.some((record) => record.stageId === "boss")).toBe(true);
  });
});
