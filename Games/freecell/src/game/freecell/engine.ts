import type { Card } from "./cards";
import { SUITS, colorOf, dealDeck, normalizeDealNumber, suitIndex } from "./cards";

export interface FreeCellState {
  cascades: Card[][]; // 8 columns; last element of a column is the accessible (bottom) card
  free: (Card | null)[]; // 4 free cells
  foundations: Card[][]; // 4 piles indexed by suit, built A -> K
  dealNumber: number;
  moves: number;
}

export type SourceZone = "cascade" | "free";

export interface Source {
  zone: SourceZone;
  index: number; // cascade column, or free-cell index
}

export type Move =
  | { type: "toFoundation"; from: Source }
  | { type: "toFree"; from: Source; freeIndex: number }
  | { type: "run"; fromCol: number; count: number; toCol: number }
  | { type: "freeToCascade"; freeIndex: number; toCol: number };

export function dealGame(dealNumber: number): FreeCellState {
  const n = normalizeDealNumber(dealNumber);
  return {
    cascades: dealDeck(n),
    free: [null, null, null, null],
    foundations: [[], [], [], []],
    dealNumber: n,
    moves: 0,
  };
}

export function stacks(top: Card, onto: Card | undefined): boolean {
  if (onto === undefined) return true; // empty column accepts anything
  return top.rank === onto.rank - 1 && top.color !== onto.color;
}

export function isOrderedRun(cards: readonly Card[]): boolean {
  for (let i = 0; i < cards.length - 1; i += 1) {
    if (!stacks(cards[i + 1]!, cards[i]!)) return false;
  }
  return true;
}

export function orderedTailLength(cascade: readonly Card[]): number {
  if (cascade.length === 0) return 0;
  let len = 1;
  for (let i = cascade.length - 1; i > 0; i -= 1) {
    if (stacks(cascade[i]!, cascade[i - 1]!)) len += 1;
    else break;
  }
  return len;
}

export function freeCellCount(state: FreeCellState): number {
  return state.free.filter((c) => c === null).length;
}

export function emptyCascadeCount(state: FreeCellState, exclude?: number): number {
  let n = 0;
  state.cascades.forEach((cascade, i) => {
    if (cascade.length === 0 && i !== exclude) n += 1;
  });
  return n;
}

// Classic supermove capacity: (freeCells + 1) * 2^(emptyColumns). Moving into an
// empty column excludes it from the multiplier, which halves the count.
export function maxSupermove(state: FreeCellState, destCol: number): number {
  const dest = state.cascades[destCol]!;
  const emptyOther = emptyCascadeCount(state, dest.length === 0 ? destCol : undefined);
  return (freeCellCount(state) + 1) * 2 ** emptyOther;
}

export function foundationAccepts(state: FreeCellState, card: Card): number | null {
  const idx = suitIndex(card.suit);
  const pile = state.foundations[idx]!;
  const ok = pile.length === 0 ? card.rank === 1 : pile[pile.length - 1]!.rank === card.rank - 1;
  return ok ? idx : null;
}

function cascadeBottom(state: FreeCellState, col: number): Card | undefined {
  const c = state.cascades[col]!;
  return c[c.length - 1];
}

function sourceCard(state: FreeCellState, from: Source): Card | null {
  if (from.zone === "free") return state.free[from.index] ?? null;
  return cascadeBottom(state, from.index) ?? null;
}

function removeSource(state: FreeCellState, from: Source): FreeCellState {
  if (from.zone === "free") {
    const free = state.free.slice();
    free[from.index] = null;
    return { ...state, free };
  }
  const cascades = state.cascades.slice();
  const c = cascades[from.index]!;
  cascades[from.index] = c.slice(0, c.length - 1);
  return { ...state, cascades };
}

export function applyMove(state: FreeCellState, move: Move): FreeCellState | null {
  switch (move.type) {
    case "toFoundation": {
      const card = sourceCard(state, move.from);
      if (card === null) return null;
      const f = foundationAccepts(state, card);
      if (f === null) return null;
      const base = removeSource(state, move.from);
      const foundations = base.foundations.slice();
      foundations[f] = [...foundations[f]!, card];
      return { ...base, foundations, moves: state.moves + 1 };
    }
    case "toFree": {
      if (state.free[move.freeIndex] !== null) return null;
      const card = sourceCard(state, move.from);
      if (card === null) return null;
      if (move.from.zone === "free" && move.from.index === move.freeIndex) return null;
      const base = removeSource(state, move.from);
      const free = base.free.slice();
      free[move.freeIndex] = card;
      return { ...base, free, moves: state.moves + 1 };
    }
    case "run": {
      if (move.fromCol === move.toCol) return null;
      const from = state.cascades[move.fromCol]!;
      if (move.count < 1 || move.count > from.length) return null;
      const run = from.slice(from.length - move.count);
      if (!isOrderedRun(run)) return null;
      if (!stacks(run[0]!, cascadeBottom(state, move.toCol))) return null;
      if (move.count > maxSupermove(state, move.toCol)) return null;
      const cascades = state.cascades.slice();
      cascades[move.fromCol] = from.slice(0, from.length - move.count);
      cascades[move.toCol] = [...state.cascades[move.toCol]!, ...run];
      return { ...state, cascades, moves: state.moves + 1 };
    }
    case "freeToCascade": {
      const card = state.free[move.freeIndex];
      if (card === null || card === undefined) return null;
      if (!stacks(card, cascadeBottom(state, move.toCol))) return null;
      const free = state.free.slice();
      free[move.freeIndex] = null;
      const cascades = state.cascades.slice();
      cascades[move.toCol] = [...state.cascades[move.toCol]!, card];
      return { ...state, free, cascades, moves: state.moves + 1 };
    }
  }
}

