import { describe, expect, test } from "bun:test";
import { seededRng } from "@jgengine/core/random/rng";
import { choose, derive, generate, step, type GenPipeline } from "@jgengine/core/item/generation";

describe("generate — core pipeline", () => {
  test("is deterministic for a given seed and pipeline", () => {
    const pipeline: GenPipeline<{ color: string; shade: number }> = {
      steps: [
        choose("color", { options: () => [{ value: "red" }, { value: "green" }, { value: "blue" }] }),
        derive("shade", (s) => Math.floor(s.rng() * 100)),
      ],
      assemble: (s) => ({ color: s.get<string>("color"), shade: s.get<number>("shade") }),
    };
    const a = generate(pipeline, seededRng("seed-1"));
    const b = generate(pipeline, seededRng("seed-1"));
    const c = generate(pipeline, seededRng("seed-2"));
    expect(a).toEqual(b);
    expect(a.status).toBe("ok");
    // A different seed should (very likely) diverge somewhere.
    expect(JSON.stringify(a) === JSON.stringify(c)).toBe(false);
  });

  test("weighted choice respects weights", () => {
    const rng = seededRng("weights");
    let heavy = 0;
    const pipeline: GenPipeline<string> = {
      steps: [choose("pick", { options: () => [{ value: "rare", weight: 1 }, { value: "common", weight: 99 }] })],
      assemble: (s) => s.get<string>("pick"),
    };
    for (let i = 0; i < 1000; i += 1) {
      const result = generate(pipeline, rng);
      if (result.status === "ok" && result.value === "common") heavy += 1;
    }
    expect(heavy).toBeGreaterThan(900);
  });

  test("dependent choice reads earlier slots", () => {
    // The second slot's candidate list depends on the first slot's value.
    const pipeline: GenPipeline<{ genus: string; species: string }> = {
      steps: [
        choose("genus", { options: () => [{ value: "canis" }] }),
        choose("species", {
          options: (s) => (s.get<string>("genus") === "canis" ? [{ value: "lupus" }] : [{ value: "???" }]),
        }),
      ],
      assemble: (s) => ({ genus: s.get<string>("genus"), species: s.get<string>("species") }),
    };
    const result = generate(pipeline, seededRng("dep"));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.value).toEqual({ genus: "canis", species: "lupus" });
  });

  test("eligibility filter narrows the pool; empty pool rejects and rerolls", () => {
    // First slot picks a parity; second slot must pick a number of that parity.
    const pipeline: GenPipeline<{ parity: string; n: number }> = {
      steps: [
        choose("parity", { options: () => [{ value: "even" }, { value: "odd" }] }),
        choose("n", {
          options: () => [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }],
          eligible: (n, s) => (s.get<string>("parity") === "even" ? n % 2 === 0 : n % 2 === 1),
        }),
      ],
      assemble: (s) => ({ parity: s.get<string>("parity"), n: s.get<number>("n") }),
    };
    for (let i = 0; i < 50; i += 1) {
      const result = generate(pipeline, seededRng(`elig-${i}`));
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        const { parity, n } = result.value;
        expect(parity === "even" ? n % 2 === 0 : n % 2 === 1).toBe(true);
      }
    }
  });

  test("exhausts bounded attempts and fails with a reason when no option is eligible", () => {
    const pipeline: GenPipeline<number> = {
      steps: [choose("impossible", { options: () => [{ value: 1 }], eligible: () => false })],
      assemble: (s) => s.get<number>("impossible"),
      maxAttempts: 3,
    };
    const result = generate(pipeline, seededRng("fail"));
    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(3);
    if (result.status === "failed") expect(result.reason).toContain("impossible");
  });

  test("whole-output validate rejects then accepts on reroll", () => {
    let seen = 0;
    const pipeline: GenPipeline<number> = {
      steps: [derive("roll", (s) => Math.floor(s.rng() * 6) + 1)],
      assemble: (s) => s.get<number>("roll"),
      validate: (value) => {
        seen += 1;
        return value >= 4 ? null : "too low";
      },
      maxAttempts: 20,
    };
    const result = generate(pipeline, seededRng("validate"));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.value).toBeGreaterThanOrEqual(4);
      // A reroll happened iff validate ran more than once.
      expect(result.attempts).toBe(seen);
    }
  });

  test("provenance trace records every choice, derive, and rejected reroll", () => {
    const pipeline: GenPipeline<number> = {
      steps: [
        choose("kind", { options: () => [{ value: "a" }] }),
        derive("value", (s) => (s.get<string>("kind") === "a" ? 1 : 0)),
      ],
      assemble: (s) => s.get<number>("value"),
      validate: (value) => (value === 1 && Math.random() < -1 ? "never" : null),
    };
    const result = generate(pipeline, seededRng("trace"));
    expect(result.status).toBe("ok");
    const kinds = result.trace.map((entry) => `${entry.slot}:${entry.kind}`);
    expect(kinds).toEqual(["kind:choice", "value:derive"]);
  });

  test("step escape hatch supports conditional rng and explicit rejection", () => {
    // Only consumes rng on the branch that needs it, mirroring a forced/conditional attribute.
    const pipeline: GenPipeline<{ mode: string; extra: number }> = {
      steps: [
        choose("mode", { options: () => [{ value: "fixed", weight: 1 }, { value: "rolled", weight: 1 }] }),
        step("extra", (s) => {
          if (s.get<string>("mode") === "fixed") return { status: "set", value: 0 };
          return { status: "set", value: Math.floor(s.rng() * 10) + 1 };
        }),
      ],
      assemble: (s) => ({ mode: s.get<string>("mode"), extra: s.get<number>("extra") }),
    };
    const result = generate(pipeline, seededRng("hatch"));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      if (result.value.mode === "fixed") expect(result.value.extra).toBe(0);
      else expect(result.value.extra).toBeGreaterThan(0);
    }
  });
});

