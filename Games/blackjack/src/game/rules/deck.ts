export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];
export const RANKS: readonly Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const DECKS = 6;

export function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") return 10;
  return Number(rank);
}

export function isTenValue(rank: Rank): boolean {
  return rank === "10" || rank === "J" || rank === "Q" || rank === "K";
}

export function isRed(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}

export function freshShoe(decks: number = DECKS): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d += 1)
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  return cards;
}