function firstCascadeAccepting(state: FreeCellState, card: Card, exclude: number): number {
  for (let c = 0; c < state.cascades.length; c += 1) {
    if (c === exclude) continue;
    const col = state.cascades[c]!;
    if (col.length === 0) continue;
    if (stacks(card, col[col.length - 1])) return c;
  }
  return -1;
}

function firstEmptyCascade(state: FreeCellState, exclude: number): number {
  for (let c = 0; c < state.cascades.length; c += 1) {
    if (c !== exclude && state.cascades[c]!.length === 0) return c;
  }
  return -1;
}

function firstCascadeAcceptingRun(
  state: FreeCellState,
  top: Card,
  count: number,
  wantEmpty: boolean,
  exclude: number,
): number {
  for (let c = 0; c < state.cascades.length; c += 1) {
    if (c === exclude) continue;
    const col = state.cascades[c]!;
    if ((col.length === 0) !== wantEmpty) continue;
    if (!stacks(top, col[col.length - 1])) continue;
    if (count <= maxSupermove(state, c)) return c;
  }
  return -1;
}

// The destination a single click / double click should route a card (or run) to.
// Priority: foundation, then a tableau column it fits on, then a free cell, then
// an empty column. Runs (>1) only ever move between columns.
export function findSmartMove(
  state: FreeCellState,
  zone: SourceZone,
  index: number,
  count: number,
): Move | null {
  if (zone === "free") {
    const card = state.free[index];
    if (card === null || card === undefined) return null;
    if (foundationAccepts(state, card) !== null) return { type: "toFoundation", from: { zone: "free", index } };
    const nonEmpty = firstCascadeAccepting(state, card, -1);
    if (nonEmpty !== -1) return { type: "freeToCascade", freeIndex: index, toCol: nonEmpty };
    const empty = firstEmptyCascade(state, -1);
    if (empty !== -1) return { type: "freeToCascade", freeIndex: index, toCol: empty };
    return null;
  }

  const col = index;
  const cascade = state.cascades[col]!;
  if (count < 1 || count > cascade.length) return null;
  const run = cascade.slice(cascade.length - count);
  if (!isOrderedRun(run)) return null;
  const top = run[0]!;

  if (count === 1) {
    if (foundationAccepts(state, top) !== null) return { type: "toFoundation", from: { zone: "cascade", index: col } };
    const nonEmpty = firstCascadeAccepting(state, top, col);
    if (nonEmpty !== -1) return { type: "run", fromCol: col, count: 1, toCol: nonEmpty };
    const freeIdx = state.free.indexOf(null);
    if (freeIdx !== -1) return { type: "toFree", from: { zone: "cascade", index: col }, freeIndex: freeIdx };
    const empty = firstEmptyCascade(state, col);
    if (empty !== -1) return { type: "run", fromCol: col, count: 1, toCol: empty };
    return null;
  }

  const nonEmpty = firstCascadeAcceptingRun(state, top, count, false, col);
  if (nonEmpty !== -1) return { type: "run", fromCol: col, count, toCol: nonEmpty };
  const empty = firstCascadeAcceptingRun(state, top, count, true, col);
  if (empty !== -1) return { type: "run", fromCol: col, count, toCol: empty };
  return null;
}

export function isWin(state: FreeCellState): boolean {
  let total = 0;
  for (const pile of state.foundations) total += pile.length;
  return total === 52;
}

// A card is safe to auto-play when it can never be needed to hold a lower
// opposite-color card in the tableau: aces and twos always, otherwise once both
// opposite-color foundations have reached at least rank - 1.
export function safeToAutoplay(state: FreeCellState, card: Card): boolean {
  if (card.rank <= 2) return true;
  const opposite = card.color === "red" ? "black" : "red";
  let minOpp = Infinity;
  SUITS.forEach((suit, i) => {
    if (colorOf(suit) === opposite) minOpp = Math.min(minOpp, state.foundations[i]!.length);
  });
  return minOpp >= card.rank - 1;
}

export function autoCollectSafe(state: FreeCellState): FreeCellState {
  let current = state;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < current.free.length; i += 1) {
      const card = current.free[i];
      if (card !== null && card !== undefined && foundationAccepts(current, card) !== null && safeToAutoplay(current, card)) {
        const next = applyMove(current, { type: "toFoundation", from: { zone: "free", index: i } });
        if (next !== null) {
          current = next;
          changed = true;
          break;
        }
      }
    }
    if (changed) continue;
    for (let c = 0; c < current.cascades.length; c += 1) {
      const card = cascadeBottom(current, c);
      if (card !== undefined && foundationAccepts(current, card) !== null && safeToAutoplay(current, card)) {
        const next = applyMove(current, { type: "toFoundation", from: { zone: "cascade", index: c } });
        if (next !== null) {
          current = next;
          changed = true;
          break;
        }
      }
    }
  }
  return current;
}
