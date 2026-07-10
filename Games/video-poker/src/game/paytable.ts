import type { HandCategory } from "./evaluator";

export type PayingCategory = Exclude<HandCategory, "nothing">;

export const MIN_BET = 1;
export const MAX_BET = 5;
export const ROYAL_MAX_BET_PAYOUT = 4000;

export const PAY_PER_CREDIT: Readonly<Record<PayingCategory, number>> = {
  royal_flush: 250,
  straight_flush: 50,
  four_kind: 25,
  full_house: 9,
  flush: 6,
  straight: 4,
  three_kind: 3,
  two_pair: 2,
  jacks_or_better: 1,
};

export const PAYTABLE_ROWS: readonly PayingCategory[] = [
  "royal_flush",
  "straight_flush",
  "four_kind",
  "full_house",
  "flush",
  "straight",
  "three_kind",
  "two_pair",
  "jacks_or_better",
];

export const HAND_LABELS: Readonly<Record<HandCategory, string>> = {
  royal_flush: "Royal Flush",
  straight_flush: "Straight Flush",
  four_kind: "Four of a Kind",
  full_house: "Full House",
  flush: "Flush",
  straight: "Straight",
  three_kind: "Three of a Kind",
  two_pair: "Two Pair",
  jacks_or_better: "Jacks or Better",
  nothing: "No Pay",
};

export function payColumn(category: PayingCategory, bet: number): number {
  if (category === "royal_flush" && bet === MAX_BET) return ROYAL_MAX_BET_PAYOUT;
  return PAY_PER_CREDIT[category] * bet;
}

export function payout(category: HandCategory, bet: number): number {
  if (category === "nothing") return 0;
  return payColumn(category, bet);
}
