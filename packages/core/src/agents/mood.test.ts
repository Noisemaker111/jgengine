import { describe, expect, test } from "bun:test";

import { createNeedSet } from "../sim/needs";
import { createMoodReader, DEFAULT_MOOD_TIERS, moodTierOf, readMood } from "./mood";

describe("readMood", () => {
  test("is the weighted satisfaction of the declared needs on a 0-100 scale", () => {
    const needs = createNeedSet([
      { id: "hunger", max: 100, rate: 0, start: 80 },
      { id: "fun", max: 100, rate: 0, start: 20 },
    ]);
    const mood = readMood(needs, [
      { need: "hunger", weight: 3 },
      { need: "fun", weight: 1 },
    ]);
    expect(mood.score).toBeCloseTo(65, 6);
    expect(mood.tier).toBe("content");
  });

  test("ignores weights that point at an undeclared need", () => {
    const needs = createNeedSet([{ id: "hunger", max: 100, rate: 0, start: 50 }]);
    const mood = readMood(needs, [
      { need: "hunger", weight: 1 },
      { need: "morale", weight: 5 },
    ]);
    expect(mood.score).toBeCloseTo(50, 6);
  });

  test("tiers read from the top down and fall back to the lowest band", () => {
    expect(moodTierOf(90).id).toBe("radiant");
    expect(moodTierOf(0).id).toBe("low");
    expect(moodTierOf(70, [{ at: 60, id: "ok", label: "OK" }]).id).toBe("ok");
    expect(moodTierOf(10, [])).toEqual({ at: 0, id: "low", label: "Low" });
  });
});

describe("createMoodReader", () => {
  test("a satisfied need raises the mood and an emptied one lowers it", () => {
    const needs = createNeedSet([{ id: "fun", max: 100, rate: 10, start: 100 }]);
    const mood = createMoodReader({ needs });
    expect(mood.read().score).toBe(100);

    needs.tick(5);
    expect(mood.read().score).toBeCloseTo(50, 6);
    expect(mood.read().tier).toBe("fine");

    needs.refill("fun", 50);
    expect(mood.read().score).toBe(100);
    expect(mood.read().tier).toBe("radiant");
  });

  test("a source moves the mood while it is live and stops moving it when cleared", () => {
    const needs = createNeedSet([{ id: "fun", max: 100, rate: 0, start: 70 }]);
    const mood = createMoodReader({ needs });
    mood.setSource("queue", -20);
    expect(mood.read().score).toBe(50);
    mood.setSource("litter", -5);
    expect(mood.read().score).toBe(45);
    expect(mood.sources()).toEqual({ queue: -20, litter: -5 });

    mood.clearSource("queue");
    expect(mood.read().score).toBe(65);
    mood.setSource("litter", 0);
    expect(mood.sources()).toEqual({});
  });

  test("the score stays on the 0-100 scale when the sources overshoot", () => {
    const needs = createNeedSet([{ id: "fun", max: 100, rate: 0, start: 90 }]);
    const mood = createMoodReader({ needs });
    mood.setSource("great-day", 40);
    expect(mood.read().score).toBe(100);
    mood.setSource("great-day", -400);
    expect(mood.read().score).toBe(0);
  });

  test("a save round trip keeps the sources", () => {
    const needs = createNeedSet([{ id: "fun", max: 100, rate: 0, start: 70 }]);
    const mood = createMoodReader({ needs });
    mood.setSource("queue", -12);
    const restored = createMoodReader({ needs });
    restored.restore(JSON.parse(JSON.stringify(mood.snapshot())));
    expect(restored.read()).toEqual(mood.read());
    expect(restored.sources()).toEqual({ queue: -12 });
  });

  test("retuning weights changes the reading without dropping the sources", () => {
    const needs = createNeedSet([
      { id: "hunger", max: 100, rate: 0, start: 100 },
      { id: "fun", max: 100, rate: 0, start: 0 },
    ]);
    const mood = createMoodReader({
      needs,
      weights: [
        { need: "hunger", weight: 1 },
        { need: "fun", weight: 1 },
      ],
      tiers: DEFAULT_MOOD_TIERS,
    });
    expect(mood.read().score).toBe(50);
    mood.retune({ weights: [{ need: "fun", weight: 1 }] });
    expect(mood.read().score).toBe(0);
  });
});