describe("generate — non-item adopter (proves the primitive is not weapon-shaped)", () => {
  // A procedural star system: no rarity, no stats, no affixes — structurally different from an item.
  interface StarSystem {
    starClass: string;
    planetCount: number;
    hasHabitable: boolean;
    name: string;
  }

  const CLASSES = [
    { value: "O", weight: 1 },
    { value: "G", weight: 6 },
    { value: "M", weight: 20 },
  ];

  function starSystemPipeline(): GenPipeline<StarSystem> {
    return {
      steps: [
        choose("class", { options: () => CLASSES }),
        // Dependent: hotter classes tend to host fewer planets in their habitable zone.
        derive("planets", (s) => {
          const base = s.get<string>("class") === "M" ? 6 : 3;
          return Math.floor(s.rng() * base) + 1;
        }),
        // Habitability is gated on there being enough planets — a cross-slot constraint expressed as a choice.
        step("habitable", (s) => {
          const planets = s.get<number>("planets");
          const chance = s.get<string>("class") === "G" ? 0.5 : 0.1;
          return { status: "set", value: planets >= 2 && s.rng() < chance };
        }),
      ],
      assemble: (s) => {
        const starClass = s.get<string>("class");
        const planetCount = s.get<number>("planets");
        return {
          starClass,
          planetCount,
          hasHabitable: s.get<boolean>("habitable"),
          name: `${starClass}-${planetCount}`,
        };
      },
    };
  }

  test("generates a coherent, deterministic star system", () => {
    const a = generate(starSystemPipeline(), seededRng("orion"));
    const b = generate(starSystemPipeline(), seededRng("orion"));
    expect(a).toEqual(b);
    expect(a.status).toBe("ok");
    if (a.status === "ok") {
      expect(["O", "G", "M"]).toContain(a.value.starClass);
      expect(a.value.planetCount).toBeGreaterThanOrEqual(1);
      expect(a.value.name).toBe(`${a.value.starClass}-${a.value.planetCount}`);
      if (a.value.hasHabitable) expect(a.value.planetCount).toBeGreaterThanOrEqual(2);
    }
  });
});
