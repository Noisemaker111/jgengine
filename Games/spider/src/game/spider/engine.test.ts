import { describe, expect, test } from "bun:test";

import {
  canDeal,
  cardId,
  checkWin,
  color,
  deal,
  dealFromStock,
  dealsRemaining,
  foundationCount,
  moveCard,
  movableRun,
  smartMove,
  type Card,
  type Rank,
  type SpiderState,
  type Suit,
  type SuitCount,
} from "./engine";

function c(suit: Suit, rank: Rank, faceUp = true, id = 0): Card {
  return { id, suit, rank, faceUp };
}

function emptyState(suits: SuitCount = 1): SpiderState {
  return {
    tableau: [[], [], [], [], [], [], [], [], [], []],
    stock: [],
    completed: [],
    suits,
    score: 500,
    moves: 0,
    won: false,
  };
}

function run(suit: Suit, from: number, to: number, faceUp = true): Card[] {
  const out: Card[] = [];
  for (let r = from; r >= to; r -= 1) out.push(c(suit, r as Rank, faceUp, r));
  return out;
}

function allCards(state: SpiderState): Card[] {
  return [...state.stock, ...state.tableau.flat()];
}

describe("spider deal", () => {
  test("deals 104 cards across 10 piles + stock", () => {
    const state = deal("alpha", 4);
    expect(allCards(state).length).toBe(104);
  });

  test("first four piles hold 6, the rest 5, only the top face up", () => {
    const state = deal("alpha", 2);
    for (let pile = 0; pile < 10; pile += 1) {
      const cards = state.tableau[pile];
      expect(cards.length).toBe(pile < 4 ? 6 : 5);
      for (let i = 0; i < cards.length; i += 1) {
        expect(cards[i].faceUp).toBe(i === cards.length - 1);
      }
    }
  });

  test("stock holds 50 face-down cards = five deals", () => {
    const state = deal("alpha", 4);
    expect(state.stock.length).toBe(50);
    expect(state.stock.every((card) => !card.faceUp)).toBe(true);
    expect(dealsRemaining(state)).toBe(5);
  });

  test("one-suit deck is all spades, four-suit is two of each", () => {
    const one = deal("s", 1);
    expect(allCards(one).every((card) => card.suit === "spades")).toBe(true);
    const four = deal("s", 4);
    const counts: Record<Suit, number> = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
    for (const card of allCards(four)) counts[card.suit] += 1;
    expect(counts).toEqual({ spades: 26, hearts: 26, diamonds: 26, clubs: 26 });
  });

  test("two-suit deck is spades + hearts, four each", () => {
    const two = deal("s", 2);
    const suits = new Set(allCards(two).map((card) => card.suit));
    expect([...suits].sort()).toEqual(["hearts", "spades"]);
  });

  test("is deterministic per seed and diverges across seeds", () => {
    const ids = (s: SpiderState): string[] => allCards(s).map(cardId);
    expect(ids(deal("alpha", 4))).toEqual(ids(deal("alpha", 4)));
    expect(ids(deal("beta", 4))).not.toEqual(ids(deal("alpha", 4)));
  });

  test("red/black colouring", () => {
    expect(color("hearts")).toBe("red");
    expect(color("spades")).toBe("black");
  });
});

describe("movable runs", () => {
  test("a same-suit descending face-up sequence is movable", () => {
    const pile = run("spades", 8, 5);
    expect(movableRun(pile, 0)?.length).toBe(4);
  });

  test("a mixed-suit sequence is not movable as a unit", () => {
    const pile = [c("spades", 8), c("hearts", 7)];
    expect(movableRun(pile, 0)).toBeNull();
  });

  test("a face-down card breaks the run", () => {
    const pile = [c("spades", 8, false), c("spades", 7)];
    expect(movableRun(pile, 0)).toBeNull();
    expect(movableRun(pile, 1)?.length).toBe(1);
  });

  test("a broken rank sequence is not movable", () => {
    const pile = [c("spades", 8), c("spades", 6)];
    expect(movableRun(pile, 0)).toBeNull();
  });
});

