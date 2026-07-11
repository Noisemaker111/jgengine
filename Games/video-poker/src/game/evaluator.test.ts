import { describe, expect, test } from "bun:test";

import type { Card } from "./cards";
import { parseCard } from "./cards";
import { evaluateHand } from "./evaluator";

function hand(...ids: string[]): Card[] {
  return ids.map(parseCard);
}

describe("evaluateHand — top categories", () => {
  test("royal flush (hearts)", () => {
    expect(evaluateHand(hand("TH", "JH", "QH", "KH", "AH"))).toBe("royal_flush");
  });
  test("royal flush in another suit, order-independent", () => {
    expect(evaluateHand(hand("AD", "KD", "QD", "JD", "TD"))).toBe("royal_flush");
  });
  test("king-high straight flush is not a royal", () => {
    expect(evaluateHand(hand("9S", "TS", "JS", "QS", "KS"))).toBe("straight_flush");
  });
  test("steel wheel A-2-3-4-5 suited is a straight flush, not royal", () => {
    expect(evaluateHand(hand("AS", "2S", "3S", "4S", "5S"))).toBe("straight_flush");
  });
  test("four of a kind", () => {
    expect(evaluateHand(hand("7C", "7D", "7H", "7S", "KC"))).toBe("four_kind");
  });
  test("full house", () => {
    expect(evaluateHand(hand("3C", "3D", "3H", "6S", "6C"))).toBe("full_house");
  });
});

describe("evaluateHand — flush vs straight boundaries", () => {
  test("flush that is not a straight", () => {
    expect(evaluateHand(hand("2H", "5H", "9H", "JH", "KH"))).toBe("flush");
  });
  test("same ranks suited would be a straight flush, mixed suits is only a straight", () => {
    expect(evaluateHand(hand("5C", "6D", "7H", "8S", "9C"))).toBe("straight");
  });
  test("all one suit AND consecutive is a straight flush, not a plain flush", () => {
    expect(evaluateHand(hand("5S", "6S", "7S", "8S", "9S"))).toBe("straight_flush");
  });
  test("wheel straight A-2-3-4-5 mixed suits", () => {
    expect(evaluateHand(hand("AC", "2D", "3H", "4S", "5C"))).toBe("straight");
  });
});

describe("evaluateHand — around-the-corner is NOT a straight", () => {
  test("Q-K-A-2-3 does not wrap", () => {
    expect(evaluateHand(hand("QC", "KD", "AH", "2S", "3C"))).toBe("nothing");
  });
  test("K-A-2-3-4 does not wrap", () => {
    expect(evaluateHand(hand("KC", "AD", "2H", "3S", "4C"))).toBe("nothing");
  });
  test("J-Q-K-A-2 does not wrap", () => {
    expect(evaluateHand(hand("JC", "QD", "KH", "AS", "2C"))).toBe("nothing");
  });
});

describe("evaluateHand — trips, two pair, and the Jacks-or-Better boundary", () => {
  test("three of a kind", () => {
    expect(evaluateHand(hand("8C", "8D", "8H", "2S", "KC"))).toBe("three_kind");
  });
  test("two pair", () => {
    expect(evaluateHand(hand("9C", "9D", "4H", "4S", "KC"))).toBe("two_pair");
  });
  test("pair of jacks pays", () => {
    expect(evaluateHand(hand("JC", "JD", "3H", "7S", "KC"))).toBe("jacks_or_better");
  });
  test("pair of queens pays", () => {
    expect(evaluateHand(hand("QC", "QD", "3H", "7S", "9C"))).toBe("jacks_or_better");
  });
  test("pair of kings pays", () => {
    expect(evaluateHand(hand("KC", "KD", "2H", "5S", "9C"))).toBe("jacks_or_better");
  });
  test("pair of aces pays", () => {
    expect(evaluateHand(hand("AC", "AD", "2H", "5S", "9C"))).toBe("jacks_or_better");
  });
  test("pair of tens does NOT pay (boundary just below jacks)", () => {
    expect(evaluateHand(hand("TC", "TD", "3H", "7S", "KC"))).toBe("nothing");
  });
  test("pair of twos does not pay", () => {
    expect(evaluateHand(hand("2C", "2D", "3H", "7S", "KC"))).toBe("nothing");
  });
  test("no pair, no draw is nothing", () => {
    expect(evaluateHand(hand("2C", "5D", "9H", "JS", "KC"))).toBe("nothing");
  });
});

describe("evaluateHand — kickers are irrelevant to category", () => {
  test("pair of kings with different kickers both pay the same", () => {
    const a = evaluateHand(hand("KC", "KD", "2H", "3S", "4C"));
    const b = evaluateHand(hand("KC", "KD", "9H", "TS", "QC"));
    expect(a).toBe("jacks_or_better");
    expect(b).toBe("jacks_or_better");
  });
  test("four of a kind with different fifth cards is still four of a kind", () => {
    const a = evaluateHand(hand("5C", "5D", "5H", "5S", "2C"));
    const b = evaluateHand(hand("5C", "5D", "5H", "5S", "AC"));
    expect(a).toBe("four_kind");
    expect(b).toBe("four_kind");
  });
  test("two pair with different fifth cards is still two pair", () => {
    const a = evaluateHand(hand("9C", "9D", "4H", "4S", "2C"));
    const b = evaluateHand(hand("9C", "9D", "4H", "4S", "AC"));
    expect(a).toBe("two_pair");
    expect(b).toBe("two_pair");
  });
});

describe("evaluateHand — guards", () => {
  test("rejects a hand that is not five cards", () => {
    expect(() => evaluateHand(hand("KC", "KD", "9H", "TS"))).toThrow();
  });
});
