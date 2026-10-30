import { describe, expect, test } from "bun:test";

import {
  createAttackClock,
  createBuildPlanner,
  missingRequirements,
  resolveTechPath,
  type BuildCatalog,
  type BuildDecision,
  type BuildPlanConfig,
  type BuildPlanner,
  type BuildPlannerView,
} from "./buildOrder";
import { difficultyProfile, type DifficultyProfile } from "./difficulty";
import { seededRng } from "../random/rng";

/** The test's own tier list, the way a game supplies one. */
const TIERS: Readonly<Record<"easy" | "expert", DifficultyProfile>> = {
  easy: {
    reactionSeconds: 0.9,
    decisionNoise: 0.35,
    executionJitter: 0.3,
    abilityDiscipline: 0.2,
    perceptionScale: 0.7,
    planDepth: 1,
    planWidth: 2,
  },
  expert: {
    reactionSeconds: 0.08,
    decisionNoise: 0,
    executionJitter: 0.02,
    abilityDiscipline: 0.85,
    perceptionScale: 1.3,
    planDepth: 4,
    planWidth: 8,
  },
};

const catalog: BuildCatalog = {
  town_hall: { kind: "building", cost: { gold: 400 }, supplyProvided: 10 },
  peon: { kind: "unit", cost: { gold: 50 }, supply: 1, producer: "town_hall" },
  farm: { kind: "building", cost: { gold: 80, wood: 20 }, supplyProvided: 8 },
  barracks: { kind: "building", cost: { gold: 150 } },
  grunt: { kind: "unit", cost: { gold: 100 }, supply: 2, producer: "barracks" },
  archer: { kind: "unit", cost: { gold: 80 }, supply: 1, producer: "barracks" },
  war_mill: { kind: "building", cost: { gold: 200 }, requires: ["barracks"] },
  smithing: { kind: "research", cost: { gold: 100 }, producer: "war_mill" },
  stables: { kind: "building", cost: { gold: 150 }, requires: ["war_mill"] },
  knight: { kind: "unit", cost: { gold: 200 }, supply: 3, producer: "stables", requires: ["smithing"] },
};

interface World {
  balances: Record<string, number>;
  owned: Record<string, number>;
  pending: Record<string, number>;
  supply: { used: number; cap: number };
  idleProducers?: Record<string, number>;
}

const world = (owned: Record<string, number> = { town_hall: 1 }, gold = 100_000, cap = 10): World => ({
  balances: { gold, wood: 100_000 },
  owned: { ...owned },
  pending: {},
  supply: { used: 0, cap },
});

const view = (w: World, time = 0): BuildPlannerView => ({ time, ...w });

/** Applies a make instantly: pay, own, consume or provide supply. */
const apply = (w: World, decision: BuildDecision): void => {
  if (decision.kind !== "make") return;
  const entry = catalog[decision.id]!;
  for (const [currency, amount] of Object.entries(entry.cost)) w.balances[currency]! -= amount;
  w.owned[decision.id] = (w.owned[decision.id] ?? 0) + 1;
  w.supply.used += entry.kind === "unit" ? (entry.supply ?? 0) : 0;
  w.supply.cap += entry.supplyProvided ?? 0;
};

const run = (planner: BuildPlanner, w: World, decisions: number, dt = 1): BuildDecision[] => {
  const out: BuildDecision[] = [];
  for (let i = 0; i < decisions; i++) {
    const decision = planner.decide(view(w, i * dt), dt);
    apply(w, decision);
    out.push(decision);
  }
  return out;
};

const made = (decisions: readonly BuildDecision[]): string[] =>
  decisions.flatMap((d) => (d.kind === "make" ? [d.id] : []));

