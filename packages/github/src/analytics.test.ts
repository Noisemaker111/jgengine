import { describe, expect, test } from "bun:test";

import { CELL_COUNT, DAYS, generateYear, levelForCount } from "./calendar";
import { summarize } from "./analytics";

describe("contribution calendar", () => {
  test("generates one cell per day of the year grid", () => {
    const cells = generateYear(1);
    expect(cells.length).toBe(CELL_COUNT);
    expect(cells[0]!.index).toBe(0);
    expect(cells[CELL_COUNT - 1]!.index).toBe(CELL_COUNT - 1);
  });

  test("is deterministic per seed and varies across seeds", () => {
    expect(generateYear(42)).toEqual(generateYear(42));
    expect(summarize(generateYear(1)).total).not.toBe(summarize(generateYear(2)).total);
  });

  test("level thresholds bucket counts as GitHub quartiles", () => {
    expect(levelForCount(0)).toBe(0);
    expect(levelForCount(2)).toBe(1);
    expect(levelForCount(5)).toBe(2);
    expect(levelForCount(9)).toBe(3);
    expect(levelForCount(20)).toBe(4);
  });
});

describe("contribution analytics", () => {
  const cells = generateYear(9);
  const stats = summarize(cells);

  test("total and active-day counts match a brute-force pass", () => {
    expect(stats.total).toBe(cells.reduce((sum, c) => sum + c.count, 0));
    expect(stats.activeDays).toBe(cells.filter((c) => c.count > 0).length);
    expect(stats.activeDaysPct).toBe(Math.round((stats.activeDays / cells.length) * 100));
  });

  test("averages are derived from the totals", () => {
    expect(stats.avgPerWeek).toBeCloseTo(stats.total / (CELL_COUNT / DAYS), 1);
    if (stats.activeDays > 0) expect(stats.avgPerActiveDay).toBeCloseTo(stats.total / stats.activeDays, 1);
  });

  test("streaks stay in range and current streak matches the trailing run", () => {
    let trailing = 0;
    for (let i = cells.length - 1; i >= 0 && cells[i]!.count > 0; i -= 1) trailing += 1;
    expect(stats.currentStreak).toBe(trailing);
    expect(stats.longestStreak).toBeGreaterThanOrEqual(stats.currentStreak);
    expect(stats.longestStreak).toBeLessThanOrEqual(CELL_COUNT);
  });

  test("peak day is the max cell and last-30 sums the final 30 days", () => {
    expect(stats.peakDay.count).toBe(Math.max(...cells.map((c) => c.count)));
    expect(stats.last30Days).toBe(cells.slice(-30).reduce((sum, c) => sum + c.count, 0));
  });

  test("busiest weekday and most active month are populated", () => {
    expect(stats.busiestWeekday.name.length).toBe(3);
    expect(stats.busiestWeekday.total).toBeGreaterThan(0);
    expect(stats.mostActiveMonth.label.length).toBeGreaterThan(0);
    expect(stats.mostActiveMonth.total).toBeGreaterThan(0);
  });
});
