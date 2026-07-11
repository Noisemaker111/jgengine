import { describe, expect, test } from "bun:test";

import {
  autoStep,
  canAutoComplete,
  cardId,
  checkWin,
  deal,
  drawStock,
  foundationCount,
  moveCard,
  smartMove,
  type Card,
  type DrawMode,
  type KlondikeState,
  type Rank,
  type Suit,
} from "./engine";

function emptyState(drawMode: DrawMode = 1): KlondikeState {
  return {
    stock: [],
    waste: [],
    foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
    tableau: [[], [], [], [], [], [], []],
    drawMode,
    score: 0,
    moves: 0,
    recycles: 0,
    won: false,
  };
}

function c(suit: Suit, rank: Rank, faceUp = true): Card {
  return { suit, rank, faceUp };
}

function fill(suit: Suit, upTo: number): Card[] {
  const out: Card[] = [];
  for (let r = 1; r <= upTo; r += 1) out.push(c(suit, r as Rank));
  return out;
}

function deckIds(state: KlondikeState): string[] {
  return [...state.stock, ...state.tableau.flat()].map(cardId);
}

describe("klondike deal", () => {
  const state = deal("alpha", 1);

  test("has 52 unique cards", () => {
    const all = [
      ...state.stock,
      ...state.waste,
      ...state.tableau.flat(),
      ...state.foundations.spades,
      ...state.foundations.hearts,
      ...state.foundations.diamonds,
      ...state.foundations.clubs,
    ];
    expect(all.length).toBe(52);
    expect(new Set(all.map(cardId)).size).toBe(52);
  });

  test("tableau piles fan 1..7 with only the top face up", () => {
    for (let pile = 0; pile < 7; pile += 1) {
      const cards = state.tableau[pile];
      expect(cards.length).toBe(pile + 1);
      for (let i = 0; i < cards.length; i += 1) {
        expect(cards[i].faceUp).toBe(i === pile);
      }
    }
  });

  test("stock holds the remaining 24 face-down cards, waste + foundations empty", () => {
    expect(state.stock.length).toBe(24);
    expect(state.stock.every((card) => !card.faceUp)).toBe(true);
    expect(state.waste.length).toBe(0);
    expect(foundationCount(state)).toBe(0);
  });

  test("is deterministic for a seed and diverges across seeds", () => {
    expect(deckIds(deal("alpha", 1))).toEqual(deckIds(state));
    expect(deckIds(deal("beta", 1))).not.toEqual(deckIds(state));
  });
});

describe("stock draw + recycle", () => {
  test("draw-1 flips one card face up to the waste", () => {
    const base = deal("draw-seed", 1);
    const next = drawStock(base);
    expect(next).not.toBeNull();
    expect(next?.waste.length).toBe(1);
    expect(next?.waste[0].faceUp).toBe(true);
    expect(next?.stock.length).toBe(23);
    expect(next?.moves).toBe(1);
  });

  test("draw-3 flips three cards", () => {
    const base = deal("draw-seed", 3);
    const next = drawStock(base);
    expect(next?.waste.length).toBe(3);
    expect(next?.stock.length).toBe(21);
  });

  test("recycling an empty stock refills it face-down and penalises draw-1", () => {
    const base = emptyState(1);
    base.score = 150;
    base.waste = [c("spades", 3), c("hearts", 4)];
    const next = drawStock(base);
    expect(next?.stock.length).toBe(2);
    expect(next?.stock.every((card) => !card.faceUp)).toBe(true);
    expect(next?.waste.length).toBe(0);
    expect(next?.recycles).toBe(1);
    expect(next?.score).toBe(50);
  });

  test("recycle preserves draw order so the cycle repeats", () => {
    const base = emptyState(1);
    base.waste = [c("spades", 3), c("hearts", 4), c("clubs", 5)];
    const recycled = drawStock(base);
    const drawn = drawStock(recycled as KlondikeState);
    expect(drawn?.waste[0] && cardId(drawn.waste[0])).toBe("spades-3");
  });

  test("draw-3 recycle carries no score penalty", () => {
    const base = emptyState(3);
    base.score = 40;
    base.waste = [c("spades", 3)];
    const next = drawStock(base);
    expect(next?.score).toBe(40);
  });
});