describe("requirements and tech path", () => {
  test("missingRequirements lists unmet requires and the producer", () => {
    expect(missingRequirements(catalog, "knight", { owned: {} })).toEqual(["smithing", "stables"]);
    expect(missingRequirements(catalog, "knight", { owned: { smithing: 1, stables: 1 } })).toEqual([]);
  });

  test("the path to an unmet want starts at its deepest missing prerequisite", () => {
    expect(resolveTechPath(catalog, "knight", { owned: { town_hall: 1 }, pending: {} })).toEqual({
      status: "ready",
      id: "barracks",
    });
    expect(
      resolveTechPath(catalog, "knight", { owned: { town_hall: 1, barracks: 1 }, pending: { war_mill: 1 } }),
    ).toEqual({ status: "pending", id: "war_mill" });
  });

  test("a cycle is blocked when resolving and rejected when planning", () => {
    const cyclic: BuildCatalog = {
      a: { kind: "building", cost: {}, requires: ["b"] },
      b: { kind: "building", cost: {}, requires: ["a"] },
    };
    expect(resolveTechPath(cyclic, "a", { owned: {}, pending: {} }).status).toBe("blocked");
    expect(() => createBuildPlanner({ catalog: cyclic })).toThrow(/cycle/);
    expect(() => createBuildPlanner({ catalog, steps: [{ make: "dragon" }] })).toThrow(/unknown id "dragon"/);
  });
});

