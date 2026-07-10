import { describe, expect, test } from "bun:test";

import type { Card, Rank, Suit } from "./deck";
import { freshShoe } from "./deck";
import { dealerShouldHit, handTotal, isBlackjack } from "./scoring";
import { settleHand, settleInsurance } from "./settle";
import { basicStrategy } from "./strategy";
import { shuffleWithRng } from "@jgengine/core/cards/cardPile";
import { seededRng } from "@jgengine/core/random/rng";

const c = (rank: Rank, suit: Suit = "S"): Card => ({ rank, suit });

describe("hand totals and soft aces", () => {
  test("single ace plus six is soft 17", () => {
    expect(handTotal([c("A"), c("6")])).toEqual({ total: 17, soft: true });
  });
  test("ace reduces to hard when it would bust", () => {
    expect(handTotal([c("A"), c("6"), c("K")])).toEqual({ total: 17, soft: false });
  });
  test("two aces are soft 12", () => {
    expect(handTotal([c("A"), c("A")])).toEqual({ total: 12, soft: true });
  });
  test("two aces plus nine is soft 21", () => {
    expect(handTotal([c("A"), c("A"), c("9")])).toEqual({ total: 21, soft: true });
  });
  test("multiple aces reduce fully to hard 21", () => {
    expect(handTotal([c("A"), c("A"), c("9"), c("K")])).toEqual({ total: 21, soft: false });
  });
  test("ace-seven is soft 18", () => {
    expect(handTotal([c("A"), c("7")])).toEqual({ total: 18, soft: true });
  });
});

describe("blackjack detection", () => {
  test("two-card 21 is blackjack", () => {
    expect(isBlackjack([c("A"), c("K")])).toBe(true);
  });
  test("three-card 21 is not blackjack", () => {
    expect(isBlackjack([c("A"), c("5"), c("5")])).toBe(false);
    expect(isBlackjack([c("7"), c("7"), c("7")])).toBe(false);
  });
});

describe("dealer stands on soft 17 (S17)", () => {
  test("stands on soft 17", () => {
    expect(dealerShouldHit({ total: 17, soft: true })).toBe(false);
  });
  test("stands on hard 17", () => {
    expect(dealerShouldHit({ total: 17, soft: false })).toBe(false);
  });
  test("hits 16", () => {
    expect(dealerShouldHit({ total: 16, soft: false })).toBe(true);
  });
  test("stands on 18", () => {
    expect(dealerShouldHit({ total: 18, soft: false })).toBe(false);
  });
  test("an H17 rule would hit soft 17", () => {
    expect(dealerShouldHit({ total: 17, soft: true }, true)).toBe(true);
  });
});

describe("settlement and payouts", () => {
  const bj = { playerBlackjack: false, dealerBlackjack: false };
  test("natural blackjack pays 3:2", () => {
    const r = settleHand({ playerCards: [c("A"), c("K")], dealerCards: [c("9"), c("9")], wager: 100, playerBlackjack: true, dealerBlackjack: false });
    expect(r).toEqual({ outcome: "blackjack", payout: 250, net: 150 });
  });
  test("blackjack versus blackjack pushes", () => {
    const r = settleHand({ playerCards: [c("A"), c("K")], dealerCards: [c("A"), c("K")], wager: 100, playerBlackjack: true, dealerBlackjack: true });
    expect(r.outcome).toBe("push");
    expect(r.payout).toBe(100);
  });
  test("regular win pays 1:1", () => {
    const r = settleHand({ playerCards: [c("10"), c("9")], dealerCards: [c("10"), c("7")], wager: 100, ...bj });
    expect(r).toEqual({ outcome: "win", payout: 200, net: 100 });
  });
  test("player bust loses even if dealer also busts", () => {
    const r = settleHand({ playerCards: [c("10"), c("6"), c("10")], dealerCards: [c("10"), c("6"), c("10")], wager: 100, ...bj });
    expect(r.outcome).toBe("lose");
    expect(r.payout).toBe(0);
  });
  test("dealer bust wins for a standing player", () => {
    const r = settleHand({ playerCards: [c("10"), c("8")], dealerCards: [c("10"), c("6"), c("10")], wager: 100, ...bj });
    expect(r.outcome).toBe("win");
  });
  test("equal totals push", () => {
    const r = settleHand({ playerCards: [c("10"), c("8")], dealerCards: [c("10"), c("8")], wager: 100, ...bj });
    expect(r.outcome).toBe("push");
  });
  test("doubled win returns four times the base bet", () => {
    const r = settleHand({ playerCards: [c("5"), c("6"), c("10")], dealerCards: [c("10"), c("10")], wager: 200, ...bj });
    expect(r).toEqual({ outcome: "win", payout: 400, net: 200 });
  });
  test("split 21 counts as 21, not blackjack (pays 1:1)", () => {
    const r = settleHand({ playerCards: [c("A"), c("K")], dealerCards: [c("10"), c("9")], wager: 100, playerBlackjack: false, dealerBlackjack: false });
    expect(r.outcome).toBe("win");
    expect(r.payout).toBe(200);
  });
});

