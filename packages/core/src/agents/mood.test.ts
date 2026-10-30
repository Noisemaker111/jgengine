import { describe, expect, test } from "bun:test";

import { createNeedSet } from "../sim/needs";
import { createMoodReader, type MoodTier, moodTierOf, readMood } from "./mood";

const TIERS: readonly MoodTier[] = [
  { at: 70, id: "bright", label: "Bright" },
  { at: 30, id: "flat", label: "Flat" },
  { at: 0, id: "low", label: "Low" },
];

describe("readMood", () => {
  test("is the weighted satisfaction of the declared needs on a 0-100 scale", () => {
    const needs = createNeedSet([
      { id: "hunger", max: 100, rate: 0, start: 80 },
      { id: "fun", max: 100, rate: 0, start: 20 },
    ]);
    const mood = readMood(
      needs,
      [
        { need: "hunger", weight: 3 },
        { need: "fun", weight: 1 },
      ],
      TIERS,
    );
    expect(mood.score).toBeCloseTo(65, 6);
    expect(mood.tier).toBe("flat");
  });

  test("ignores weights that point at an undeclared need", () => {
    const needs = createNeedSet([{ id: "hunger", max: 100, rate: 0, start: 50 }]);
    const mood = readMood(
      needs,
      [
        { need: "hunger", weight: 1 },
        { need: "morale", weight: 5 },
      ],
      TIERS,
    );
    expect(mood.score).toBeCloseTo(50, 6);
  });

  test("tiers read from the top down and a score below them takes the lowest band", () => {
    expect(moodTierOf(90, TIERS).id).toBe("bright");
    expect(moodTierOf(0, TIERS).id).toBe("low");
    expect(moodTierOf(70, [{ at: 60, id: "ok", label: "OK" }]).id).toBe("ok");
    expect(moodTierOf(-40, TIERS).id).toBe("low");
  });

  test("the lowest band is the smallest cut point even when the list is unsorted", () => {
    expect(
      moodTierOf(-5, [
        { at: 10, id: "high", label: "High" },
        { at: 0, id: "bottom", label: "Bottom" },
        { at: 20, id: "top", label: "Top" },
      ]).id,
    ).toBe("bottom");
  });

  test("a tier list with nothing in it is refused", () => {
    expect(() => moodTierOf(10, [])).toThrow(RangeError);
  });

  test("a score exactly on a band floor reads as that band, one below stays under it", () => {
    expect(moodTierOf(70, TIERS).id).toBe("bright");
    expect(moodTierOf(69.9, TIERS).id).toBe("flat");
    expect(moodTierOf(30, TIERS).id).toBe("flat");
    expect(moodTierOf(0, TIERS).id).toBe("low");
    expect(moodTierOf(-1, TIERS).id).toBe("low");
  });
});

describe("createMoodReader", () => {
  test("a satisfied need raises the mood and an emptied one lowers it", () => {
    const needs = createNeedSet([{ id: "fun", max: 100, rate: 10, start: 100 }]);
    const mood = createMoodReader({ needs, tiers: TIERS });
    expect(mood.read().score).toBe(100);

    needs.tick(5);
    expect(mood.read().score).toBeCloseTo(50, 6);
    expect(mood.read().tier).toBe("flat");

    needs.refill("fun", 50);
    expect(mood.read().score).toBe(100);
    expect(mood.read().tier).toBe("bright");
  });

  test("a source moves the mood while it is live and stops moving it when cleared", () => {
    const needs = createNeedSet([{ id: "fun", max: 100, rate: 0, start: 70 }]);
    const mood = createMoodReader({ needs, tiers: TIERS });
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
    const mood = createMoodReader({ needs, tiers: TIERS });
    mood.setSource("great-day", 40);
    expect(mood.read().score).toBe(100);
    mood.setSource("great-day", -400);
    expect(mood.read().score).toBe(0);
  });

  test("a save round trip keeps the sources", () => {
    const needs = createNeedSet([{ id: "fun", max: 100, rate: 0, start: 70 }]);
    const mood = createMoodReader({ needs, tiers: TIERS });
    mood.setSource("queue", -12);
    const restored = createMoodReader({ needs, tiers: TIERS });
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
      tiers: TIERS,
    });
    expect(mood.read().score).toBe(50);
    mood.retune({ weights: [{ need: "fun", weight: 1 }] });
    expect(mood.read().score).toBe(0);
  });
});
