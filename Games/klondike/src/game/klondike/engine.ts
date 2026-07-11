import { pileRng, shuffleWithRng } from "@jgengine/core/cards/cardPile";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Color = "red" | "black";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type DrawMode = 1 | 3;

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export interface KlondikeState {
  stock: Card[];
  waste: Card[];
  foundations: Record<Suit, Card[]>;
  tableau: Card[][];
  drawMode: DrawMode;
  score: number;
  moves: number;
  recycles: number;
  won: boolean;
}

export type CardSource =
  | { zone: "waste" }
  | { zone: "tableau"; pile: number; index: number }
  | { zone: "foundation"; suit: Suit };

export type MoveTarget = { zone: "foundation" } | { zone: "tableau"; pile: number };

export const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const TABLEAU_COUNT = 7;
export const RECYCLE_PENALTY = 100;

export const SCORE = {
  wasteToTableau: 5,
  wasteToFoundation: 10,
  tableauToFoundation: 10,
  tableauToTableau: 0,
  foundationToTableau: -15,
  flip: 5,
} as const;

export function color(suit: Suit): Color {
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

export function cardId(card: Card): string {
  return `${card.suit}-${card.rank}`;
}

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

function top<T>(arr: readonly T[]): T | undefined {
  return arr.length === 0 ? undefined : arr[arr.length - 1];
}

function cloneCard(card: Card): Card {
  return { suit: card.suit, rank: card.rank, faceUp: card.faceUp };
}

export function cloneState(state: KlondikeState): KlondikeState {
  return {
    stock: state.stock.map(cloneCard),
    waste: state.waste.map(cloneCard),
    foundations: {
      spades: state.foundations.spades.map(cloneCard),
      hearts: state.foundations.hearts.map(cloneCard),
      diamonds: state.foundations.diamonds.map(cloneCard),
      clubs: state.foundations.clubs.map(cloneCard),
    },
    tableau: state.tableau.map((pile) => pile.map(cloneCard)),
    drawMode: state.drawMode,
    score: state.score,
    moves: state.moves,
    recycles: state.recycles,
    won: state.won,
  };
}

export function orderedDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, faceUp: false });
    }
  }
  return deck;
}

export function deal(seed: string, drawMode: DrawMode): KlondikeState {
  const deck = shuffleWithRng(orderedDeck(), pileRng(seed));
  let idx = 0;
  const tableau: Card[][] = [];
  for (let pile = 0; pile < TABLEAU_COUNT; pile += 1) {
    const cards: Card[] = [];
    for (let k = 0; k <= pile; k += 1) {
      const card = cloneCard(deck[idx]);
      card.faceUp = k === pile;
      cards.push(card);
      idx += 1;
    }
    tableau.push(cards);
  }
  const stock = deck.slice(idx).map((card) => ({ ...card, faceUp: false }));
  return {
    stock,
    waste: [],
    foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
    tableau,
    drawMode,
    score: 0,
    moves: 0,
    recycles: 0,
    won: false,
  };
}

export function foundationCount(state: KlondikeState): number {
  return (
    state.foundations.spades.length +
    state.foundations.hearts.length +
    state.foundations.diamonds.length +
    state.foundations.clubs.length
  );
}

export function checkWin(state: KlondikeState): boolean {
  return foundationCount(state) === 52;
}

function isValidRun(cards: readonly Card[]): boolean {
  for (let i = 0; i < cards.length; i += 1) {
    if (!cards[i].faceUp) return false;
    if (i > 0) {
      if (cards[i].rank !== cards[i - 1].rank - 1) return false;
      if (color(cards[i].suit) === color(cards[i - 1].suit)) return false;
    }
  }
  return true;
}

function movingCards(state: KlondikeState, source: CardSource): Card[] | null {
  if (source.zone === "waste") {
    const card = top(state.waste);
    return card === undefined ? null : [card];
  }
  if (source.zone === "foundation") {
    const card = top(state.foundations[source.suit]);
    return card === undefined ? null : [card];
  }
  const pile = state.tableau[source.pile];
  if (pile === undefined) return null;
  if (source.index < 0 || source.index >= pile.length) return null;
  const run = pile.slice(source.index);
  if (!isValidRun(run)) return null;
  return run;
}

export function canPlaceOnFoundation(state: KlondikeState, card: Card): boolean {
  const foundation = state.foundations[card.suit];
  const t = top(foundation);
  if (t === undefined) return card.rank === 1;
  return t.rank === card.rank - 1;
}

export function canPlaceOnTableau(pile: readonly Card[], first: Card): boolean {
  const t = top(pile);
  if (t === undefined) return first.rank === 13;
  if (!t.faceUp) return false;
  return t.rank === first.rank + 1 && color(t.suit) !== color(first.suit);
}

function removeFromSource(state: KlondikeState, source: CardSource, count: number): void {
  if (source.zone === "waste") {
    state.waste.pop();
  } else if (source.zone === "foundation") {
    state.foundations[source.suit].pop();
  } else {
    state.tableau[source.pile].splice(source.index, count);
  }
}

