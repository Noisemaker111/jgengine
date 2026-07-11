import { describe, expect, test } from "bun:test";

import {
  allLegalJumps,
  applyJump,
  boardOf,
  cellKey,
  classifyOutcome,
  decodeScore,
  encodeScore,
  hasAnyJump,
  initialPegs,
  isGameOver,
  isHole,
  jumpBetween,
  keyOf,
  legalJumpsFrom,
  orthoNeighbors,
  type BoardDef,
} from "./logic";

const english = boardOf("english");
const european = boardOf("european");

function pegsFrom(board: BoardDef, keys: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const key of keys) {
    if (!board.holeSet.has(key)) throw new Error(`not a hole: ${key}`);
    set.add(key);
  }
  return set;
}

describe("board definitions", () => {
  test("English cross has 33 holes, European has 37", () => {
    expect(english.holes.length).toBe(33);
    expect(european.holes.length).toBe(37);
    expect(english.holeSet.size).toBe(33);
    expect(european.holeSet.size).toBe(37);
  });

  test("the centre is a hole on both boards", () => {
    expect(isHole(english, 3, 3)).toBe(true);
    expect(isHole(european, 3, 3)).toBe(true);
    expect(keyOf(english.center)).toBe("3,3");
  });

  test("the English board excludes the four 2x2 corners", () => {
    for (const [r, c] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 6],
      [6, 0],
      [6, 6],
      [5, 5],
    ] as const) {
      expect(isHole(english, r, c)).toBe(false);
    }
  });

  test("the European board fills the inner corners the English board omits", () => {
    for (const [r, c] of [
      [1, 1],
      [1, 5],
      [5, 1],
      [5, 5],
    ] as const) {
      expect(isHole(english, r, c)).toBe(false);
      expect(isHole(european, r, c)).toBe(true);
    }
    // the extreme corners stay cut on both
    expect(isHole(european, 0, 0)).toBe(false);
    expect(isHole(european, 0, 1)).toBe(false);
  });
});

describe("adjacency", () => {
  test("an arm-edge hole reports only its in-board orthogonal neighbours", () => {
    // English (0,2) top of the vertical arm: down (1,2) and right (0,3) are holes; up/left are not
    const neighbors = orthoNeighbors(english, { r: 0, c: 2 }).map(keyOf).sort();
    expect(neighbors).toEqual(["0,3", "1,2"]);
  });

  test("a left-arm hole has three neighbours, not four", () => {
    // English (3,0): (2,0),(4,0),(3,1) are holes; (3,-1) is off-board
    const neighbors = orthoNeighbors(english, { r: 3, c: 0 }).map(keyOf).sort();
    expect(neighbors).toEqual(["2,0", "3,1", "4,0"]);
  });

  test("a central hole has all four neighbours", () => {
    expect(orthoNeighbors(english, { r: 3, c: 3 }).length).toBe(4);
  });
});

describe("initial position", () => {
  test("every hole is filled except the centre", () => {
    expect(initialPegs(english).size).toBe(32);
    expect(initialPegs(european).size).toBe(36);
    expect(initialPegs(english).has("3,3")).toBe(false);
    expect(initialPegs(english).has("0,2")).toBe(true);
  });
});

describe("legal-jump generation", () => {
  test("the opening offers exactly the four jumps into the centre", () => {
    for (const board of [english, european]) {
      const jumps = allLegalJumps(board, initialPegs(board));
      expect(jumps.length).toBe(4);
      for (const jump of jumps) expect(keyOf(jump.to)).toBe("3,3");
    }
  });

  test("a peg two steps from the empty centre can jump; a corner peg cannot", () => {
    const start = initialPegs(english);
    expect(legalJumpsFrom(english, start, { r: 1, c: 3 }).map((j) => keyOf(j.to))).toEqual(["3,3"]);
    // (2,0) at the arm corner: over (2,1) lands on the occupied (2,2), up leaves the board
    expect(legalJumpsFrom(english, start, { r: 2, c: 0 })).toEqual([]);
  });

  test("jumps never leave the board or cross a missing hole (edge case)", () => {
    // a lone horizontal trio on the left arm: (3,0) peg, (3,1) peg, (3,2) empty
    const occ = pegsFrom(english, ["3,0", "3,1"]);
    const jumps = legalJumpsFrom(english, occ, { r: 3, c: 0 });
    expect(jumps.length).toBe(1);
    expect(keyOf(jumps[0]!.to)).toBe("3,2");
    // the same peg cannot jump left (off-board) or vertically (no neighbour peg)
    expect(jumpBetween(english, occ, { r: 3, c: 0 }, { r: 1, c: 0 })).toBeNull();
  });

  test("a landing must be an empty hole, not an occupied one", () => {
    const occ = pegsFrom(english, ["3,0", "3,1", "3,2"]);
    // (3,0) over (3,1) would land on the occupied (3,2) -> illegal
    expect(legalJumpsFrom(english, occ, { r: 3, c: 0 })).toEqual([]);
  });
});

describe("capture removal", () => {
  test("a jump vacates the mover and the jumped peg, and fills the landing", () => {
    const start = initialPegs(english);
    const jump = jumpBetween(english, start, { r: 1, c: 3 }, { r: 3, c: 3 })!;
    expect(keyOf(jump.over)).toBe("2,3");
    const after = applyJump(start, jump);
    expect(after.has("1,3")).toBe(false); // mover left
    expect(after.has("2,3")).toBe(false); // jumped peg removed
    expect(after.has("3,3")).toBe(true); // landing filled
    expect(after.size).toBe(start.size - 1); // exactly one peg removed per jump
  });
});

describe("end-state detection", () => {
  test("one peg in the centre is brilliant", () => {
    const occ = pegsFrom(english, ["3,3"]);
    expect(isGameOver(english, occ)).toBe(true);
    const outcome = classifyOutcome(english, occ);
    expect(outcome.tier).toBe("brilliant");
    expect(outcome.pegsLeft).toBe(1);
    expect(outcome.atCenter).toBe(true);
  });

  test("one peg off-centre is solved", () => {
    const occ = pegsFrom(english, ["0,2"]);
    const outcome = classifyOutcome(english, occ);
    expect(outcome.tier).toBe("solved");
    expect(outcome.pegsLeft).toBe(1);
    expect(outcome.atCenter).toBe(false);
  });

  test("multiple non-adjacent pegs with no jump are stuck", () => {
    const occ = pegsFrom(english, ["0,2", "6,4", "3,0"]);
    expect(hasAnyJump(english, occ)).toBe(false);
    expect(isGameOver(english, occ)).toBe(true);
    const outcome = classifyOutcome(english, occ);
    expect(outcome.tier).toBe("stuck");
    expect(outcome.pegsLeft).toBe(3);
  });

  test("a board with an available jump is not over", () => {
    expect(isGameOver(english, initialPegs(english))).toBe(false);
  });
});

describe("record scoring", () => {
  test("fewer pegs always outrank more, ties break on fewer moves", () => {
    expect(encodeScore(1, 31)).toBeLessThan(encodeScore(2, 30));
    expect(encodeScore(2, 20)).toBeLessThan(encodeScore(2, 25));
  });

  test("encode/decode round-trips", () => {
    expect(decodeScore(encodeScore(3, 29))).toEqual({ pegsLeft: 3, moves: 29 });
  });

  test("cell keys parse back to coordinates", () => {
    expect(cellKey(4, 5)).toBe("4,5");
  });
});
