import { describe, expect, test } from "bun:test";

import { devtools } from "../devtools/devtools";
import { seededRng } from "../random/rng";
import { createNeedSet, type NeedSet } from "../sim/needs";
import {
  createUtilityBrain,
  sampleResponseCurve,
  type ResponseCurve,
  type UtilityBrain,
  type UtilityBrainConfig,
  type UtilityCandidate,
} from "./utilityBrain";

const HUNGER = { id: "hunger", max: 100, rate: 0.5 };
const FUN = { id: "fun", max: 100, rate: 0.2 };

/** Cost units are meters of travel: 0.05 score points per meter. */
function agentConfig(needs: NeedSet, overrides: Partial<UtilityBrainConfig> = {}): UtilityBrainConfig {
  return {
    needs,
    costWeight: 0.05,
    switchMargin: 0.08,
    options: [
      { id: "eat", base: 0.05, terms: [{ need: "hunger", curve: { kind: "linear", from: 0.1, to: 0.85 }, weight: 1.6 }] },
      { id: "play", base: 0.45, terms: [{ need: "fun", curve: { kind: "linear", from: 0.1, to: 0.9 }, weight: 0.6 }] },
    ],
    ...overrides,
  };
}

/** The snack bar is far; the arcade is next door. */
const CANDIDATES: readonly UtilityCandidate[] = [
  { option: "play", cost: 2 },
  { option: "eat", cost: 12 },
];

