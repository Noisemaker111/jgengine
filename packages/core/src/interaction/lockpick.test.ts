import { describe, expect, test } from "bun:test";
import {
  generateLock,
  LOCK_ACTIONS,
  solveLock,
  solveLockPath,
  stepLock,
  visibleCells,
  type LockTierSpec,
} from "./lockpick";

const EASY: LockTierSpec = {
  cols: 10,
  rows: 6,
  width: 2,
  gateCount: 1,
  visibilityWindow: 10,
  allowedActions: LOCK_ACTIONS,
};

const HARD: LockTierSpec = {
  cols: 14,
  rows: 7,
  width: 1,
  gateCount: 4,
  visibilityWindow: 3,
  allowedActions: ["set", "steady", "ease"],
  trapCount: 3,
};

describe("generateLock", () => {
  test("is deterministic for the same seed and tier", () => {
    const a = generateLock("seed-1", EASY);
    const b = generateLock("seed-1", EASY);
    expect(a).toEqual(b);
  });

  test("different seeds produce different boards", () => {
    const a = generateLock("seed-a", EASY);
    const b = generateLock("seed-b", EASY);
    expect(a.open).not.toEqual(b.open);
  });

  test("is always solvable across many seeds and both tiers", () => {
    for (const tier of [EASY, HARD]) {
      for (let i = 0; i < 60; i += 1) {
        const spec = generateLock(`tier-seed-${i}`, tier);
        expect(solveLock(spec)).toBe(true);
      }
    }
  });

  test("gate columns hold exactly one open row", () => {
    const spec = generateLock("gate-check", HARD);
    for (const gate of spec.gates) expect(spec.open[gate]?.length).toBe(1);
  });

  test("the seat column holds exactly one open row", () => {
    const spec = generateLock("seat-check", HARD);
    expect(spec.open[spec.open.length - 1]?.length).toBe(1);
  });

  test("start and seat rows are always open in their columns", () => {
    const spec = generateLock("start-seat-check", EASY);
    expect(spec.open[0]).toContain(spec.startRow);
    expect(spec.open[spec.open.length - 1]).toContain(spec.seatRow);
  });

  test("traps never sit on the solution path", () => {
    for (let i = 0; i < 40; i += 1) {
      const spec = generateLock(`trap-seed-${i}`, HARD);
      const path = solveLockPath(spec);
      expect(path).not.toBeNull();
      for (let c = 0; c < path!.length; c += 1) {
        expect(spec.traps[c]?.includes(path![c]!)).toBe(false);
      }
    }
  });

  test("every open cell is reachable from the previous column", () => {
    const spec = generateLock("reachability", HARD);
    for (let c = 1; c < spec.open.length; c += 1) {
      for (const r of spec.open[c]!) {
        const reachable = spec.open[c - 1]!.some((pr) => HARD.allowedActions.some((a) => pr + deltaOf(a) === r));
        expect(reachable).toBe(true);
      }
    }
  });
});

function deltaOf(action: string): number {
  return { hardSet: -2, set: -1, steady: 0, ease: 1, drop: 2 }[action as "steady"] ?? 0;
}

describe("stepLock", () => {
  test("walking the solved path always succeeds", () => {
    const spec = generateLock("solve-walk", EASY);
    const path = solveLockPath(spec)!;
    let col = 0;
    let row = spec.startRow;
    for (let c = 1; c < path.length; c += 1) {
      const delta = path[c]! - path[c - 1]!;
      const action = LOCK_ACTIONS.find((a) => ({ hardSet: -2, set: -1, steady: 0, ease: 1, drop: 2 })[a] === delta)!;
      const step = stepLock(spec, col, row, action);
      col = step.col;
      row = step.row;
      expect(step.result).toBe(c === path.length - 1 ? "success" : "advanced");
    }
  });

  test("missing a gate's single open row binds without advancing", () => {
    const spec = generateLock("bind-check", HARD);
    const gateCol = spec.gates[0]!;
    const wrongRow = spec.open[gateCol - 1]!.find((r) => r !== spec.open[gateCol]![0]) ?? 0;
    const startCol = gateCol - 1;
    const before = { col: startCol, row: wrongRow };
    const legalDelta = HARD.allowedActions
      .map((a) => ({ hardSet: -2, set: -1, steady: 0, ease: 1, drop: 2 })[a])
      .find((d) => wrongRow + d !== spec.open[gateCol]![0] && wrongRow + d >= 0 && wrongRow + d <= HARD.rows - 1);
    if (legalDelta === undefined) return;
    const action = LOCK_ACTIONS.find((a) => ({ hardSet: -2, set: -1, steady: 0, ease: 1, drop: 2 })[a] === legalDelta)!;
    const step = stepLock(spec, before.col, before.row, action);
    expect(step.result === "bind" || step.result === "slip").toBe(true);
    expect(step.col).toBe(before.col);
    expect(step.row).toBe(before.row);
  });

  test("touching a trap jams without advancing", () => {
    const spec = generateLock("trap-hit", HARD);
    let found = false;
    for (let c = 0; c < spec.open.length - 1 && !found; c += 1) {
      for (const trapRow of spec.traps[c + 1] ?? []) {
        for (const r of spec.open[c]!) {
          const delta = trapRow - r;
          if (!HARD.allowedActions.some((a) => ({ hardSet: -2, set: -1, steady: 0, ease: 1, drop: 2 })[a] === delta)) {
            continue;
          }
          const action = LOCK_ACTIONS.find(
            (a) => ({ hardSet: -2, set: -1, steady: 0, ease: 1, drop: 2 })[a] === delta,
          )!;
          const step = stepLock(spec, c, r, action);
          expect(step.result).toBe("trap");
          expect(step.col).toBe(c);
          expect(step.row).toBe(r);
          found = true;
          break;
        }
        if (found) break;
      }
    }
  });

  test("clamps the row to the board bounds", () => {
    const spec = generateLock("clamp-check", EASY);
    const step = stepLock(spec, 0, 0, "hardSet");
    expect(step.row).toBeGreaterThanOrEqual(0);
  });
});

describe("visibleCells", () => {
  test("a full-visibility window reveals every column", () => {
    const spec = generateLock("full-vis", EASY);
    const cells = visibleCells(spec, 0, EASY.visibilityWindow);
    const maxCol = Math.max(...cells.map((cell) => cell.col));
    expect(maxCol).toBe(spec.open.length - 1);
  });

  test("a narrow window never reveals beyond col + window", () => {
    const spec = generateLock("narrow-vis", HARD);
    const cells = visibleCells(spec, 2, HARD.visibilityWindow);
    for (const cell of cells) expect(cell.col).toBeLessThanOrEqual(2 + HARD.visibilityWindow);
  });

  test("the seat cell is always tagged seat", () => {
    const spec = generateLock("seat-tag", EASY);
    const cells = visibleCells(spec, 0, EASY.visibilityWindow);
    const seat = cells.find((cell) => cell.col === spec.open.length - 1);
    expect(seat?.kind).toBe("seat");
  });

  test("trap rows are tagged trap so the fog never hides a hazard within the window", () => {
    const spec = generateLock("trap-tag", HARD);
    const cells = visibleCells(spec, 0, HARD.visibilityWindow);
    for (const cell of cells) {
      if (spec.traps[cell.col]?.includes(cell.row) === true) expect(cell.kind).toBe("trap");
    }
  });
});
