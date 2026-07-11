import { describe, expect, test } from "bun:test";

import type { RecordStorage } from "@jgengine/core/game/recordBook";

import { cardId } from "./cards";
import { createPokerGame } from "./poker";

function memStorage(): RecordStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("poker — initial state", () => {
  test("fresh game is bet-ready with the starting bank", () => {
    const game = createPokerGame({ storage: null, seed: 1, startBank: 200 });
    const s = game.getState();
    expect(s.bank).toBe(200);
    expect(s.bet).toBe(1);
    expect(s.phase).toBe("bet");
    expect(s.canBet).toBe(true);
    expect(s.canDeal).toBe(true);
    expect(s.canDraw).toBe(false);
    expect(s.broke).toBe(false);
    expect(s.hand.length).toBe(0);
  });
});

describe("poker — betting", () => {
  test("bet one increments and wraps 5 -> 1", () => {
    const game = createPokerGame({ storage: null, seed: 1 });
    game.betOne();
    expect(game.getState().bet).toBe(2);
    game.betMax();
    expect(game.getState().bet).toBe(5);
    game.betOne();
    expect(game.getState().bet).toBe(1);
  });
  test("setBet clamps into 1..5", () => {
    const game = createPokerGame({ storage: null, seed: 1 });
    game.setBet(9);
    expect(game.getState().bet).toBe(5);
    game.setBet(0);
    expect(game.getState().bet).toBe(1);
  });
  test("bet cannot change during the draw phase", () => {
    const game = createPokerGame({ storage: null, seed: 1 });
    game.betMax();
    game.deal();
    game.betOne();
    expect(game.getState().bet).toBe(5);
    expect(game.getState().canBet).toBe(false);
  });
});

describe("poker — deal / draw state machine", () => {
  test("deal charges the bet, deals five cards, and enters draw", () => {
    const game = createPokerGame({ storage: null, seed: 3, startBank: 200 });
    game.setBet(5);
    game.deal();
    const s = game.getState();
    expect(s.bank).toBe(195);
    expect(s.phase).toBe("draw");
    expect(s.hand.length).toBe(5);
    expect(s.held).toEqual([false, false, false, false, false]);
    expect(s.canDraw).toBe(true);
    expect(s.canDeal).toBe(false);
  });

  test("same seed produces the identical deal (determinism)", () => {
    const a = createPokerGame({ storage: null, seed: 99 });
    const b = createPokerGame({ storage: null, seed: 99 });
    a.deal();
    b.deal();
    expect(a.getState().hand.map(cardId)).toEqual(b.getState().hand.map(cardId));
  });

  test("holding all five keeps the exact hand through the draw", () => {
    const game = createPokerGame({ storage: null, seed: 12 });
    game.deal();
    const dealt = game.getState().hand.map(cardId);
    for (let i = 0; i < 5; i += 1) game.toggleHold(i);
    game.draw();
    expect(game.getState().hand.map(cardId)).toEqual(dealt);
    expect(game.getState().phase).toBe("bet");
  });

  test("toggleHold is a no-op outside the draw phase", () => {
    const game = createPokerGame({ storage: null, seed: 5 });
    game.toggleHold(0);
    expect(game.getState().held).toEqual([false, false, false, false, false]);
  });

  test("draw resolves a result, advances resultId, and returns to bet", () => {
    const game = createPokerGame({ storage: null, seed: 5 });
    game.deal();
    game.draw();
    const s = game.getState();
    expect(s.phase).toBe("bet");
    expect(s.lastCategory).not.toBeNull();
    expect(s.resultId).toBe(1);
    expect(s.hand.length).toBe(5);
  });

  test("full deal+draw with the same seed is fully deterministic", () => {
    const a = createPokerGame({ storage: null, seed: 77 });
    const b = createPokerGame({ storage: null, seed: 77 });
    a.deal();
    b.deal();
    a.draw();
    b.draw();
    expect(a.getState().hand.map(cardId)).toEqual(b.getState().hand.map(cardId));
    expect(a.getState().lastCategory).toBe(b.getState().lastCategory);
    expect(a.getState().lastWin).toBe(b.getState().lastWin);
  });
});

describe("poker — broke and rebuy", () => {
  test("a bank below the minimum bet reports broke and blocks the deal", () => {
    const game = createPokerGame({ storage: null, seed: 1, startBank: 0 });
    const s = game.getState();
    expect(s.broke).toBe(true);
    expect(s.canDeal).toBe(false);
    game.deal();
    expect(game.getState().phase).toBe("bet");
  });
  test("rebuy restores the bank and clears broke", () => {
    const game = createPokerGame({ storage: null, seed: 1, startBank: 0 });
    game.rebuy();
    const s = game.getState();
    expect(s.bank).toBe(200);
    expect(s.broke).toBe(false);
    expect(s.canDeal).toBe(true);
  });
  test("rebuy does nothing while still solvent", () => {
    const game = createPokerGame({ storage: null, seed: 1, startBank: 50 });
    game.rebuy();
    expect(game.getState().bank).toBe(50);
  });
});

describe("poker — persistence", () => {
  test("bank and seed survive across game instances sharing storage", () => {
    const storage = memStorage();
    const first = createPokerGame({ storage, seed: 7 });
    first.betMax();
    first.deal();
    first.draw();
    const bankAfter = first.getState().bank;
    expect(Number(storage.map.get("videopoker:bank"))).toBe(bankAfter);

    const second = createPokerGame({ storage });
    expect(second.getState().bank).toBe(bankAfter);
  });

  test("records book captures a peak-bank personal best", () => {
    const storage = memStorage();
    const game = createPokerGame({ storage, seed: 4 });
    game.deal();
    game.draw();
    expect(game.getState().records.peakBank).not.toBeNull();
  });
});

describe("poker — subscription", () => {
  test("subscribers are notified on state changes", () => {
    const game = createPokerGame({ storage: null, seed: 1 });
    let calls = 0;
    const unsubscribe = game.subscribe(() => {
      calls += 1;
    });
    game.betOne();
    game.deal();
    expect(calls).toBe(2);
    unsubscribe();
    game.draw();
    expect(calls).toBe(2);
  });
});