function sourceZoneName(source: CardSource): "waste" | "tableau" | "foundation" {
  return source.zone;
}

function scoreFor(from: "waste" | "tableau" | "foundation", target: MoveTarget): number {
  if (target.zone === "foundation") {
    if (from === "waste") return SCORE.wasteToFoundation;
    if (from === "tableau") return SCORE.tableauToFoundation;
    return 0;
  }
  if (from === "waste") return SCORE.wasteToTableau;
  if (from === "foundation") return SCORE.foundationToTableau;
  return SCORE.tableauToTableau;
}

export function moveCard(
  state: KlondikeState,
  source: CardSource,
  target: MoveTarget,
): KlondikeState | null {
  const cards = movingCards(state, source);
  if (cards === null) return null;
  const first = cards[0];

  if (target.zone === "foundation") {
    if (cards.length !== 1) return null;
    if (!canPlaceOnFoundation(state, first)) return null;
  } else {
    if (source.zone === "tableau" && source.pile === target.pile) return null;
    const pile = state.tableau[target.pile];
    if (pile === undefined) return null;
    if (!canPlaceOnTableau(pile, first)) return null;
  }

  const next = cloneState(state);
  removeFromSource(next, source, cards.length);

  if (target.zone === "foundation") {
    next.foundations[first.suit].push({ suit: first.suit, rank: first.rank, faceUp: true });
  } else {
    for (const card of cards) {
      next.tableau[target.pile].push({ suit: card.suit, rank: card.rank, faceUp: true });
    }
  }

  let delta = scoreFor(sourceZoneName(source), target);
  if (source.zone === "tableau") {
    const pile = next.tableau[source.pile];
    const exposed = top(pile);
    if (exposed !== undefined && !exposed.faceUp) {
      exposed.faceUp = true;
      delta += SCORE.flip;
    }
  }
  next.score = Math.max(0, next.score + delta);
  next.moves += 1;
  next.won = checkWin(next);
  return next;
}

export function drawStock(state: KlondikeState): KlondikeState | null {
  const next = cloneState(state);
  if (next.stock.length === 0) {
    if (next.waste.length === 0) return null;
    next.stock = next.waste
      .slice()
      .reverse()
      .map((card) => ({ suit: card.suit, rank: card.rank, faceUp: false }));
    next.waste = [];
    next.recycles += 1;
    if (next.drawMode === 1) next.score = Math.max(0, next.score - RECYCLE_PENALTY);
    next.moves += 1;
    return next;
  }
  const count = Math.min(next.drawMode, next.stock.length);
  for (let i = 0; i < count; i += 1) {
    const card = next.stock.pop() as Card;
    card.faceUp = true;
    next.waste.push(card);
  }
  next.moves += 1;
  return next;
}

function tableauTargets(state: KlondikeState, source: CardSource, first: Card): MoveTarget[] {
  const filled: MoveTarget[] = [];
  const empty: MoveTarget[] = [];
  for (let pile = 0; pile < TABLEAU_COUNT; pile += 1) {
    if (source.zone === "tableau" && source.pile === pile) continue;
    const cards = state.tableau[pile];
    if (!canPlaceOnTableau(cards, first)) continue;
    if (cards.length === 0) {
      if (source.zone === "tableau" && source.index === 0) continue;
      empty.push({ zone: "tableau", pile });
    } else {
      filled.push({ zone: "tableau", pile });
    }
  }
  return [...filled, ...empty];
}

export function smartMove(state: KlondikeState, source: CardSource): KlondikeState | null {
  const cards = movingCards(state, source);
  if (cards === null) return null;
  const first = cards[0];

  if (cards.length === 1 && (source.zone === "waste" || source.zone === "tableau")) {
    if (canPlaceOnFoundation(state, first)) {
      const result = moveCard(state, source, { zone: "foundation" });
      if (result !== null) return result;
    }
  }

  for (const target of tableauTargets(state, source, first)) {
    const result = moveCard(state, source, target);
    if (result !== null) return result;
  }
  return null;
}

export function canAutoComplete(state: KlondikeState): boolean {
  if (state.won) return false;
  if (foundationCount(state) === 52) return false;
  return state.tableau.every((pile) => pile.every((card) => card.faceUp));
}

export function autoStep(state: KlondikeState): KlondikeState | null {
  if (state.won) return null;

  let best: { source: CardSource; rank: Rank } | null = null;
  const consider = (source: CardSource, card: Card): void => {
    if (!canPlaceOnFoundation(state, card)) return;
    if (best === null || card.rank < best.rank) best = { source, rank: card.rank };
  };

  const wasteTop = top(state.waste);
  if (wasteTop !== undefined) consider({ zone: "waste" }, wasteTop);
  for (let pile = 0; pile < TABLEAU_COUNT; pile += 1) {
    const cards = state.tableau[pile];
    const t = top(cards);
    if (t !== undefined) consider({ zone: "tableau", pile, index: cards.length - 1 }, t);
  }

  if (best !== null) {
    return moveCard(state, (best as { source: CardSource }).source, { zone: "foundation" });
  }
  return drawStock(state);
}
