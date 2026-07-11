import type { Card } from "./cards";
import { RANK_VALUE } from "./cards";

export type HandCategory =
  | "royal_flush"
  | "straight_flush"
  | "four_kind"
  | "full_house"
  | "flush"
  | "straight"
  | "three_kind"
  | "two_pair"
  | "jacks_or_better"
  | "nothing";

function isWheel(values: readonly number[]): boolean {
  return values[0] === 2 && values[1] === 3 && values[2] === 4 && values[3] === 5 && values[4] === 14;
}

function rankCountsDescending(values: readonly number[]): number[] {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].sort((a, b) => b - a);
}

function highestPairValue(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = 0;
  for (const [value, count] of counts) if (count === 2 && value > best) best = value;
  return best;
}

export function evaluateHand(cards: readonly Card[]): HandCategory {
  if (cards.length !== 5) throw new Error(`evaluateHand: expected 5 cards, got ${cards.length}`);

  const values = cards.map((card) => RANK_VALUE[card.rank]).sort((a, b) => a - b);
  const suits = cards.map((card) => card.suit);

  const isFlush = suits.every((suit) => suit === suits[0]);
  const unique = new Set(values);
  const isStraight = unique.size === 5 && (values[4] - values[0] === 4 || isWheel(values));
  const counts = rankCountsDescending(values);

  if (isStraight && isFlush) {
    return values[0] === 10 ? "royal_flush" : "straight_flush";
  }
  if (counts[0] === 4) return "four_kind";
  if (counts[0] === 3 && counts[1] === 2) return "full_house";
  if (isFlush) return "flush";
  if (isStraight) return "straight";
  if (counts[0] === 3) return "three_kind";
  if (counts[0] === 2 && counts[1] === 2) return "two_pair";
  if (counts[0] === 2) return highestPairValue(values) >= 11 ? "jacks_or_better" : "nothing";
  return "nothing";
}
