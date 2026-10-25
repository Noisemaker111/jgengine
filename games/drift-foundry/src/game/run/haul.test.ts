import { describe, expect, test } from "bun:test";

import { FLYING_SECONDS, LINE_MAX, LINE_MIN, PAR_SECONDS, lineReading } from "./haul";

const CLEAN = { barriers: 8, place: 1, time: FLYING_SECONDS, damageStage: 0, armorSaves: 0 };

describe("escape line", () => {
  test("a clean escape pays the most the line can", () => {
    const line = lineReading(CLEAN);
    expect(line.multiplier).toBe(LINE_MAX);
    expect(line.notes).toContain("8/8 barriers +0.40");
    expect(line.notes).toContain("P1 +0.30");
  });

  test("a scrappy escape pays less than a clean one but never nothing", () => {
    const scrappy = lineReading({ barriers: 2, place: 4, time: PAR_SECONDS + 5, damageStage: 2, armorSaves: 1 });
    const middling = lineReading({ barriers: 6, place: 2, time: 30, damageStage: 1, armorSaves: 0 });
    expect(scrappy.multiplier).toBeLessThan(middling.multiplier);
    expect(middling.multiplier).toBeLessThan(lineReading(CLEAN).multiplier);
    expect(scrappy.multiplier).toBeGreaterThanOrEqual(LINE_MIN);
  });

  test("a wrecked line cannot fall below the floor, however bad it was", () => {
    expect(lineReading({ barriers: 0, place: 4, time: PAR_SECONDS * 2, damageStage: 2, armorSaves: 3 }).multiplier).toBe(LINE_MIN);
  });

  test("every term that moved the multiplier is named once", () => {
    const line = lineReading({ barriers: 8, place: 2, time: 30, damageStage: 1, armorSaves: 1 });
    expect(line.notes).toHaveLength(5);
    expect(line.notes.join(" ")).toContain("nose folded 1/2");
    expect(line.notes.join(" ")).toContain("1 armor save");
  });

  test("the same run always reads the same line", () => {
    expect(lineReading(CLEAN)).toEqual(lineReading(CLEAN));
  });

  test("a slow run gets no time bonus but keeps its barriers", () => {
    const line = lineReading({ barriers: 8, place: 4, time: PAR_SECONDS + 10, damageStage: 0, armorSaves: 0 });
    expect(line.notes.some((note) => note.includes("under par"))).toBe(false);
    expect(line.multiplier).toBeCloseTo(1.4, 2);
  });
});
