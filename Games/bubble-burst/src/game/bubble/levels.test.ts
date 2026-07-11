import { describe, expect, test } from "bun:test";

import { LETTER_TO_ID } from "./colors";
import { colsInRow } from "./hex";
import { LEVELS, parseLevel, TOTAL_LEVELS } from "./levels";

describe("levels", () => {
  test("ships ten authored layouts", () => {
    expect(TOTAL_LEVELS).toBe(10);
  });

  test("colour budget rises 4 → 6, never falling", () => {
    const counts = LEVELS.map((l) => l.colors);
    expect(Math.min(...counts)).toBe(4);
    expect(Math.max(...counts)).toBe(6);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
  });

  LEVELS.forEach((def, index) => {
    test(`level ${index + 1} (${def.name}) is well-formed`, () => {
      const grid = parseLevel(def);
      expect(grid.size).toBeGreaterThan(0);

      const used = new Set<number>();
      let maxRow = 0;
      for (const bubble of grid.values()) {
        used.add(bubble.color);
        maxRow = Math.max(maxRow, bubble.row);
      }
      // every declared colour is actually used, and none beyond the budget
      expect(used.size).toBe(def.colors);
      for (const id of used) expect(id).toBeLessThan(def.colors);

      // no colour glyph placed past a row's real column count
      for (let row = 0; row < def.rows.length; row += 1) {
        const line = def.rows[row]!;
        for (let col = 0; col < line.length; col += 1) {
          if (LETTER_TO_ID[line[col]!] !== undefined) expect(col).toBeLessThan(colsInRow(row));
        }
      }

      // fits above the deadline at spawn
      expect(maxRow).toBeLessThan(11);
    });
  });
});
