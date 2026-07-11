import { describe, expect, test } from "bun:test";

import { applyDeal, applyMoveCard, applySmart, applyUndo, newSession, type SpiderSession } from "./session";
import { type Card, type Rank, type Suit } from "./spider/engine";

function c(suit: Suit, rank: Rank, faceUp = true, id = 0): Card {
  return { id, suit, rank, faceUp };
}

function runCards(suit: Suit, from: number, to: number): Card[] {
  const out: Card[] = [];
  for (let r = from; r >= to; r -= 1) out.push(c(suit, r as Rank, true, r));
  return out;
}

describe("session reducer", () => {
  test("newSession deals a full 104-card board with the chosen difficulty", () => {
    const session = newSession("session-seed", "seed", 2);
    const total =
      session.state.stock.length + session.state.tableau.reduce((sum, pile) => sum + pile.length, 0);
    expect(total).toBe(104);
    expect(session.state.suits).toBe(2);
    expect(session.history.length).toBe(0);
    expect(session.state.score).toBe(500);
  });

  test("a move records history and undo restores the prior state", () => {
    const base = newSession("undo-seed", "seed", 4);
    const session: SpiderSession = {
      ...base,
      state: { ...base.state, tableau: base.state.tableau.map(() => [] as Card[]) },
    };
    session.state.tableau[0] = [c("hearts", 6)];
    session.state.tableau[1] = [c("spades", 7)];
    const moved = applyMoveCard(session, { pile: 0, index: 0 }, { pile: 1 });
    expect(moved.state.tableau[1].length).toBe(2);
    expect(moved.history.length).toBe(1);
    const undone = applyUndo(moved);
    expect(undone.state.tableau[1].length).toBe(1);
    expect(undone.history.length).toBe(0);
  });

  test("dealing from stock advances history", () => {
    const session = newSession("deal-seed", "seed", 1);
    const dealt = applyDeal(session);
    expect(dealt.history.length).toBe(1);
    expect(dealt.state.stock.length).toBe(session.state.stock.length - 10);
  });

  test("completing the last suit records a time and reports a personal best", () => {
    const base = newSession("win-seed", "seed", 1);
    const empty: Card[][] = Array.from({ length: 10 }, () => []);
    empty[0] = [c("spades", 4, false, 90), ...runCards("spades", 13, 2)];
    empty[1] = [c("spades", 1, true, 1)];
    const session: SpiderSession = {
      ...base,
      startedAtMs: Date.now() - 5000,
      state: {
        ...base.state,
        stock: [],
        tableau: empty,
        completed: ["spades", "spades", "spades", "spades", "spades", "spades", "spades"],
      },
    };
    const next = applyMoveCard(session, { pile: 1, index: 0 }, { pile: 0 });
    expect(next.state.won).toBe(true);
    expect(next.finishedMs).not.toBeNull();
    expect(next.improved).toContain("time1");
    expect(next.bests.time).not.toBeNull();
  });

  test("undo is a no-op once the game is won", () => {
    const base = newSession("won-seed", "seed", 1);
    const won: SpiderSession = { ...base, state: { ...base.state, won: true }, history: [base.state] };
    expect(applyUndo(won)).toBe(won);
  });

  test("a rejected smart move leaves the session untouched", () => {
    const base = newSession("noop-seed", "seed", 4);
    const session: SpiderSession = {
      ...base,
      state: { ...base.state, tableau: base.state.tableau.map(() => [] as Card[]) },
    };
    session.state.tableau[0] = [c("hearts", 6)];
    session.state.tableau[1] = [c("spades", 9)];
    expect(applySmart(session, { pile: 0, index: 0 })).toBe(session);
  });
});