describe("createUtilityBrain", () => {
  test("a hungry agent walks past the closer fun to eat; a sated one does not", () => {
    const hungryNeeds = createNeedSet([{ ...HUNGER, start: 10 }, { ...FUN, start: 60 }]);
    const hungry = createUtilityBrain(agentConfig(hungryNeeds));
    expect(hungry.decide(CANDIDATES)).toMatchObject({ option: "eat", reason: "initial" });
    expect(hungry.decide(CANDIDATES).score).toBeCloseTo(1.05, 5);

    const satedNeeds = createNeedSet([{ ...HUNGER, start: 95 }, { ...FUN, start: 60 }]);
    const sated = createUtilityBrain(agentConfig(satedNeeds));
    expect(sated.decide(CANDIDATES)).toMatchObject({ option: "play", reason: "initial" });
    expect(sated.decide(CANDIDATES).score).toBeCloseTo(0.575, 5);

    // Same options, same distances: only the need state moved the pick.
    expect(hungry.scoreOf("eat")).toBeGreaterThan(sated.scoreOf("eat"));
    expect(sated.scoreOf("eat")).toBeCloseTo(0.05, 5);
  });

  test("hysteresis holds the pick until a rival clears the margin, then switches once", () => {
    const needs = createNeedSet([{ ...HUNGER, rate: 20, start: 80 }, { ...FUN, start: 80 }]);
    const brain = createUtilityBrain(agentConfig(needs));
    const ticks: { pick: string; hunger: number }[] = [];
    const switches: string[] = [];
    for (let tick = 0; tick < 12; tick += 1) {
      brain.advance(0.5);
      const decision = brain.decide(CANDIDATES);
      ticks.push({ pick: decision.option ?? "none", hunger: needs.fraction("hunger") });
      if (decision.changed) switches.push(`${decision.option}:${decision.reason}`);
      expect(decision.interrupted).toBe(false);
    }
    // hunger drains 10 points per 0.5 s tick; food only wins once hunger is under ~36%.
    expect(ticks.filter((entry) => entry.hunger > 0.36).every((entry) => entry.pick === "play")).toBe(true);
    expect(ticks.find((entry) => entry.pick === "eat")?.hunger).toBeLessThanOrEqual(0.36);
    expect(ticks.slice(ticks.findIndex((entry) => entry.pick === "eat")).every((entry) => entry.pick === "eat")).toBe(true);
    expect(switches).toEqual(["play:initial", "eat:score"]);
  });

  test("an interrupt overrides margin and hold time on the tick it crosses", () => {
    const needs = createNeedSet([{ ...HUNGER, start: 60 }, { ...FUN, start: 80 }]);
    const brain = createUtilityBrain(
      agentConfig(needs, {
        switchMargin: 10,
        minHoldSeconds: 30,
        interrupts: [{ need: "hunger", at: 0.15, option: "eat" }],
      }),
    );
    expect(brain.decide(CANDIDATES).option).toBe("play");

    needs.restore({ values: { hunger: 40, fun: 80 }, rates: {}, modifiers: {} });
    expect(brain.decide(CANDIDATES)).toMatchObject({ option: "play", interrupted: false });

    needs.restore({ values: { hunger: 10, fun: 80 }, rates: {}, modifiers: {} });
    expect(brain.decide(CANDIDATES)).toMatchObject({ option: "eat", reason: "interrupt", interrupted: true });
  });

  test("minHoldSeconds delays a winning rival", () => {
    const needs = createNeedSet([{ ...HUNGER, start: 95 }, { ...FUN, start: 60 }]);
    const brain = createUtilityBrain(agentConfig(needs, { minHoldSeconds: 4 }));
    expect(brain.decide(CANDIDATES).option).toBe("play");

    needs.restore({ values: { hunger: 5, fun: 60 }, rates: {}, modifiers: {} });
    expect(brain.decide(CANDIDATES).option).toBe("play");
    brain.advance(2);
    expect(brain.decide(CANDIDATES).option).toBe("play");
    brain.advance(2.1);
    expect(brain.decide(CANDIDATES)).toMatchObject({ option: "eat", reason: "score" });
  });

  test("a pick that leaves the candidate list re-decides instead of stalling", () => {
    const needs = createNeedSet([{ ...HUNGER, start: 10 }, { ...FUN, start: 60 }]);
    const brain = createUtilityBrain(agentConfig(needs));
    expect(brain.decide(CANDIDATES).option).toBe("eat");
    expect(brain.decide([{ option: "play", cost: 2 }])).toMatchObject({
      option: "play",
      reason: "unavailable",
      changed: true,
    });
  });

  test("no reachable candidate holds the pick and reports null on a fresh brain", () => {
    const needs = createNeedSet([{ ...HUNGER, start: 10 }, { ...FUN, start: 60 }]);
    const brain = createUtilityBrain(agentConfig(needs));
    expect(brain.decide([{ option: "unknown" }])).toMatchObject({ option: null, reason: null, changed: false });
    expect(brain.chosen()).toBeNull();
  });

  test("snapshot/restore round-trips the pick and the retuned dials", () => {
    const needs = createNeedSet([{ ...HUNGER, start: 10 }, { ...FUN, start: 60 }]);
    const brain = createUtilityBrain(agentConfig(needs));
    brain.decide(CANDIDATES);
    brain.retune({ switchMargin: 0.2, minHoldSeconds: 3, costWeight: 0.02 });

    const saved = brain.snapshot();
    const replay = createUtilityBrain(agentConfig(createNeedSet([{ ...HUNGER, start: 95 }, { ...FUN, start: 60 }])));
    replay.decide(CANDIDATES);
    replay.restore(saved);

    expect(replay.chosen()).toBe("eat");
    expect(replay.snapshot()).toEqual(saved);
    expect(replay.decide(CANDIDATES)).toMatchObject({ option: "eat", changed: false });
  });

  test("seeded jitter replays identically and stays inside its amplitude", () => {
    const run = (): string[] => {
      const needs = createNeedSet([{ ...HUNGER, start: 50 }, { ...FUN, start: 50 }]);
      const brain = createUtilityBrain(agentConfig(needs, { jitter: 0.02, rng: seededRng("guests") }));
      const picks: string[] = [];
      for (let tick = 0; tick < 40; tick += 1) {
        brain.advance(0.5);
        picks.push(brain.decide(CANDIDATES).option ?? "none");
      }
      return picks;
    };
    expect(run()).toEqual(run());
  });

  test("rejects configuration that names an undeclared need or option", () => {
    const needs = createNeedSet([HUNGER]);
    expect(() => createUtilityBrain({ needs, options: [{ id: "eat", terms: [{ need: "thirst", curve: { kind: "linear", from: 0, to: 1 } }] }] })).toThrow(
      'scores need "thirst"',
    );
    expect(() => createUtilityBrain({ needs, options: [{ id: "eat" }, { id: "eat" }] })).toThrow("duplicate utility option");
    expect(() => createUtilityBrain({ needs, options: [{ id: "eat" }], interrupts: [{ need: "hunger", at: 0.2, option: "sleep" }] })).toThrow(
      'forces unknown option "sleep"',
    );
  });

  test("the devtools probe shows the live pick and unregisters on dispose", () => {
    const needs = createNeedSet([{ ...HUNGER, start: 10 }, { ...FUN, start: 60 }]);
    const brain = createUtilityBrain(agentConfig(needs, { devtoolsName: "utility:guest-1" }));
    brain.decide(CANDIDATES);
    expect(String(devtools.probes.read()["utility:guest-1"])).toContain("eat");
    brain.dispose();
    expect(devtools.probes.read()["utility:guest-1"]).toBeUndefined();
  });
});

