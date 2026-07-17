import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import { createItemInstanceRegistry, proceduralLootEntry } from "./itemInstanceRegistry";
import { generate, type GenResult, type GenSchema } from "./itemgen";

/**
 * Schema A — an item-shaped generator: weighted rarity, a uniform material, an optional dependent
 * gem slot, and stat transforms scaled by rarity under a power budget. Uses field transforms.
 */
const RELIC_SCHEMA: GenSchema = {
  steps: [
    {
      id: "rarity",
      select: "weighted",
      pool: [
        { id: "common", value: { mult: 1 }, weight: 100 },
        { id: "rare", value: { mult: 1.5 }, weight: 20 },
        { id: "legendary", value: { mult: 2.2 }, weight: 3 },
      ],
    },
    {
      id: "material",
      select: "uniform",
      pool: [
        { id: "iron", value: { power: 10 } },
        { id: "obsidian", value: { power: 16 } },
      ],
    },
    {
      id: "gem",
      optional: true,
      // Only legendary relics may socket a gem (constraint on a dependent, optional slot).
      accept: (_option, choices) => choices.optionId("rarity") === "legendary",
      pool: [{ id: "ruby", value: { power: 8 } }],
    },
  ],
  transforms: [
    {
      id: "base",
      apply: (api) => {
        const material = api.choices.value<{ power: number }>("material");
        api.set("power", material?.power ?? 0, "material base");
      },
    },
    {
      id: "rarity-scale",
      apply: (api) => {
        const rarity = api.choices.value<{ mult: number }>("rarity");
        api.mul("power", rarity?.mult ?? 1, "rarity multiplier");
      },
    },
    {
      id: "gem-bonus",
      apply: (api) => {
        const gem = api.choices.value<{ power: number }>("gem");
        if (gem !== undefined) api.add("power", gem.power, "socketed gem");
      },
    },
  ],
  validate: [(draft) => draft.fields.power <= 60],
};

/**
 * Schema B — a structurally different, non-item generator (a quest) that forces backtracking:
 * `sigil` must equal "moon", but the search reaches it only after revisiting an earlier `omen` pick.
 * No transforms, no numeric fields — proves the seam is not weapon/stat-shaped.
 */
const QUEST_SCHEMA: GenSchema = {
  steps: [
    { id: "omen", select: "uniform", pool: [{ id: "sun", value: "sun" }, { id: "moon", value: "moon" }] },
    { id: "giver", select: "uniform", pool: [{ id: "elder", value: "elder" }, { id: "hermit", value: "hermit" }] },
    {
      id: "sigil",
      select: "uniform",
      // Only satisfiable when omen resolved to "moon"; a "sun" omen leaves zero eligible sigils,
      // so the solver must backtrack and re-pick the omen.
      accept: (_option, choices) => choices.optionId("omen") === "moon",
      pool: [{ id: "crescent", value: "crescent" }],
    },
  ],
};

