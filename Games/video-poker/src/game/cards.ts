export type Suit = "C" | "D" | "H" | "S";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export type CardId = string;

export const RANKS: readonly Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
export const SUITS: readonly Suit[] = ["C", "D", "H", "S"];

export const RANK_VALUE: Readonly<Record<Rank, number>> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export const RANK_LABEL: Readonly<Record<Rank, string>> = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  T: "10",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
};

export const SUIT_GLYPH: Readonly<Record<Suit, string>> = { C: "♣", D: "♦", H: "♥", S: "♠" };

export function suitIsRed(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}

export function cardId(card: Card): CardId {
  return `${card.rank}${card.suit}`;
}

export function parseCard(id: CardId): Card {
  return { rank: id.slice(0, id.length - 1) as Rank, suit: id.slice(id.length - 1) as Suit };
}

export function buildDeck(): CardId[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`));
}