describe("build planner", () => {
  test("follows the build order in order, then reports done", () => {
    const planner = createBuildPlanner({
      catalog,
      steps: [{ make: "peon", count: 3 }, { make: "barracks" }, { make: "grunt", count: 2 }],
    });
    const decisions = run(planner, world(), 7);
    expect(made(decisions)).toEqual(["peon", "peon", "peon", "barracks", "grunt", "grunt"]);
    expect(decisions.every((d) => d.kind !== "make" || d.reason === "order")).toBe(true);
    expect(decisions[6]).toEqual({ kind: "wait", reason: "done" });
  });

  test("inserts the tech path for a step whose requirements are unmet", () => {
    const planner = createBuildPlanner({ catalog, steps: [{ make: "knight" }] });
    const decisions = run(planner, world(), 5).filter((d) => d.kind === "make");
    expect(decisions).toEqual([
      { kind: "make", id: "barracks", reason: "requirement" },
      { kind: "make", id: "war_mill", reason: "requirement" },
      { kind: "make", id: "smithing", reason: "requirement" },
      { kind: "make", id: "stables", reason: "requirement" },
      { kind: "make", id: "knight", reason: "order" },
    ]);
  });

  test("waits on a prerequisite already in progress", () => {
    const planner = createBuildPlanner({ catalog, steps: [{ make: "knight" }] });
    const w = world({ town_hall: 1, barracks: 1 });
    w.pending.war_mill = 1;
    expect(planner.decide(view(w), 0)).toEqual({ kind: "wait", reason: "requirement", id: "war_mill" });
  });

  test("makes the cheapest supply provider before a supply block", () => {
    const config: BuildPlanConfig = { catalog, composition: { grunt: 1 }, supplyBuffer: 2 };
    const w = world({ town_hall: 1, barracks: 1 });
    w.supply.used = 9;
    expect(createBuildPlanner(config).decide(view(w), 0)).toEqual({ kind: "make", id: "farm", reason: "supply" });

    const unbuffered = createBuildPlanner({ catalog, composition: { grunt: 1 } });
    expect(unbuffered.decide(view(w), 0)).toEqual({ kind: "make", id: "farm", reason: "supply" });

    w.pending.farm = 1;
    expect(createBuildPlanner(config).decide(view(w), 0)).toEqual({ kind: "make", id: "grunt", reason: "composition" });

    const limited = createBuildPlanner({ ...config, supplyLimit: 10 });
    delete w.pending.farm;
    expect(limited.decide(view(w), 0)).toEqual({ kind: "wait", reason: "supply", id: "farm" });
  });

  test("never runs into a supply block over a long sustain", () => {
    const planner = createBuildPlanner({
      catalog,
      workers: { id: "peon", target: 8 },
      composition: { grunt: 1 },
      supplyBuffer: 3,
    });
    const decisions = run(planner, world({ town_hall: 1, barracks: 1 }), 60);
    expect(decisions.some((d) => d.kind === "wait" && d.reason === "supply")).toBe(false);
    expect(made(decisions).filter((id) => id === "farm").length).toBeGreaterThan(3);
  });

  test("sustain composition converges to the weights", () => {
    const planner = createBuildPlanner({ catalog, composition: { grunt: 2, archer: 1 }, supplyLimit: 1000 });
    const w = world({ town_hall: 1, barracks: 1 }, 100_000, 1000);
    run(planner, w, 30);
    expect(w.owned.grunt).toBe(20);
    expect(w.owned.archer).toBe(10);
  });

  test("skips a composition unit whose producer is busy", () => {
    const planner = createBuildPlanner({ catalog, composition: { grunt: 1, peon: 1 } });
    const w = world({ town_hall: 1, barracks: 1 });
    w.idleProducers = { barracks: 0, town_hall: 1 };
    expect(planner.decide(view(w), 0)).toEqual({ kind: "make", id: "peon", reason: "composition" });
    w.idleProducers = { barracks: 0, town_hall: 0 };
    expect(planner.decide(view(w), 0)).toEqual({ kind: "wait", reason: "producer", id: "barracks" });
  });

  test("decision noise sometimes picks a worse composition option", () => {
    let i = 0;
    const draws = [0.1, 0.99];
    const planner = createBuildPlanner(
      { catalog, composition: { grunt: 1, archer: 1 } },
      { profile: difficultyProfile(TIERS, "easy", { reactionSeconds: 0 }), rng: () => draws[i++ % 2]! },
    );
    const w = world({ town_hall: 1, barracks: 1, archer: 3 });
    expect(planner.decide(view(w), 0)).toEqual({ kind: "make", id: "archer", reason: "composition" });
  });

  test("saving waits for the wanted thing; floating spends on something cheaper", () => {
    const config: BuildPlanConfig = { catalog, steps: [{ make: "barracks" }], workers: { id: "peon", target: 10 } };
    const poor = world(undefined, 90);
    expect(createBuildPlanner({ ...config, saveFor: true }).decide(view(poor), 0)).toEqual({
      kind: "wait",
      reason: "afford",
      id: "barracks",
    });
    expect(createBuildPlanner({ ...config, saveFor: false }).decide(view(poor), 0)).toEqual({
      kind: "make",
      id: "peon",
      reason: "workers",
    });
    expect(createBuildPlanner(config, { profile: TIERS.easy }).tuning().saveFor).toBe(false);
    expect(createBuildPlanner(config, { profile: TIERS.expert }).tuning().saveFor).toBe(true);
  });

  test("easy decides less often than expert over the same span", () => {
    const decisionsOver = (tier: "easy" | "expert"): number => {
      const planner = createBuildPlanner(
        { catalog, workers: { id: "peon", target: 1000 }, supplyBuffer: 2 },
        { profile: TIERS[tier] },
      );
      const w = world();
      let acted = 0;
      for (let frame = 0; frame < 60 * 30; frame++) {
        const decision = planner.decide(view(w, frame / 30), 1 / 30);
        apply(w, decision);
        if (decision.kind === "make") acted++;
      }
      return acted;
    };
    const easy = decisionsOver("easy");
    const expert = decisionsOver("expert");
    expect(easy).toBeGreaterThan(20);
    expect(expert).toBeGreaterThan(easy * 5);
    const easyTuning = createBuildPlanner({ catalog }, { profile: TIERS.easy }).tuning();
    expect(easyTuning.decisionInterval).toBeCloseTo(1.8);
    expect(easyTuning.decisionNoise).toBe(TIERS.easy.decisionNoise);
  });

  test("snapshot and restore resume identically", () => {
    const config: BuildPlanConfig = {
      catalog,
      steps: [{ make: "peon", count: 4 }, { make: "barracks" }, { make: "knight" }],
      workers: { id: "peon", target: 12 },
      composition: { grunt: 2, archer: 1, knight: 1 },
      supplyBuffer: 3,
    };
    const options = () => ({ profile: TIERS.easy, rng: seededRng(7) });
    const original = createBuildPlanner(config, options());
    const w = world(undefined, 3000);
    const tick = (planner: BuildPlanner, target: World, frames: number, start: number): BuildDecision[] => {
      const out: BuildDecision[] = [];
      for (let f = 0; f < frames; f++) {
        target.balances.gold! += 20;
        const decision = planner.decide(view(target, (start + f) * 0.25), 0.25);
        apply(target, decision);
        out.push(decision);
      }
      return out;
    };
    tick(original, w, 40, 0);
    const saved = JSON.parse(JSON.stringify(original.snapshot()));
    const savedWorld: World = JSON.parse(JSON.stringify(w));
    const expected = tick(original, w, 200, 40);

    const resumed = createBuildPlanner(config, { profile: TIERS.easy, rng: seededRng(999) });
    resumed.restore(saved);
    expect(tick(resumed, savedWorld, 200, 40)).toEqual(expected);
  });

  test("retune swaps the plan mid-game", () => {
    const planner = createBuildPlanner({ catalog, composition: { grunt: 1 } });
    const w = world({ town_hall: 1, barracks: 1 });
    expect(planner.decide(view(w), 0)).toMatchObject({ id: "grunt" });
    planner.retune({ catalog, composition: { archer: 1 } }, TIERS.expert);
    expect(planner.tuning().decisionInterval).toBeCloseTo(0.16);
    expect(planner.decide(view(w), 1)).toMatchObject({ id: "archer" });
  });
});