describe("itemgen — deterministic composable generation", () => {
  test("identical seed and schema reproduce an identical result (determinism)", () => {
    const a = generate(RELIC_SCHEMA, seededRng("relic-1"));
    const b = generate(RELIC_SCHEMA, seededRng("relic-1"));
    expect(a).toEqual(b);
    const c = generate(RELIC_SCHEMA, seededRng("relic-2"));
    // Different seed generally diverges somewhere across choices or fields.
    expect(a).not.toEqual(c);
  });

  test("result serializes and round-trips through JSON unchanged", () => {
    const outcome = generate(RELIC_SCHEMA, seededRng("relic-serialize"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const roundTripped = JSON.parse(JSON.stringify(outcome.result)) as GenResult;
    expect(roundTripped).toEqual(outcome.result);
  });

  test("constraints always hold in the output across many seeds", () => {
    for (let index = 0; index < 300; index += 1) {
      const outcome = generate(RELIC_SCHEMA, seededRng(`relic-c-${index}`));
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      const { choices, fields } = outcome.result;
      // The optional gem slot is only ever filled on legendary relics.
      if (choices.gem !== undefined) expect(choices.rarity).toBe("legendary");
      // The validator's power budget is never exceeded.
      expect(fields.power).toBeLessThanOrEqual(60);
    }
  });

  test("backtracking recovers a valid assignment and records the rerolls in provenance", () => {
    // Every seed must resolve the forced constraint rather than fail.
    for (let index = 0; index < 100; index += 1) {
      const outcome = generate(QUEST_SCHEMA, seededRng(`quest-${index}`));
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.result.choices.omen).toBe("moon");
      expect(outcome.result.choices.sigil).toBe("crescent");
    }
    // A seed whose first omen pick is "sun" proves the omen step was re-tried.
    const backtracked = [...Array(50).keys()]
      .map((index) => generate(QUEST_SCHEMA, seededRng(`quest-${index}`)))
      .find((outcome) => outcome.ok && outcome.result.provenance.choices.some((c) => c.step === "omen" && c.rerolls > 0));
    expect(backtracked).toBeDefined();
  });

  test("provenance explains every step and transform", () => {
    const outcome = generate(RELIC_SCHEMA, seededRng("relic-prov"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { provenance, fields } = outcome.result;
    expect(provenance.attempts).toBeGreaterThanOrEqual(1);
    // One choice record per resolved step (rarity, material, and gem — filled or skipped).
    expect(provenance.choices.map((c) => c.step)).toEqual(["rarity", "material", "gem"]);
    // Field records trace back only to real transforms, and the final field matches the last write.
    for (const record of provenance.fields) expect(["base", "rarity-scale", "gem-bonus"]).toContain(record.transform);
    const lastPower = [...provenance.fields].reverse().find((r) => r.field === "power");
    expect(lastPower?.to).toBe(fields.power);
  });

  test("pin forces a step and stays deterministic", () => {
    const forced = generate(RELIC_SCHEMA, seededRng("relic-pin"), { pin: { rarity: "legendary" } });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.result.choices.rarity).toBe("legendary");
    const again = generate(RELIC_SCHEMA, seededRng("relic-pin"), { pin: { rarity: "legendary" } });
    expect(again).toEqual(forced);
  });

  test("validation rerolls until a draft passes, and reports rejection when impossible", () => {
    let attempts = 0;
    const rerollSchema: GenSchema = {
      steps: [{ id: "n", select: "uniform", pool: [{ id: "a", value: 1 }, { id: "b", value: 2 }, { id: "c", value: 3 }] }],
      validate: [
        () => {
          attempts += 1;
          // Reject the first two drafts, accept the third.
          return attempts >= 3;
        },
      ],
    };
    const ok = generate(rerollSchema, seededRng("reroll"));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.result.provenance.attempts).toBe(3);

    const impossible: GenSchema = {
      steps: [{ id: "n", pool: [{ id: "a", value: 1 }] }],
      validate: [() => false],
      maxAttempts: 5,
    };
    const rejected = generate(impossible, seededRng("impossible"));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reason).toBe("rejected");
      expect(rejected.attempts).toBe(5);
    }
  });

  test("reports unsatisfiable when constraints leave no assignment", () => {
    const unsat: GenSchema = {
      steps: [{ id: "x", pool: [{ id: "only", value: 1 }], accept: () => false }],
    };
    const outcome = generate(unsat, seededRng("unsat"));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("unsatisfiable");
  });

  test("composes with the procedural loot seam", () => {
    const registry = createItemInstanceRegistry<GenResult>("relic");
    const entry = proceduralLootEntry(registry, (rng) => {
      const outcome = generate(RELIC_SCHEMA, rng);
      if (!outcome.ok) throw new Error("relic roll failed");
      return { baseId: outcome.result.choices.material ?? "relic", def: outcome.result };
    });
    const id = entry(seededRng("loot"));
    expect(registry.has(id)).toBe(true);
    expect(registry.get(id)?.provenance.attempts).toBeGreaterThanOrEqual(1);
  });
});
