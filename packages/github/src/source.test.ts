import { describe, expect, test } from "bun:test";

import { summarize } from "./analytics";
import { syntheticYear, wireToCells } from "./source";
import type { ContributionsWire } from "./wire";

const WIRE: ContributionsWire = {
  source: "graphql",
  profile: { login: "octocat", name: "The Octocat", avatarUrl: "https://x/y.png" },
  total: 6,
  weeks: [
    { days: [{ date: "2026-07-05", count: 0, weekday: 0 }, { date: "2026-07-06", count: 2, weekday: 1 }] },
    { days: [{ date: "2026-07-12", count: 4, weekday: 0 }] },
  ],
};

describe("wireToCells", () => {
  test("flattens weeks into positioned cells with levels and date labels", () => {
    const cells = wireToCells(WIRE);
    expect(cells.length).toBe(3);
    expect(cells[0]).toMatchObject({ week: 0, weekday: 0, count: 0, level: 0 });
    expect(cells[1]).toMatchObject({ week: 0, weekday: 1, count: 2, level: 1 });
    expect(cells[2]).toMatchObject({ week: 1, weekday: 0, count: 4, level: 2 });
    expect(cells[1]!.label).toBe("Mon, Jul 06");
  });

  test("array position is the instance index, matching hover resolution", () => {
    wireToCells(WIRE).forEach((cell, i) => expect(cell.index).toBe(i));
  });

  test("summed counts flow through analytics", () => {
    expect(summarize(wireToCells(WIRE)).total).toBe(6);
  });
});

describe("syntheticYear", () => {
  test("produces a full deterministic year tagged as synthetic", () => {
    const data = syntheticYear(1);
    expect(data.source).toBe("synthetic");
    expect(data.profile).toBeNull();
    expect(data.cells.length).toBe(371);
  });
});