describe("attack clock", () => {
  test("waves grow, wait for firstAt, and honour maxWait", () => {
    const clock = createAttackClock({ firstAt: 60, minArmy: 10, growPerWave: 5, maxWait: 90 });
    expect(clock.decide({ time: 30, armySupply: 50 })).toMatchObject({ launch: false, reason: "early" });
    expect(clock.decide({ time: 60, armySupply: 5 })).toMatchObject({ launch: false, reason: "gathering", need: 10 });
    expect(clock.decide({ time: 61, armySupply: 10 })).toEqual({ launch: true, wave: 1, need: 10, reason: "army" });
    expect(clock.decide({ time: 70, armySupply: 12 })).toMatchObject({ launch: false, wave: 2, need: 15 });
    expect(clock.decide({ time: 80, armySupply: 15 })).toMatchObject({ launch: true, wave: 2, reason: "army" });

    const saved = clock.snapshot();
    expect(clock.decide({ time: 169, armySupply: 3 })).toMatchObject({ launch: false, need: 20 });
    expect(clock.decide({ time: 170, armySupply: 0 })).toMatchObject({ launch: false });
    expect(clock.decide({ time: 170, armySupply: 3 })).toEqual({ launch: true, wave: 3, need: 20, reason: "maxWait" });

    clock.restore(saved);
    expect(clock.snapshot()).toEqual({ launched: 2, lastLaunchAt: 80 });
    expect(clock.decide({ time: 170, armySupply: 3 })).toMatchObject({ launch: true, wave: 3 });
  });

  test("minGap spaces waves and retune changes the policy", () => {
    const clock = createAttackClock({ firstAt: 0, minArmy: 1, minGap: 30 });
    expect(clock.decide({ time: 0, armySupply: 5 }).launch).toBe(true);
    expect(clock.decide({ time: 10, armySupply: 5 })).toMatchObject({ launch: false, reason: "early" });
    clock.retune({ firstAt: 0, minArmy: 1, minGap: 5 });
    expect(clock.decide({ time: 10, armySupply: 5 }).launch).toBe(true);
  });
});