describe("moving cards + scoring", () => {
  test("build down by rank regardless of suit; costs one point", () => {
    const base = emptyState(4);
    base.tableau[0] = [c("hearts", 6)];
    base.tableau[1] = [c("spades", 7)];
    const next = moveCard(base, { pile: 0, index: 0 }, { pile: 1 });
    expect(next?.tableau[1].length).toBe(2);
    expect(next?.tableau[0].length).toBe(0);
    expect(next?.score).toBe(499);
    expect(next?.moves).toBe(1);
  });

  test("a same-suit run moves as a unit onto a rank-fitting pile", () => {
    const base = emptyState(1);
    base.tableau[0] = run("spades", 7, 5);
    base.tableau[1] = [c("spades", 8)];
    const next = moveCard(base, { pile: 0, index: 0 }, { pile: 1 });
    expect(next?.tableau[1].length).toBe(4);
    expect(next?.tableau[0].length).toBe(0);
  });

  test("a mismatched rank target is rejected", () => {
    const base = emptyState(4);
    base.tableau[0] = [c("hearts", 6)];
    base.tableau[1] = [c("spades", 9)];
    expect(moveCard(base, { pile: 0, index: 0 }, { pile: 1 })).toBeNull();
  });

  test("empty piles accept anything", () => {
    const base = emptyState(4);
    base.tableau[0] = [c("hearts", 6)];
    const next = moveCard(base, { pile: 0, index: 0 }, { pile: 5 });
    expect(next?.tableau[5].length).toBe(1);
  });

  test("moving exposes and flips the newly revealed card", () => {
    const base = emptyState(4);
    base.tableau[0] = [c("clubs", 9, false), c("hearts", 6)];
    base.tableau[1] = [c("spades", 7)];
    const next = moveCard(base, { pile: 0, index: 1 }, { pile: 1 });
    expect(next?.tableau[0].length).toBe(1);
    expect(next?.tableau[0][0].faceUp).toBe(true);
  });

  test("moving a run onto its own pile is rejected", () => {
    const base = emptyState(1);
    base.tableau[0] = run("spades", 7, 5);
    expect(moveCard(base, { pile: 0, index: 0 }, { pile: 0 })).toBeNull();
  });

  test("score never drops below zero", () => {
    const base = emptyState(4);
    base.score = 0;
    base.tableau[0] = [c("hearts", 6)];
    base.tableau[1] = [c("spades", 7)];
    expect(moveCard(base, { pile: 0, index: 0 }, { pile: 1 })?.score).toBe(0);
  });
});

describe("completed runs auto-clear to a foundation", () => {
  test("assembling K→A of one suit clears it, adds 100, and flips beneath", () => {
    const base = emptyState(1);
    base.score = 400;
    base.tableau[0] = [c("spades", 4, false), ...run("spades", 13, 2)];
    base.tableau[1] = [c("spades", 1)];
    const next = moveCard(base, { pile: 1, index: 0 }, { pile: 0 });
    expect(next).not.toBeNull();
    expect(foundationCount(next as SpiderState)).toBe(1);
    expect((next as SpiderState).completed[0]).toBe("spades");
    expect((next as SpiderState).tableau[0].length).toBe(1);
    expect((next as SpiderState).tableau[0][0].faceUp).toBe(true);
    expect((next as SpiderState).score).toBe(400 - 1 + 100);
  });
});

describe("stock deal", () => {
  test("deals one card face up to every pile", () => {
    const base = emptyState(1);
    for (let p = 0; p < 10; p += 1) base.tableau[p] = [c("spades", 5, true, 100 + p)];
    for (let s = 0; s < 10; s += 1) base.stock.push(c("spades", 3, false, 200 + s));
    expect(canDeal(base)).toBe(true);
    const next = dealFromStock(base);
    expect(next).not.toBeNull();
    for (let p = 0; p < 10; p += 1) {
      expect((next as SpiderState).tableau[p].length).toBe(2);
      expect((next as SpiderState).tableau[p][1].faceUp).toBe(true);
    }
    expect((next as SpiderState).stock.length).toBe(0);
  });

  test("dealing is blocked while any pile is empty", () => {
    const base = emptyState(1);
    base.tableau[0] = [];
    for (let p = 1; p < 10; p += 1) base.tableau[p] = [c("spades", 5)];
    for (let s = 0; s < 10; s += 1) base.stock.push(c("spades", 3, false, s));
    expect(canDeal(base)).toBe(false);
    expect(dealFromStock(base)).toBeNull();
  });
});

describe("win detection", () => {
  test("clearing all eight suit runs wins", () => {
    const base = emptyState(4);
    base.completed = ["spades", "spades", "hearts", "hearts", "diamonds", "diamonds", "clubs"];
    base.score = 100;
    base.tableau[0] = [c("clubs", 2, false), ...run("clubs", 13, 2)];
    base.tableau[1] = [c("clubs", 1)];
    expect(checkWin(base)).toBe(false);
    const next = moveCard(base, { pile: 1, index: 0 }, { pile: 0 });
    expect(next?.won).toBe(true);
    expect(foundationCount(next as SpiderState)).toBe(8);
  });
});

describe("smart move", () => {
  test("prefers a same-suit continuation over an off-suit one", () => {
    const base = emptyState(4);
    base.tableau[0] = [c("hearts", 6)];
    base.tableau[1] = [c("spades", 7)];
    base.tableau[2] = [c("hearts", 7)];
    const next = smartMove(base, { pile: 0, index: 0 });
    expect(next?.tableau[2].length).toBe(2);
    expect(next?.tableau[1].length).toBe(1);
  });

  test("routes to any matching pile when no same-suit exists", () => {
    const base = emptyState(4);
    base.tableau[0] = [c("hearts", 6)];
    base.tableau[1] = [c("spades", 7)];
    const next = smartMove(base, { pile: 0, index: 0 });
    expect(next?.tableau[1].length).toBe(2);
  });

  test("does not dump a whole pile onto an empty column", () => {
    const base = emptyState(1);
    base.tableau[0] = [c("spades", 8)];
    expect(smartMove(base, { pile: 0, index: 0 })).toBeNull();
  });

  test("returns null when nothing legal exists", () => {
    const base = emptyState(4);
    base.tableau[0] = [c("hearts", 6)];
    base.tableau[1] = [c("spades", 9)];
    expect(smartMove(base, { pile: 0, index: 0 })).toBeNull();
  });
});
