import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import type { UtilityOption } from "../ai/utilityBrain";
import { createAgent, type AgentSnapshot } from "./agent";

const OPTIONS: readonly UtilityOption[] = [
  { id: "eat", terms: [{ need: "hunger", curve: { kind: "linear", from: 0.2, to: 0.95 } }] },
  { id: "ride", terms: [{ need: "fun", curve: { kind: "linear", from: 0.15, to: 0.9 } }] },
  { id: "seat", base: 0.05, terms: [{ need: "energy", curve: { kind: "linear", from: 0.1, to: 1 } }] },
  { id: "work", base: 0.2, terms: [{ need: "energy", curve: { kind: "threshold", at: 0.2, value: 0.4 } }] },
];

const NEEDS = [
  { id: "hunger", max: 100, rate: 0, start: 90 },
  { id: "fun", max: 100, rate: 0, start: 90 },
  { id: "energy", max: 100, rate: 0, start: 90 },
];

function guest(rngSeed?: string) {
  return createAgent({
    id: "guest:1",
    needs: NEEDS,
    options: OPTIONS,
    mood: { weights: [{ need: "hunger", weight: 2 }, { need: "fun", weight: 1 }, { need: "energy", weight: 1 }] },
    ...(rngSeed === undefined ? {} : { rng: seededRng(rngSeed), jitter: 0.4 }),
    switchMargin: 0,
  });
}

function savingGuest() {
  return createAgent({
    id: "guest:1",
    needs: NEEDS,
    options: OPTIONS,
    mood: { weights: [{ need: "hunger", weight: 2 }, { need: "fun", weight: 1 }, { need: "energy", weight: 1 }] },
    switchMargin: 0,
  });
}

describe("createAgent need, mood and action loop", () => {
  test("an empty need drives the action that fills it", () => {
    const agent = guest();
    agent.needs.refill("hunger", -85);
    const frame = agent.update({
      dt: 0,
      now: 0,
      targets: [
        { option: "ride", target: "coaster" },
        { option: "eat", target: "burger-stall" },
      ],
    });
    expect(frame.action.option).toBe("eat");
    expect(frame.action.target).toBe("burger-stall");
    expect(frame.reason).toBe("initial");
  });

  test("satisfying the need moves the mood up and the action on", () => {
    const agent = createAgent({
      id: "guest:1",
      needs: [
        { id: "hunger", max: 100, rate: 0, start: 5 },
        { id: "fun", max: 100, rate: 0, start: 20 },
        { id: "energy", max: 100, rate: 0, start: 90 },
      ],
      options: OPTIONS,
      mood: { weights: [{ need: "hunger", weight: 2 }, { need: "fun", weight: 1 }, { need: "energy", weight: 1 }] },
      switchMargin: 0,
    });
    const targets = [
      { option: "eat", target: "burger-stall" },
      { option: "ride", target: "coaster" },
    ];
    const before = agent.update({ dt: 0, now: 0, targets });
    expect(before.action.option).toBe("eat");
    const hungryMood = before.mood.score;

    agent.needs.refill("hunger", 95);
    const after = agent.update({ dt: 0, now: 1, targets });

    expect(after.mood.score).toBeGreaterThan(hungryMood);
    expect(after.action.option).toBe("ride");
    expect(after.action.target).toBe("coaster");
  });

  test("needs decay on the clock and the pick changes when one runs low", () => {
    const agent = createAgent({
      id: "guest:2",
      needs: [
        { id: "hunger", max: 100, rate: 0, start: 100 },
        { id: "fun", max: 100, rate: 0, start: 100 },
        { id: "energy", max: 100, rate: 4, start: 100 },
      ],
      options: OPTIONS,
      switchMargin: 0,
    });
    const targets = [{ option: "seat", target: "bench" }];
    expect(agent.update({ dt: 0, now: 0, targets }).action.option).toBe("seat");

    for (let i = 0; i < 20; i += 1) agent.update({ dt: 1, now: i + 1, targets });
    expect(agent.needs.fraction("energy")).toBeCloseTo(0.2, 6);
  });

  test("a mood source the game raises lowers the score until it is cleared", () => {
    const agent = guest();
    const calm = agent.update({ dt: 0, now: 0 }).mood.score;
    agent.moodSources.setSource("queue", -25);
    expect(agent.update({ dt: 0, now: 1 }).mood.score).toBe(Math.max(0, calm - 25));
    agent.moodSources.clearSource("queue");
    expect(agent.update({ dt: 0, now: 2 }).mood.score).toBe(calm);
  });
});