describe("sampleResponseCurve", () => {
  const curves: readonly ResponseCurve[] = [
    { kind: "linear", from: 0.2, to: 0.8 },
    { kind: "quadratic", from: 0.2, to: 0.8, exponent: 3 },
    { kind: "logistic", midpoint: 0.4, steepness: 20 },
    { kind: "exponential", rate: 4 },
  ];

  test("every urgency curve is 1 when empty, 0 when full, and falls in between", () => {
    for (const curve of curves) {
      expect(sampleResponseCurve(curve, 0)).toBeCloseTo(1, 6);
      expect(sampleResponseCurve(curve, 1)).toBe(0);
      expect(sampleResponseCurve(curve, 0.5)).toBeGreaterThan(0);
      expect(sampleResponseCurve(curve, 0.5)).toBeLessThan(1);
    }
  });

  test("curve shape changes how early an agent reacts to the same need", () => {
    const linear = { kind: "linear", from: 0, to: 1 } as const;
    const quadratic = { kind: "quadratic", from: 0, to: 1 } as const;
    const logistic = { kind: "logistic", midpoint: 0.5, steepness: 20 } as const;
    expect(sampleResponseCurve(quadratic, 0.5)).toBeLessThan(sampleResponseCurve(linear, 0.5));
    expect(sampleResponseCurve(logistic, 0.5)).toBeCloseTo(0.5, 6);
    expect(sampleResponseCurve(logistic, 0.2)).toBeGreaterThan(0.99);  });

  test("threshold steps and clamps out-of-range input", () => {
    const threshold: ResponseCurve = { kind: "threshold", at: 0.25, value: 0.7 };
    expect(sampleResponseCurve(threshold, 0.25)).toBe(0.7);
    expect(sampleResponseCurve(threshold, 0.26)).toBe(0);
    expect(sampleResponseCurve(threshold, -3)).toBe(0.7);
    expect(sampleResponseCurve(threshold, 9)).toBe(0);
  });
});

describe("1,000-agent utility tick budget", () => {
  const AGENTS = 1000;
  const NEEDS = [
    { id: "hunger", max: 100, rate: 0.8 },
    { id: "energy", max: 100, rate: 0.5 },
    { id: "fun", max: 100, rate: 0.3 },
  ];
  const OPTIONS = [
    { id: "eat", base: 0.05, terms: [{ need: "hunger", curve: { kind: "linear" as const, from: 0.15, to: 0.9 }, weight: 1.6 }] },
    { id: "sleep", base: 0.1, terms: [{ need: "energy", curve: { kind: "quadratic" as const, from: 0.2, to: 0.9 }, weight: 1.2 }] },
    { id: "play", base: 0.4, terms: [{ need: "fun", curve: { kind: "linear" as const, from: 0.1, to: 0.9 }, weight: 0.6 }] },
  ];
  const CANDIDATES: readonly UtilityCandidate[] = [
    { option: "play", cost: 3 },
    { option: "eat", cost: 11 },
    { option: "sleep", cost: 7 },
  ];

  function buildCrowd(): UtilityBrain[] {
    const brains: UtilityBrain[] = [];
    for (let index = 0; index < AGENTS; index += 1) {
      const needs = createNeedSet([
        { ...NEEDS[0]!, start: 100 - (index % 90) },
        { ...NEEDS[1]!, start: 100 - (index % 70) },
        { ...NEEDS[2]!, start: 100 - (index % 50) },
      ]);
      brains.push(createUtilityBrain({ needs, costWeight: 0.05, switchMargin: 0.08, options: OPTIONS }));
    }
    return brains;
  }

  test("1,000 agents decide in under 1 ms per tick", () => {
    const brains = buildCrowd();
    const tick = (): void => {
      for (const brain of brains) {
        brain.advance(1 / 60);
        brain.decide(CANDIDATES);
      }
    };
    for (let warmup = 0; warmup < 20; warmup += 1) tick();

    const TICKS = 200;
    const samples: number[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const start = performance.now();
      for (let run = 0; run < TICKS; run += 1) tick();
      samples.push((performance.now() - start) / TICKS);
    }
    samples.sort((a, b) => a - b);
    const median = samples[2]!;
    console.log(`utility tick for ${AGENTS} agents: ${median.toFixed(4)} ms median (samples ${samples.map((s) => s.toFixed(4)).join(", ")})`);
    expect(median).toBeLessThan(1);
  });
});
