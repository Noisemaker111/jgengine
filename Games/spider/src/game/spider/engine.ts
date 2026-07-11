import { pileRng, shuffleWithRng } from "@jgengine/core/cards/cardPile";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Color = "red" | "black";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type SuitCount = 1 | 2 | 4;

export interface Card {
  id: number;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export interface SpiderState {
  tableau: Card[][];
  stock: Card[];
  completed: Suit[];
  suits: SuitCount;
  score: number;
  moves: number;
  won: boolean;
}

export type CardSource = { pile: number; index: number };
export type MoveTarget = { pile: number };

export const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const PILE_COUNT = 10;
export const TOTAL_SUITS = 8;
export const START_SCORE = 500;
export const MOVE_PENALTY = 1;
export const SUIT_BONUS = 100;
export const RUN_LENGTH = 13;

export const RANK_LABEL: Record<Rank, string> = {
  1: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

export const SUIT_GLYPH: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export function color(suit: Suit): Color {
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

export function cardId(card: Card): string {
  return String(card.id);
}

export function deckSuits(suits: SuitCount): readonly Suit[] {
  if (suits === 1) return ["spades"];
  if (suits === 2) return ["spades", "hearts"];
  return SUITS;
}

function copiesPerSuit(suits: SuitCount): number {
  return TOTAL_SUITS / suits;
}

function cloneCard(card: Card): Card {
  return { id: card.id, suit: card.suit, rank: card.rank, faceUp: card.faceUp };
}

export function cloneState(state: SpiderState): SpiderState {
  return {
    tableau: state.tableau.map((pile) => pile.map(cloneCard)),
    stock: state.stock.map(cloneCard),
    completed: [...state.completed],
    suits: state.suits,
    score: state.score,
    moves: state.moves,
    won: state.won,
  };
}

export function orderedDeck(suits: SuitCount): Card[] {
  const list = deckSuits(suits);
  const copies = copiesPerSuit(suits);
  const deck: Card[] = [];
  let id = 0;
  for (let copy = 0; copy < copies; copy += 1) {
    for (const suit of list) {
      for (const rank of RANKS) {
        deck.push({ id, suit, rank, faceUp: false });
        id += 1;
      }
    }
  }
  return deck;
}

export function deal(seed: string, suits: SuitCount): SpiderState {
  const deck = shuffleWithRng(orderedDeck(suits), pileRng(seed));
  let idx = 0;
  const tableau: Card[][] = [];
  for (let pile = 0; pile < PILE_COUNT; pile += 1) {
    const count = pile < 4 ? 6 : 5;
    const cards: Card[] = [];
    for (let k = 0; k < count; k += 1) {
      const card = cloneCard(deck[idx]);
      card.faceUp = k === count - 1;
      cards.push(card);
      idx += 1;
    }
    tableau.push(cards);
  }
  const stock = deck.slice(idx).map((card) => ({ ...card, faceUp: false }));
  return {
    tableau,
    stock,
    completed: [],
    suits,
    score: START_SCORE,
    moves: 0,
    won: false,
  };
}

export function movableRun(pile: readonly Card[], index: number): Card[] | null {
  if (index < 0 || index >= pile.length) return null;
  const run = pile.slice(index);
  for (let i = 0; i < run.length; i += 1) {
    if (!run[i].faceUp) return null;
    if (i > 0) {
      if (run[i].suit !== run[i - 1].suit) return null;
      if (run[i].rank !== run[i - 1].rank - 1) return null;
    }
  }
  return run;
}

export function canPlaceOn(pile: readonly Card[], first: Card): boolean {
  if (pile.length === 0) return true;
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return top.rank === first.rank + 1;
}

function isFullSuitRun(run: readonly Card[]): boolean {
  if (run.length !== RUN_LENGTH) return false;
  for (let i = 0; i < RUN_LENGTH; i += 1) {
    if (!run[i].faceUp) return false;
    if (run[i].rank !== RUN_LENGTH - i) return false;
    if (run[i].suit !== run[0].suit) return false;
  }
  return true;
}

function clearCompletedRuns(state: SpiderState): void {
  for (let p = 0; p < PILE_COUNT; p += 1) {
    const pile = state.tableau[p];
    while (pile.length >= RUN_LENGTH) {
      const tail = pile.slice(pile.length - RUN_LENGTH);
      if (!isFullSuitRun(tail)) break;
      pile.splice(pile.length - RUN_LENGTH, RUN_LENGTH);
      state.completed.push(tail[0].suit);
      state.score += SUIT_BONUS;
      const exposed = pile[pile.length - 1];
      if (exposed !== undefined && !exposed.faceUp) exposed.faceUp = true;
    }
  }
}

export function foundationCount(state: SpiderState): number {
  return state.completed.length;
}

export function checkWin(state: SpiderState): boolean {
  return state.completed.length === TOTAL_SUITS;
}

export function moveCard(
  state: SpiderState,
  source: CardSource,
  target: MoveTarget,
): SpiderState | null {
  const srcPile = state.tableau[source.pile];
  if (srcPile === undefined) return null;
  const run = movableRun(srcPile, source.index);
  if (run === null) return null;
  if (source.pile === target.pile) return null;
  const tgtPile = state.tableau[target.pile];
  if (tgtPile === undefined) return null;
  if (!canPlaceOn(tgtPile, run[0])) return null;

  const next = cloneState(state);
  const from = next.tableau[source.pile];
  const moving = from.splice(source.index, run.length);
  for (const card of moving) card.faceUp = true;
  next.tableau[target.pile].push(...moving);

  const exposed = from[from.length - 1];
  if (exposed !== undefined && !exposed.faceUp) exposed.faceUp = true;

  next.score = Math.max(0, next.score - MOVE_PENALTY);
  next.moves += 1;
  clearCompletedRuns(next);
  next.won = checkWin(next);
  return next;
}

export function dealsRemaining(state: SpiderState): number {
  return Math.floor(state.stock.length / PILE_COUNT);
}

export function canDeal(state: SpiderState): boolean {
  if (state.stock.length < PILE_COUNT) return false;
  return state.tableau.every((pile) => pile.length > 0);
}

export function dealFromStock(state: SpiderState): SpiderState | null {
  if (!canDeal(state)) return null;
  const next = cloneState(state);
  for (let p = 0; p < PILE_COUNT; p += 1) {
    const card = next.stock.pop();
    if (card === undefined) return null;
    card.faceUp = true;
    next.tableau[p].push(card);
  }
  clearCompletedRuns(next);
  next.won = checkWin(next);
  return next;
}

export function smartMove(state: SpiderState, source: CardSource): SpiderState | null {
  const srcPile = state.tableau[source.pile];
  if (srcPile === undefined) return null;
  const run = movableRun(srcPile, source.index);
  if (run === null) return null;
  const first = run[0];
  const wholePile = source.index === 0;

  const sameSuit: number[] = [];
  const anySuit: number[] = [];
  const empties: number[] = [];
  for (let p = 0; p < PILE_COUNT; p += 1) {
    if (p === source.pile) continue;
    const pile = state.tableau[p];
    if (pile.length === 0) {
      empties.push(p);
      continue;
    }
    if (!canPlaceOn(pile, first)) continue;
    const top = pile[pile.length - 1];
    if (top.suit === first.suit) sameSuit.push(p);
    else anySuit.push(p);
  }

  for (const p of [...sameSuit, ...anySuit]) {
    const result = moveCard(state, source, { pile: p });
    if (result !== null) return result;
  }
  if (!wholePile) {
    for (const p of empties) {
      const result = moveCard(state, source, { pile: p });
      if (result !== null) return result;
    }
  }
  return null;
}