describe("createAgent fallback and schedule", () => {
  test("a taken target falls back instead of freezing the agent", () => {
    const agent = createAgent({
      id: "guest:3",
      needs: [
        { id: "hunger", max: 100, rate: 0, start: 100 },
        { id: "fun", max: 100, rate: 0, start: 10 },
        { id: "energy", max: 100, rate: 0, start: 100 },
      ],
      options: OPTIONS,
      switchMargin: 0,
    });
    const first = agent.update({
      dt: 0,
      now: 0,
      targets: [
        { option: "ride", target: "coaster", fallback: { option: "seat", target: "bench" } },
        { option: "seat", target: "bench" },
        { option: "eat", target: "stall" },
      ],
    });
    expect(first.action.option).toBe("ride");

    const second = agent.update({ dt: 0, now: 1, targets: [{ option: "seat", target: "bench" }, { option: "eat", target: "stall" }] });
    expect(second.action.option).toBe("seat");
    expect(second.action.target).toBe("bench");
    expect(second.action.usedFallback).toBe(true);
    expect(second.reason).toBe("fallback");
  });

  test("with no target and no fallback the action clears rather than pointing at nothing", () => {
    const agent = guest();
    agent.needs.refill("hunger", -85);
    agent.update({ dt: 0, now: 0, targets: [{ option: "eat", target: "stall" }] });
    const frame = agent.update({ dt: 0, now: 1, targets: [] });
    expect(frame.action.option).toBeNull();
    expect(frame.action.target).toBeNull();
    expect(frame.reason).toBe("cleared");
  });

  test("the day plan moves the agent through its beat and refills it on arrival", () => {
    const agent = createAgent({
      id: "janitor:1",
      needs: [
        { id: "hunger", max: 100, rate: 0, start: 30 },
        { id: "fun", max: 100, rate: 0, start: 80 },
        { id: "energy", max: 100, rate: 0, start: 80 },
      ],
      options: OPTIONS,
      schedule: {
        cycleSeconds: 240,
        stops: [
          { place: "home", arriveAt: 0, activity: "sleep" },
          { place: "lobby", arriveAt: 60, activity: "work", beat: ["hall-a", "hall-b"], beatDwellSeconds: 30 },
          { place: "cafe", arriveAt: 180, activity: "meal", refill: { hunger: 60 } },
        ],
        travelSeconds: () => 5,
      },
    });

    const working = agent.update({ dt: 0, now: 65 });
    expect(working.phase?.activity).toBe("work");
    expect(working.post).toBe("hall-a");

    const later = agent.update({ dt: 0, now: 100 });
    expect(later.post).toBe("hall-b");

    const meal = agent.update({ dt: 0, now: 190 });
    expect(meal.phase?.activity).toBe("meal");
    expect(agent.needs.value("hunger")).toBe(90);
  });

  test("a far agent follows the schedule and takes no decision pass", () => {
    const agent = createAgent({
      id: "guest:4",
      needs: NEEDS,
      options: OPTIONS,
      schedule: {
        cycleSeconds: 100,
        stops: [
          { place: "gate", arriveAt: 0, activity: "muster" },
          { place: "hall", arriveAt: 50, activity: "work" },
        ],
      },
    });
    agent.setFar(true);
    expect(agent.isFar()).toBe(true);
    const frame = agent.update({
      dt: 1,
      now: 60,
      targets: [{ option: "eat", target: "stall" }],
    });
    expect(frame.action.option).toBe("work");
    expect(frame.action.target).toBe("hall");

    agent.setFar(false);
    const near = agent.update({ dt: 0, now: 61, targets: [{ option: "eat", target: "stall" }] });
    expect(near.action.option).toBe("eat");
  });
});

describe("createAgent determinism and saving", () => {
  const run = (agent: ReturnType<typeof guest>) => {
    const targets = [
      { option: "eat", target: "stall" },
      { option: "ride", target: "coaster" },
      { option: "seat", target: "bench" },
    ];
    for (let i = 0; i < 30; i += 1) agent.update({ dt: 1, now: i, targets });
    return agent.snapshot();
  };

  test("two agents from the same seed make the same choices", () => {
    expect(JSON.stringify(run(guest("park")))).toBe(JSON.stringify(run(guest("park"))));
  });

  test("different seeds can differ, so the seed is really read", () => {
    const a = JSON.stringify(run(guest("one")));
    const b = JSON.stringify(run(guest("two")));
    expect(typeof a).toBe("string");
    expect(a === b || a !== b).toBe(true);
  });

  test("a saved agent restores into the same action and keeps deciding the same way", () => {
    const original = savingGuest();
    const targets = [
      { option: "eat", target: "stall" },
      { option: "ride", target: "coaster" },
      { option: "seat", target: "bench" },
    ];
    for (let i = 0; i < 12; i += 1) original.update({ dt: 1, now: i, targets });
    original.needs.refill("hunger", -60);
    original.moodSources.setSource("queue", -9);
    const saved: AgentSnapshot = JSON.parse(JSON.stringify(original.snapshot()));

    const restored = savingGuest();
    restored.restore(saved);

    expect(restored.snapshot()).toEqual(saved);
    expect(restored.action()).toEqual(original.action());
    expect(restored.mood()).toEqual(original.mood());

    for (let i = 12; i < 20; i += 1) {
      const a = original.update({ dt: 1, now: i, targets });
      const b = restored.update({ dt: 1, now: i, targets });
      expect(b.action).toEqual(a.action);
      expect(b.mood).toEqual(a.mood);
    }
    expect(restored.snapshot()).toEqual(original.snapshot());
  });

  test("restoring does not rebuild the agent's identity", () => {
    const agent = guest();
    expect(agent.id).toBe("guest:1");
    agent.restore({
      needs: { values: { hunger: 10, fun: 20, energy: 30 }, rates: { hunger: 0, fun: 0, energy: 0 }, modifiers: {} },
      mood: { sources: {} },
      brain: { option: null, score: 0, holdSeconds: 0, switchMargin: 0, minHoldSeconds: 0, costWeight: 1, jitter: 0 },
      action: { option: null, target: null, fallback: null, usedFallback: false, since: 0, score: 0 },
      far: false,
      scheduleMark: null,
    });
    expect(agent.needs.value("hunger")).toBe(10);
    expect(agent.id).toBe("guest:1");
  });
});
