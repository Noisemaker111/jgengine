import { describe, expect, test } from "bun:test";

import type { Card, Rank, Suit } from "./klondike/engine";
import { applyAutoStep, applyDraw, applyMoveCard, applyUndo, newSession, type KlondikeSession } from "./session";

function c(suit: Suit, rank: Rank): Card {
  return { suit, rank, faceUp: true };
}

function fill(suit: Suit, upTo: number): Card[] {
  const out: Card[] = [];
  for (let r = 1; r <= upTo; r += 1) out.push(c(suit, r as Rank));
  return out;
}

describe("session reducer", () => {
  test("newSession deals a full 52-card board", () => {
    const session = newSession("session-seed", "seed", 3);
    const { state } = session;
    const total =
      state.stock.length +
      state.waste.length +
      state.tableau.reduce((sum, pile) => sum + pile.length, 0);
    expect(total).toBe(52);
    expect(state.drawMode).toBe(3);
    expect(session.history.length).toBe(0);
  });

  test("draw then undo restores the prior state", () => {
    const dealt = newSession("draw-undo", "seed", 3);
    const drawn = applyDraw(dealt);
    expect(drawn.state.waste.length).toBe(3);
    expect(drawn.history.length).toBe(1);
    const undone = applyUndo(drawn);
    expect(undone.state.waste.length).toBe(0);
    expect(undone.history.length).toBe(0);
  });

  test("completing a board records the time and reports a personal best", () => {
    const base = newSession("win", "seed", 1);
    const session: KlondikeSession = {
      ...base,
      startedAtMs: Date.now() - 4000,
      state: {
        ...base.state,
        stock: [],
        waste: [c("spades", 13)],
        tableau: [[], [], [], [], [], [], []],
        foundations: {
          spades: fill("spades", 12),
          hearts: fill("hearts", 13),
          diamonds: fill("diamonds", 13),
          clubs: fill("clubs", 13),
        },
      },
    };
    const next = applyMoveCard(session, { zone: "waste" }, { zone: "foundation" });
    expect(next.state.won).toBe(true);
    expect(next.finishedMs).not.toBeNull();
    expect((next.finishedMs ?? 0) >= 0).toBe(true);
    expect(next.improved).toContain("time1");
    expect(next.bests.time).not.toBeNull();
  });

  test("auto-stepping an all-face-up session drives it to a win", () => {
    const base = newSession("auto-session", "seed", 1);
    const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
    const tableau: Card[][] = [[], [], [], [], [], [], []];
    for (let i = 0; i < suits.length; i += 1) {
      const pile: Card[] = [];
      for (let r = 13; r >= 1; r -= 1) pile.push(c(suits[i], r as Rank));
      tableau[i] = pile;
    }
    let session: KlondikeSession = {
      ...base,
      startedAtMs: Date.now(),
      state: {
        ...base.state,
        stock: [],
        waste: [],
        tableau,
        foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
      },
    };
    let guard = 0;
    while (!session.state.won && guard < 400) {
      const next = applyAutoStep(session);
      if (next === session) break;
      session = next;
      guard += 1;
    }
    expect(session.state.won).toBe(true);
  });
});
