export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Color = "red" | "black";

export interface Card {
  readonly id: number; // 0..51, Microsoft FreeCell deck encoding
  readonly rank: number; // 1..13 (Ace..King)
  readonly suit: Suit;
  readonly color: Color;
}

export const SUITS: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];

export const SUIT_SYMBOL: Readonly<Record<Suit, string>> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function suitIndex(suit: Suit): number {
  return SUITS.indexOf(suit);
}

export function colorOf(suit: Suit): Color {
  return suit === "diamonds" || suit === "hearts" ? "red" : "black";
}

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? "?";
}

export function cardFromId(id: number): Card {
  const rank = Math.floor(id / 4) + 1;
  const suit = SUITS[id % 4]!;
  return { id, rank, suit, color: colorOf(suit) };
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

export const MAX_DEAL_NUMBER = 1_000_000;

export function normalizeDealNumber(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const int = Math.floor(n);
  if (int < 1) return 1;
  if (int > MAX_DEAL_NUMBER) return MAX_DEAL_NUMBER;
  return int;
}

// The Microsoft FreeCell linear-congruential generator. Seeded with the deal
// number, it reproduces the classic numbered deals (game #1's first card is the
// Jack of Diamonds). Kept exact in doubles: the multiply stays under 2^53 and
// the modulus is applied with `%` (not `&`, which would truncate to int32).
interface MsRng {
  seed: number;
}

function msRand(rng: MsRng): number {
  rng.seed = (rng.seed * 214013 + 2531011) % 0x80000000;
  return Math.floor(rng.seed / 0x10000);
}

export function dealDeck(dealNumber: number): Card[][] {
  const rng: MsRng = { seed: normalizeDealNumber(dealNumber) % 0x80000000 };
  const deck: number[] = [];
  for (let i = 0; i < 52; i += 1) deck.push(i);

  const order: number[] = new Array(52);
  let left = 52;
  for (let i = 0; i < 52; i += 1) {
    const j = msRand(rng) % left;
    order[i] = deck[j]!;
    deck[j] = deck[left - 1]!;
    left -= 1;
  }

  const cascades: Card[][] = [[], [], [], [], [], [], [], []];
  for (let i = 0; i < 52; i += 1) cascades[i % 8]!.push(cardFromId(order[i]!));
  return cascades;
}
