import { describe, expect, test } from "bun:test";

import { ALL_FACES, buildPairs, groupOf, matchable } from "./tiles";

describe("tile set composition", () => {
  test("144 faces with the canonical distribution", () => {
    expect(ALL_FACES.length).toBe(144);
    const counts = new Map<string, number>();
    for (const f of ALL_FACES) counts.set(f, (counts.get(f) ?? 0) + 1);
    // suits + winds + dragons come in fours
    expect(counts.get("dots-1")).toBe(4);
    expect(counts.get("bamboo-9")).toBe(4);
    expect(counts.get("characters-5")).toBe(4);
    expect(counts.get("wind-e")).toBe(4);
    expect(counts.get("dragon-white")).toBe(4);
    // flowers and seasons are one-of-each (four distinct glyphs per group)
    for (const f of ["flower-plum", "flower-orchid", "flower-mum", "flower-bamboo"]) {
      expect(counts.get(f)).toBe(1);
    }
    for (const f of ["season-spring", "season-summer", "season-autumn", "season-winter"]) {
      expect(counts.get(f)).toBe(1);
    }
    const byGroup = { suit: 0, wind: 0, dragon: 0, flower: 0, season: 0 } as Record<string, number>;
    for (const f of ALL_FACES) byGroup[groupOf(f)] += 1;
    expect(byGroup).toEqual({ suit: 108, wind: 16, dragon: 12, flower: 4, season: 4 });
  });

  test("72 pairs, each a legal match", () => {
    const pairs = buildPairs();
    expect(pairs.length).toBe(72);
    for (const [a, b] of pairs) expect(matchable(a, b)).toBe(true);
  });
});

describe("match classes", () => {
  test("identical suit/wind/dragon tiles match, different ones do not", () => {
    expect(matchable("dots-3", "dots-3")).toBe(true);
    expect(matchable("dots-3", "dots-4")).toBe(false);
    expect(matchable("dots-3", "bamboo-3")).toBe(false);
    expect(matchable("wind-e", "wind-e")).toBe(true);
    expect(matchable("wind-e", "wind-s")).toBe(false);
    expect(matchable("dragon-red", "dragon-green")).toBe(false);
  });

  test("any flower matches any flower", () => {
    expect(matchable("flower-plum", "flower-orchid")).toBe(true);
    expect(matchable("flower-mum", "flower-bamboo")).toBe(true);
    expect(matchable("flower-plum", "flower-plum")).toBe(true);
  });

  test("any season matches any season", () => {
    expect(matchable("season-spring", "season-winter")).toBe(true);
    expect(matchable("season-summer", "season-autumn")).toBe(true);
  });

  test("flowers and seasons never cross-match", () => {
    expect(matchable("flower-plum", "season-spring")).toBe(false);
    expect(matchable("season-spring", "dragon-white")).toBe(false);
  });
});
