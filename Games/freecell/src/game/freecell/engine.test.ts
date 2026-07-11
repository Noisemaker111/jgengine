import { describe, expect, test } from "bun:test";

import { cardFromId, dealDeck, type Card, type Suit } from "./cards";
import {
  applyMove,
  autoCollectSafe,
  dealGame,
  findSmartMove,
  foundationAccepts,
  isOrderedRun,
  isWin,
  maxSupermove,
  orderedTailLength,
  safeToAutoplay,
  stacks,
  type FreeCellState,
} from "./engine";

function idOf(rank: number, suit: Suit): number {
  const suitIdx = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 }[suit];
  return (rank - 1) * 4 + suitIdx;
}

function card(rank: number, suit: Suit): Card {
  return cardFromId(idOf(rank, suit));
}

function emptyState(overrides: Partial<FreeCellState> = {}): FreeCellState {
  return {
    cascades: [[], [], [], [], [], [], [], []],
    free: [null, null, null, null],
    foundations: [[], [], [], []],
    dealNumber: 1,
    moves: 0,
    ...overrides,
  };
}

describe("freecell deal", () => {
  test("deals 8 cascades sized 7,7,7,7,6,6,6,6", () => {
    const cascades = dealDeck(1);
    expect(cascades.map((c) => c.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
  });

  test("uses all 52 distinct cards", () => {
    const ids = new Set(dealDeck(1).flat().map((c) => c.id));
    expect(ids.size).toBe(52);
    expect(Math.min(...ids)).toBe(0);
    expect(Math.max(...ids)).toBe(51);
  });

  test("is deterministic for a given deal number", () => {
    const a = dealDeck(617).flat().map((c) => c.id);
    const b = dealDeck(617).flat().map((c) => c.id);
    expect(a).toEqual(b);
  });

  test("different deal numbers differ", () => {
    const a = dealDeck(1).flat().map((c) => c.id);
    const b = dealDeck(2).flat().map((c) => c.id);
    expect(a).not.toEqual(b);
  });

  test("reproduces Microsoft deal #1 (first card is the Jack of Diamonds)", () => {
    const first = dealDeck(1)[0]![0]!;
    expect(first.rank).toBe(11);
    expect(first.suit).toBe("diamonds");
    expect(first.id).toBe(41);
  });
});

describe("card encoding", () => {
  test("id 0 is the Ace of Clubs, id 51 is the King of Spades", () => {
    expect(cardFromId(0)).toMatchObject({ rank: 1, suit: "clubs", color: "black" });
    expect(cardFromId(51)).toMatchObject({ rank: 13, suit: "spades", color: "black" });
  });

  test("diamonds and hearts are red", () => {
    expect(card(5, "diamonds").color).toBe("red");
    expect(card(9, "hearts").color).toBe("red");
  });
});

describe("stacking rules", () => {
  test("a card stacks on the next-higher opposite color", () => {
    expect(stacks(card(6, "hearts"), card(7, "spades"))).toBe(true);
    expect(stacks(card(6, "hearts"), card(7, "diamonds"))).toBe(false); // same color
    expect(stacks(card(6, "hearts"), card(8, "spades"))).toBe(false); // wrong rank
  });

  test("anything stacks onto an empty column", () => {
    expect(stacks(card(1, "clubs"), undefined)).toBe(true);
  });

  test("isOrderedRun and orderedTailLength", () => {
    const run = [card(7, "spades"), card(6, "hearts"), card(5, "clubs")];
    expect(isOrderedRun(run)).toBe(true);
    expect(isOrderedRun([card(7, "spades"), card(6, "spades")])).toBe(false);
    expect(orderedTailLength([card(9, "clubs"), card(7, "spades"), card(6, "hearts")])).toBe(2);
  });
});

describe("supermove capacity", () => {
  test("(free + 1) with no empty columns", () => {
    const state = emptyState({ cascades: [[card(2, "clubs")], [card(3, "clubs")], [], [], [], [], [], []] });
    state.cascades[2] = [card(9, "clubs")];
    state.cascades[3] = [card(9, "diamonds")];
    state.cascades[4] = [card(9, "hearts")];
    state.cascades[5] = [card(9, "spades")];
    state.cascades[6] = [card(10, "clubs")];
    state.cascades[7] = [card(10, "diamonds")];
    expect(maxSupermove(state, 0)).toBe(5); // 4 free cells, 0 empty columns
  });

  test("doubles per empty column, and halves into an empty column", () => {
    const state = emptyState();
    state.cascades[0] = [card(9, "clubs")];
    // columns 1..7 empty -> moving onto column 0 (non-empty): 7 empty columns
    expect(maxSupermove(state, 0)).toBe((4 + 1) * 2 ** 7);
    // moving into empty column 1: that column is excluded -> 6 empty others
    expect(maxSupermove(state, 1)).toBe((4 + 1) * 2 ** 6);
  });
});

describe("foundations", () => {
  test("accepts an ace onto an empty pile then the next rank", () => {
    const state = emptyState();
    expect(foundationAccepts(state, card(1, "hearts"))).toBe(2); // hearts index
    expect(foundationAccepts(state, card(2, "hearts"))).toBeNull();
    state.foundations[2] = [card(1, "hearts")];
    expect(foundationAccepts(state, card(2, "hearts"))).toBe(2);
    expect(foundationAccepts(state, card(3, "hearts"))).toBeNull();
  });
});

describe("applyMove", () => {
  test("moves a cascade bottom card to its foundation", () => {
    const state = emptyState({ cascades: [[card(5, "clubs"), card(1, "clubs")], [], [], [], [], [], [], []] });
    const next = applyMove(state, { type: "toFoundation", from: { zone: "cascade", index: 0 } });
    expect(next).not.toBeNull();
    expect(next!.foundations[0]).toHaveLength(1);
    expect(next!.cascades[0]).toHaveLength(1);
    expect(next!.moves).toBe(1);
    // original untouched (immutability)
    expect(state.cascades[0]).toHaveLength(2);
  });

  test("rejects an illegal foundation move", () => {
    const state = emptyState({ cascades: [[card(5, "clubs")], [], [], [], [], [], [], []] });
    expect(applyMove(state, { type: "toFoundation", from: { zone: "cascade", index: 0 } })).toBeNull();
  });

  test("moves a card to a free cell and back to a cascade", () => {
    const state = emptyState({ cascades: [[card(5, "clubs")], [card(6, "hearts")], [], [], [], [], [], []] });
    const toFree = applyMove(state, { type: "toFree", from: { zone: "cascade", index: 0 }, freeIndex: 1 });
    expect(toFree!.free[1]).toMatchObject({ rank: 5, suit: "clubs" });
    const back = applyMove(toFree!, { type: "freeToCascade", freeIndex: 1, toCol: 1 });
    expect(back!.cascades[1]).toHaveLength(2);
    expect(back!.free[1]).toBeNull();
  });

  test("enforces the supermove limit on a run", () => {
    // A 3-card ordered run with only 1 free cell and no empty columns -> max 2.
    const run = [card(8, "spades"), card(7, "hearts"), card(6, "spades")];
    const state = emptyState({
      cascades: [run, [card(9, "diamonds")], [], [], [], [], [], []],
      free: [card(1, "clubs"), card(1, "diamonds"), card(1, "hearts"), null],
    });
    state.cascades[2] = [card(2, "clubs")];
    state.cascades[3] = [card(2, "diamonds")];
    state.cascades[4] = [card(2, "hearts")];
    state.cascades[5] = [card(2, "spades")];
    state.cascades[6] = [card(3, "clubs")];
    state.cascades[7] = [card(3, "diamonds")];
    expect(maxSupermove(state, 1)).toBe(2);
    expect(applyMove(state, { type: "run", fromCol: 0, count: 3, toCol: 1 })).toBeNull();
    expect(applyMove(state, { type: "run", fromCol: 0, count: 2, toCol: 1 })).toBeNull(); // 7 onto 9 illegal
  });

  test("moves a legal ordered run onto a matching column", () => {
    const run = [card(7, "hearts"), card(6, "spades")];
    const state = emptyState({ cascades: [run, [card(8, "clubs")], [], [], [], [], [], []] });
    const next = applyMove(state, { type: "run", fromCol: 0, count: 2, toCol: 1 });
    expect(next).not.toBeNull();
    expect(next!.cascades[1].map((c) => c.rank)).toEqual([8, 7, 6]);
    expect(next!.cascades[0]).toHaveLength(0);
  });
});

describe("smart move", () => {
  test("sends an exposed ace to the foundation", () => {
    const state = emptyState({ cascades: [[card(9, "clubs"), card(1, "spades")], [], [], [], [], [], [], []] });
    const move = findSmartMove(state, "cascade", 0, 1);
    expect(move).toEqual({ type: "toFoundation", from: { zone: "cascade", index: 0 } });
  });

  test("prefers a tableau landing over a free cell", () => {
    const state = emptyState({ cascades: [[card(6, "hearts")], [card(7, "spades")], [], [], [], [], [], []] });
    const move = findSmartMove(state, "cascade", 0, 1);
    expect(move).toEqual({ type: "run", fromCol: 0, count: 1, toCol: 1 });
  });

  test("returns null when nothing legal exists", () => {
    const state = emptyState({
      cascades: [[card(5, "clubs")], [card(5, "hearts")], [card(5, "spades")], [card(5, "diamonds")], [card(9, "clubs")], [card(9, "hearts")], [card(9, "spades")], [card(9, "diamonds")]],
      free: [card(2, "clubs"), card(2, "diamonds"), card(2, "hearts"), card(2, "spades")],
    });
    expect(findSmartMove(state, "cascade", 0, 1)).toBeNull();
  });
});

describe("safe auto-play", () => {
  test("aces and twos are always safe", () => {
    const state = emptyState();
    expect(safeToAutoplay(state, card(1, "hearts"))).toBe(true);
    expect(safeToAutoplay(state, card(2, "spades"))).toBe(true);
  });

  test("a higher card is safe only once both opposite foundations catch up", () => {
    const state = emptyState();
    state.foundations[0] = [card(1, "clubs"), card(2, "clubs")]; // clubs to 2
    state.foundations[3] = [card(1, "spades")]; // spades to 1
    expect(safeToAutoplay(state, card(3, "hearts"))).toBe(false); // needs both black >= 2
    state.foundations[3] = [card(1, "spades"), card(2, "spades")]; // spades to 2
    expect(safeToAutoplay(state, card(3, "hearts"))).toBe(true);
  });

  test("autoCollectSafe vacuums exposed aces", () => {
    const state = emptyState({
      cascades: [[card(9, "clubs"), card(1, "clubs")], [card(1, "diamonds")], [], [], [], [], [], []],
      free: [card(1, "hearts"), null, null, null],
    });
    const next = autoCollectSafe(state);
    expect(next.foundations[0]).toHaveLength(1); // A clubs
    expect(next.foundations[1]).toHaveLength(1); // A diamonds
    expect(next.foundations[2]).toHaveLength(1); // A hearts (from free)
    expect(next.free[0]).toBeNull();
  });
});

describe("win detection", () => {
  test("full foundations win", () => {
    const state = emptyState();
    for (const suit of ["clubs", "diamonds", "hearts", "spades"] as const) {
      const idx = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 }[suit];
      state.foundations[idx] = Array.from({ length: 13 }, (_, r) => card(r + 1, suit));
    }
    expect(isWin(state)).toBe(true);
  });

  test("a fresh deal is not won", () => {
    expect(isWin(dealGame(1))).toBe(false);
  });
});
