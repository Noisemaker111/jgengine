import { describe, expect, test } from "bun:test";
import {
  cellBounds,
  cellKey,
  cellsForBounds,
  cellToWorldCenter,
  chebyshevCellDistance,
  parseCellKey,
  worldToCell,
} from "@llmville/game/datacenter/grid";

describe("datacenter grid", () => {
  test("cellKey round-trips negative coordinates", () => {
    for (const cell of [{ cx: -3, cz: 7 }, { cx: 0, cz: 0 }, { cx: -12, cz: -45 }, { cx: 999, cz: -1 }]) {
      expect(parseCellKey(cellKey(cell))).toEqual(cell);
    }
  });

  test("worldToCell floors negative world positions", () => {
    expect(worldToCell(-0.25, -1.5)).toEqual({ cx: -1, cz: -2 });
    expect(worldToCell(0.9, 2.1)).toEqual({ cx: 0, cz: 2 });
  });

  test("cellToWorldCenter and cellBounds agree", () => {
    const cell = { cx: -2, cz: 3 };
    const center = cellToWorldCenter(cell);
    const bounds = cellBounds(cell);
    expect(center.x).toBeGreaterThan(bounds.minX);
    expect(center.x).toBeLessThan(bounds.maxX);
    expect(center.z).toBeGreaterThan(bounds.minZ);
    expect(center.z).toBeLessThan(bounds.maxZ);
    expect(worldToCell(center.x, center.z)).toEqual(cell);
  });

  test("chebyshevCellDistance", () => {
    expect(chebyshevCellDistance({ cx: 0, cz: 0 }, { cx: 3, cz: -4 })).toBe(4);
    expect(chebyshevCellDistance({ cx: -1, cz: -1 }, { cx: -1, cz: -1 })).toBe(0);
  });

  test("cellsForBounds covers every overlapped cell without spilling past boundaries", () => {
    expect(cellsForBounds({ minX: 0.2, maxX: 1.8, minZ: -0.5, maxZ: 0.5 })).toEqual([
      { cx: 0, cz: -1 },
      { cx: 0, cz: 0 },
      { cx: 1, cz: -1 },
      { cx: 1, cz: 0 },
    ]);
    expect(cellsForBounds({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 })).toEqual([{ cx: 0, cz: 0 }]);
    expect(cellsForBounds({ minX: -0.5, maxX: -0.5, minZ: 2, maxZ: 2 })).toEqual([{ cx: -1, cz: 2 }]);
  });
});