describe("insurance", () => {
  test("pays 2:1 when the dealer has blackjack", () => {
    expect(settleInsurance(50, true)).toEqual({ payout: 150, net: 100 });
  });
  test("is lost when the dealer has no blackjack", () => {
    expect(settleInsurance(50, false)).toEqual({ payout: 0, net: -50 });
  });
  test("no wager means no result", () => {
    expect(settleInsurance(0, true)).toEqual({ payout: 0, net: 0 });
  });
});

describe("basic strategy hints (6-deck, S17)", () => {
  const opts = { canDouble: true, canSplit: true };
  test("hard 16 versus 10 hits", () => {
    expect(basicStrategy([c("10"), c("6")], c("10"), opts)).toBe("hit");
  });
  test("hard 13 versus 6 stands", () => {
    expect(basicStrategy([c("10"), c("3")], c("6"), opts)).toBe("stand");
  });
  test("hard 11 doubles", () => {
    expect(basicStrategy([c("7"), c("4")], c("5"), opts)).toBe("double");
  });
  test("hard 12 versus 2 hits, versus 4 stands", () => {
    expect(basicStrategy([c("10"), c("2")], c("2"), opts)).toBe("hit");
    expect(basicStrategy([c("10"), c("2")], c("4"), opts)).toBe("stand");
  });
  test("pair of eights always splits", () => {
    expect(basicStrategy([c("8"), c("8")], c("10"), opts)).toBe("split");
  });
  test("pair of tens stands", () => {
    expect(basicStrategy([c("10"), c("K")], c("6"), opts)).toBe("stand");
  });
  test("pair of fives doubles, never splits", () => {
    expect(basicStrategy([c("5"), c("5")], c("6"), opts)).toBe("double");
  });
  test("pair of nines splits versus 8, stands versus 7", () => {
    expect(basicStrategy([c("9"), c("9")], c("8"), opts)).toBe("split");
    expect(basicStrategy([c("9"), c("9")], c("7"), opts)).toBe("stand");
  });
  test("pair of aces splits", () => {
    expect(basicStrategy([c("A"), c("A")], c("10"), opts)).toBe("split");
  });
  test("soft 18 doubles versus 6, hits versus 9", () => {
    expect(basicStrategy([c("A"), c("7")], c("6"), opts)).toBe("double");
    expect(basicStrategy([c("A"), c("7")], c("9"), opts)).toBe("hit");
  });
  test("soft 13 doubles versus 5", () => {
    expect(basicStrategy([c("A"), c("2")], c("5"), opts)).toBe("double");
  });
  test("falls back to hit when double is unavailable on 11", () => {
    expect(basicStrategy([c("7"), c("4")], c("5"), { canDouble: false, canSplit: false })).toBe("hit");
  });
});

describe("deck and deterministic shuffle", () => {
  test("a six-deck shoe holds 312 cards", () => {
    expect(freshShoe(6).length).toBe(312);
  });
  test("the same seed produces the same shuffle", () => {
    const a = shuffleWithRng(freshShoe(6), seededRng("same-seed"));
    const b = shuffleWithRng(freshShoe(6), seededRng("same-seed"));
    expect(a).toEqual(b);
  });
  test("different seeds diverge", () => {
    const a = shuffleWithRng(freshShoe(6), seededRng("seed-a"));
    const b = shuffleWithRng(freshShoe(6), seededRng("seed-b"));
    expect(a).not.toEqual(b);
  });
});
