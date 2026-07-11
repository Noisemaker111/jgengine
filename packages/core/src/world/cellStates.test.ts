import { describe, expect, test } from "bun:test";

import { createCellStateGrid } from "./cellStates";

const LADDER = ["pristine", "cracked", "burning", "ruined"] as const;

describe("createCellStateGrid", () => {
  test("every cell starts at the first state", () => {
    const grid = createCellStateGrid({ cols: 3, rows: 2, states: LADDER });
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        expect(grid.stateAt(col, row)).toBe("pristine");
        expect(grid.indexAt(col, row)).toBe(0);
      }
    }
  });

  test("escalate steps up the ladder and clamps at the last state", () => {
    const grid = createCellStateGrid({ cols: 2, rows: 2, states: LADDER });
    expect(grid.escalate(0, 0)).toBe("cracked");
    expect(grid.escalate(0, 0, 2)).toBe("ruined");
    expect(grid.escalate(0, 0)).toBe("ruined");
    expect(grid.indexAt(0, 0)).toBe(LADDER.length - 1);
  });

  test("regress steps down the ladder and clamps at the first state", () => {
    const grid = createCellStateGrid({ cols: 2, rows: 2, states: LADDER });
    grid.escalate(0, 0, 2);
    expect(grid.regress(0, 0)).toBe("cracked");
    expect(grid.regress(0, 0, 5)).toBe("pristine");
    expect(grid.indexAt(0, 0)).toBe(0);
  });

  test("set jumps directly to a named state and validates it", () => {
    const grid = createCellStateGrid({ cols: 2, rows: 2, states: LADDER });
    expect(grid.set(1, 1, "burning")).toBe(true);
    expect(grid.stateAt(1, 1)).toBe("burning");
    expect(grid.set(1, 1, "lava" as never)).toBe(false);
    expect(grid.stateAt(1, 1)).toBe("burning");
  });

  test("escalateWhere escalates matching cells, counts them, and bumps version once", () => {
    const grid = createCellStateGrid({ cols: 3, rows: 1, states: LADDER });
    const before = grid.version();
    const changed = grid.escalateWhere((col) => col !== 1);
    expect(changed).toBe(2);
    expect(grid.stateAt(0, 0)).toBe("cracked");
    expect(grid.stateAt(1, 0)).toBe("pristine");
    expect(grid.stateAt(2, 0)).toBe("cracked");
    expect(grid.version()).toBe(before + 1);
  });

  test("escalateWhere with no matches does not bump version", () => {
    const grid = createCellStateGrid({ cols: 2, rows: 1, states: LADDER });
    const before = grid.version();
    expect(grid.escalateWhere(() => false)).toBe(0);
    expect(grid.version()).toBe(before);
  });

  test("cellsIn lists cells at a given state; counts tallies every state", () => {
    const grid = createCellStateGrid({ cols: 2, rows: 2, states: LADDER });
    grid.set(0, 0, "burning");
    grid.set(1, 0, "burning");
    expect(grid.cellsIn("burning").sort((a, b) => a.col - b.col)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(grid.cellsIn("ruined")).toEqual([]);
    expect(grid.counts()).toEqual({ pristine: 2, cracked: 0, burning: 2, ruined: 0 });
  });

  test("cellOf and centerOf map through origin and cellSize", () => {
    const grid = createCellStateGrid({ cols: 4, rows: 4, states: LADDER, origin: [10, -10], cellSize: 2 });
    expect(grid.cellOf(10, -10)).toEqual({ col: 0, row: 0 });
    expect(grid.cellOf(12, -8)).toEqual({ col: 1, row: 1 });
    expect(grid.centerOf(1, 1)).toEqual([12, -8]);
  });

  test("out-of-bounds queries return null/-1/false and do not throw", () => {
    const grid = createCellStateGrid({ cols: 2, rows: 2, states: LADDER });
    expect(grid.stateAt(-1, 0)).toBeNull();
    expect(grid.stateAt(5, 0)).toBeNull();
    expect(grid.indexAt(-1, 0)).toBe(-1);
    expect(grid.escalate(-1, 0)).toBeNull();
    expect(grid.regress(-1, 0)).toBeNull();
    expect(grid.set(-1, 0, "cracked")).toBe(false);
    expect(grid.cellOf(1000, 1000)).toBeNull();
  });

  test("reset clears every cell back to the first state and bumps version", () => {
    const grid = createCellStateGrid({ cols: 2, rows: 2, states: LADDER });
    grid.escalate(0, 0, 3);
    grid.escalate(1, 1, 2);
    const before = grid.version();
    grid.reset();
    expect(grid.stateAt(0, 0)).toBe("pristine");
    expect(grid.stateAt(1, 1)).toBe("pristine");
    expect(grid.version()).toBeGreaterThan(before);
  });

  test("constructor validates its config", () => {
    expect(() => createCellStateGrid({ cols: 2, rows: 2, states: [] })).toThrow();
    expect(() => createCellStateGrid({ cols: 0, rows: 2, states: LADDER })).toThrow();
    expect(() => createCellStateGrid({ cols: 2, rows: -1, states: LADDER })).toThrow();
    expect(() => createCellStateGrid({ cols: 2, rows: 2, states: ["a", "a"] })).toThrow(/duplicate/);
  });
});