describe("moves + scoring", () => {
  test("waste ace to foundation scores 10", () => {
    const base = emptyState();
    base.waste = [c("hearts", 1)];
    const next = moveCard(base, { zone: "waste" }, { zone: "foundation" });
    expect(next?.foundations.hearts.length).toBe(1);
    expect(next?.waste.length).toBe(0);
    expect(next?.score).toBe(10);
  });

  test("non-ace onto an empty foundation is rejected", () => {
    const base = emptyState();
    base.waste = [c("spades", 2)];
    expect(moveCard(base, { zone: "waste" }, { zone: "foundation" })).toBeNull();
  });

  test("tableau top to foundation scores 10 and flips the newly exposed card", () => {
    const base = emptyState();
    base.foundations.clubs = fill("clubs", 4);
    base.tableau[0] = [c("hearts", 9, false), c("clubs", 5)];
    const next = moveCard(base, { zone: "tableau", pile: 0, index: 1 }, { zone: "foundation" });
    expect(next?.foundations.clubs.length).toBe(5);
    expect(next?.tableau[0].length).toBe(1);
    expect(next?.tableau[0][0].faceUp).toBe(true);
    expect(next?.score).toBe(SCORE_TABLEAU_TO_FOUNDATION_PLUS_FLIP);
  });

  test("waste to tableau scores 5", () => {
    const base = emptyState();
    base.waste = [c("hearts", 6)];
    base.tableau[0] = [c("spades", 7)];
    const next = moveCard(base, { zone: "waste" }, { zone: "tableau", pile: 0 });
    expect(next?.tableau[0].length).toBe(2);
    expect(next?.score).toBe(5);
  });

  test("a valid alternating run moves as a unit onto another pile", () => {
    const base = emptyState();
    base.tableau[0] = [c("spades", 7), c("hearts", 6), c("clubs", 5)];
    base.tableau[1] = [c("diamonds", 8)];
    const next = moveCard(base, { zone: "tableau", pile: 0, index: 0 }, { zone: "tableau", pile: 1 });
    expect(next?.tableau[1].length).toBe(4);
    expect(next?.tableau[0].length).toBe(0);
    expect(next?.score).toBe(0);
  });

  test("an invalid (same-color) run cannot be picked up", () => {
    const base = emptyState();
    base.tableau[0] = [c("spades", 7), c("spades", 6)];
    base.tableau[1] = [c("diamonds", 8)];
    expect(moveCard(base, { zone: "tableau", pile: 0, index: 0 }, { zone: "tableau", pile: 1 })).toBeNull();
  });

  test("only a king may land on an empty column", () => {
    const base = emptyState();
    base.waste = [c("spades", 12)];
    expect(moveCard(base, { zone: "waste" }, { zone: "tableau", pile: 3 })).toBeNull();
    base.waste = [c("spades", 13)];
    expect(moveCard(base, { zone: "waste" }, { zone: "tableau", pile: 3 })?.tableau[3].length).toBe(1);
  });

  test("foundation back to tableau costs 15 points", () => {
    const base = emptyState();
    base.score = 20;
    base.foundations.spades = [c("spades", 1)];
    base.tableau[0] = [c("hearts", 2)];
    const next = moveCard(base, { zone: "foundation", suit: "spades" }, { zone: "tableau", pile: 0 });
    expect(next?.foundations.spades.length).toBe(0);
    expect(next?.tableau[0].length).toBe(2);
    expect(next?.score).toBe(5);
  });

  test("score never drops below zero", () => {
    const base = emptyState();
    base.foundations.spades = [c("spades", 1)];
    base.tableau[0] = [c("hearts", 2)];
    const next = moveCard(base, { zone: "foundation", suit: "spades" }, { zone: "tableau", pile: 0 });
    expect(next?.score).toBe(0);
  });
});

describe("win detection", () => {
  test("completing the final foundation wins", () => {
    const base = emptyState();
    base.foundations.spades = fill("spades", 12);
    base.foundations.hearts = fill("hearts", 13);
    base.foundations.diamonds = fill("diamonds", 13);
    base.foundations.clubs = fill("clubs", 13);
    base.waste = [c("spades", 13)];
    expect(checkWin(base)).toBe(false);
    const next = moveCard(base, { zone: "waste" }, { zone: "foundation" });
    expect(next?.won).toBe(true);
    expect(foundationCount(next as KlondikeState)).toBe(52);
  });
});

describe("smart move", () => {
  test("sends a waste ace straight to its foundation", () => {
    const base = emptyState();
    base.waste = [c("hearts", 1)];
    const next = smartMove(base, { zone: "waste" });
    expect(next?.foundations.hearts.length).toBe(1);
  });

  test("routes a card with no foundation slot onto a matching tableau pile", () => {
    const base = emptyState();
    base.waste = [c("clubs", 5)];
    base.tableau[0] = [c("diamonds", 6)];
    const next = smartMove(base, { zone: "waste" });
    expect(next?.tableau[0].length).toBe(2);
    expect(next?.waste.length).toBe(0);
  });

  test("does not shuffle a whole king column onto another empty column", () => {
    const base = emptyState();
    base.tableau[0] = [c("spades", 13)];
    expect(smartMove(base, { zone: "tableau", pile: 0, index: 0 })).toBeNull();
  });

  test("returns null when nothing legal exists", () => {
    const base = emptyState();
    base.waste = [c("spades", 8)];
    expect(smartMove(base, { zone: "waste" })).toBeNull();
  });
});

describe("auto complete", () => {
  test("is unavailable while face-down cards remain", () => {
    expect(canAutoComplete(deal("auto", 1))).toBe(false);
  });

  test("drains an all-face-up layout to a full win", () => {
    let state = emptyState();
    const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
    for (let i = 0; i < suits.length; i += 1) {
      const pile: Card[] = [];
      for (let r = 13; r >= 1; r -= 1) pile.push(c(suits[i], r as Rank));
      state.tableau[i] = pile;
    }
    expect(canAutoComplete(state)).toBe(true);
    let guard = 0;
    while (!state.won && guard < 200) {
      const next = autoStep(state);
      if (next === null) break;
      state = next;
      guard += 1;
    }
    expect(state.won).toBe(true);
    expect(foundationCount(state)).toBe(52);
  });
});

const SCORE_TABLEAU_TO_FOUNDATION_PLUS_FLIP = 15;
