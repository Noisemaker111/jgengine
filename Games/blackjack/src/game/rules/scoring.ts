import { cardValue, type Card } from "./deck";

export interface HandTotal {
  readonly total: number;
  readonly soft: boolean;
}

export function handTotal(cards: readonly Card[]): HandTotal {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function isBust(cards: readonly Card[]): boolean {
  return handTotal(cards).total > 21;
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

export function dealerShouldHit(hand: HandTotal, hitSoft17 = false): boolean {
  if (hand.total < 17) return true;
  if (hand.total === 17 && hand.soft && hitSoft17) return true;
  return false;
}

export function totalLabel(hand: HandTotal): string {
  if (hand.total > 21) return `Bust ${hand.total}`;
  return hand.soft ? `Soft ${hand.total}` : `${hand.total}`;
}
