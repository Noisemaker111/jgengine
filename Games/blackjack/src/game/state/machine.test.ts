import { describe, expect, test } from "bun:test";

import type { Card, Rank, Suit } from "../rules/deck";
import { handTotal } from "../rules/scoring";
import {
  canDouble,
  canSplit,
  createInitialState,
  deal,
  dealerStep,
  double,
  needsRebuy,
  rebuy,
  resolveInsurance,
  split,
  stand,
} from "./machine";
import type { TableState } from "./machine";

const c = (rank: Rank, suit: Suit = "S"): Card => ({ rank, suit });

function table(scripted: Card[], bet = 100): TableState {
  const state = createInitialState("machine-test");
  const filler: Card[] = Array.from({ length: 40 }, () => c("2"));
  state.shoe.cards = [...scripted, ...filler];
  state.shoe.pos = 0;
  state.bet = bet;
  return state;
}

function runDealer(state: TableState): void {
  let now = state.dealerDrawAt;
  for (let i = 0; i < 40 && state.phase === "dealer"; i += 1) {
    dealerStep(state, now);
    now = state.dealerDrawAt + 0.01;
  }
}

describe("dealer play", () => {
  test("stands on soft 17 without drawing", () => {
    const state = table([c("10"), c("6"), c("10"), c("A")]);
    deal(state);
    expect(state.phase).toBe("player");
    stand(state);
    expect(state.phase).toBe("dealer");
    runDealer(state);
    expect(state.phase).toBe("settle");
    expect(state.dealer.length).toBe(2);
    expect(handTotal(state.dealer)).toEqual({ total: 17, soft: true });
    expect(state.hands[0].outcome).toBe("win");
  });

  test("hits 16 and stands on the next total", () => {
    const state = table([c("10"), c("10"), c("10"), c("6"), c("5")]);
    deal(state);
    stand(state);
    runDealer(state);
    expect(state.dealer.length).toBe(3);
    expect(handTotal(state.dealer).total).toBe(21);
    expect(state.hands[0].outcome).toBe("lose");
  });
});

describe("splitting", () => {
  test("splits a pair into two hands, each drawing a card", () => {
    const state = table([c("8"), c("9"), c("8"), c("7"), c("5"), c("9")]);
    deal(state);
    expect(canSplit(state)).toBe(true);
    split(state);
    expect(state.hands.length).toBe(2);
    expect(state.hands[0].cards.length).toBe(2);
    expect(state.hands[0].fromSplit).toBe(true);
    expect(state.activeHand).toBe(0);
    stand(state);
    expect(state.activeHand).toBe(1);
    expect(state.hands[1].cards.length).toBe(2);
  });

  test("split aces take one card each and cannot double", () => {
    const state = table([c("A"), c("9"), c("A"), c("7"), c("K"), c("Q")]);
    deal(state);
    split(state);
    expect(state.hands.length).toBe(2);
    expect(state.hands[0].isSplitAces).toBe(true);
    expect(state.hands[0].cards.length).toBe(2);
    expect(state.hands[1].cards.length).toBe(2);
    expect(state.phase).toBe("dealer");
  });
});

describe("insurance flow", () => {
  test("insurance returns the bankroll to even when the dealer has blackjack", () => {
    const state = table([c("10"), c("A"), c("9"), c("10")]);
    deal(state);
    expect(state.phase).toBe("insurance");
    resolveInsurance(state, true);
    expect(state.phase).toBe("settle");
    expect(state.insuranceBet).toBe(50);
    expect(state.bank).toBe(1000);
    expect(state.history[0].net).toBe(0);
    expect(state.hands[0].outcome).toBe("lose");
  });

  test("declining insurance against a dealer blackjack loses the bet", () => {
    const state = table([c("10"), c("A"), c("9"), c("10")]);
    deal(state);
    resolveInsurance(state, false);
    expect(state.phase).toBe("settle");
    expect(state.insuranceBet).toBe(0);
    expect(state.bank).toBe(900);
  });
});

describe("naturals and doubles", () => {
  test("a player natural settles immediately and pays 3:2", () => {
    const state = table([c("A"), c("9"), c("K"), c("9")]);
    deal(state);
    expect(state.phase).toBe("settle");
    expect(state.hands[0].outcome).toBe("blackjack");
    expect(state.dealerHoleShown).toBe(true);
    expect(state.bank).toBe(1150);
  });

  test("double doubles the wager, draws exactly one card, and resolves", () => {
    const state = table([c("5"), c("9"), c("6"), c("8"), c("K")]);
    deal(state);
    expect(canDouble(state)).toBe(true);
    double(state);
    expect(state.bank).toBe(800);
    expect(state.hands[0].bet).toBe(200);
    expect(state.hands[0].cards.length).toBe(3);
    runDealer(state);
    expect(state.hands[0].outcome).toBe("win");
    expect(state.bank).toBe(1200);
  });
});

describe("shoe, rebuy, and persistence", () => {
  test("reshuffles once penetration passes the cut", () => {
    const state = createInitialState("resh");
    state.shoe.pos = Math.floor(state.shoe.cards.length * 0.75);
    state.bet = 100;
    const before = state.shoe.shuffleCount;
    deal(state);
    expect(state.shoe.shuffleCount).toBe(before + 1);
    expect(state.justShuffled).toBe(true);
  });

  test("the same seed builds an identical shoe", () => {
    expect(createInitialState("dup").shoe.cards).toEqual(createInitialState("dup").shoe.cards);
  });

  test("rebuy restores the bank when broke", () => {
    const state = createInitialState("rb", { bank: 0 });
    expect(needsRebuy(state)).toBe(true);
    rebuy(state);
    expect(state.bank).toBe(1000);
  });

  test("loads a persisted bank and records into the opening state", () => {
    const state = createInitialState("x", { bank: 1500, records: { peakBank: 2000, bestStreak: 5, handsWon: 40 } });
    expect(state.bank).toBe(1500);
    expect(state.records.peakBank).toBe(2000);
    expect(state.totalWon).toBe(40);
  });
});
