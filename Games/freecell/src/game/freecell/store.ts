import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import { seedFromSearch, withSeedParam } from "@jgengine/core/random/seedLink";

import type { Card } from "./cards";
import {
  applyMove,
  autoCollectSafe,
  dealGame,
  findSmartMove,
  foundationAccepts,
  isOrderedRun,
  isWin,
  type FreeCellState,
  type Move,
  type Source,
  type SourceZone,
} from "./engine";

export interface Selection {
  zone: SourceZone;
  index: number;
  count: number;
}

export type ClickLoc =
  | { t: "cascadeCard"; col: number; row: number }
  | { t: "cascadeEmpty"; col: number }
  | { t: "freeCell"; index: number }
  | { t: "foundation"; index: number };

export interface FreeCellStats {
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
  fastestWinMs: number | null;
}

export interface FreeCellSnapshot {
  cascades: Card[][];
  free: (Card | null)[];
  foundations: Card[][];
  dealNumber: number;
  moves: number;
  won: boolean;
  autoPlay: boolean;
  elapsedMs: number;
  canUndo: boolean;
  selection: Selection | null;
  message: string | null;
  stats: FreeCellStats;
}

export interface FreeCellStore {
  getState(): FreeCellSnapshot;
  subscribe(listener: (state: FreeCellSnapshot) => void): () => void;
  onClick(loc: ClickLoc): void;
  smartMove(loc: ClickLoc): void;
  newDeal(dealNumber: number): void;
  randomDeal(): void;
  restart(): void;
  undo(): void;
  toggleAutoPlay(): void;
  collect(): void;
  tick(dt: number): void;
  shareLink(): string;
}

const MAX_HISTORY = 500;
const MESSAGE_SECONDS = 1.8;
const RANDOM_DEAL_RANGE = 64000;
const STREAK_KEY = "freecell:streak";
const AUTO_KEY = "freecell:auto";

function browserStorage(): RecordStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function readNumber(key: string, fallback: number): number {
  const storage = browserStorage();
  if (storage === null) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeValue(key: string, value: string): void {
  const storage = browserStorage();
  if (storage === null) return;
  try {
    storage.setItem(key, value);
  } catch {
    // storage unavailable — records degrade to in-memory
  }
}

function initialDealNumber(): number {
  if (typeof window === "undefined" || window.location === undefined) return 1;
  const seed = seedFromSearch(window.location.search);
  if (seed === null) return 1;
  const n = Number.parseInt(seed, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function createFreeCellStore(): FreeCellStore {
  const listeners = new Set<(state: FreeCellSnapshot) => void>();
  const records = createRecordBook({
    key: "freecell:records",
    fields: { gamesWon: "higher", winStreak: "higher", fastestWinMs: "lower" },
    storage: browserStorage(),
  });

  let state: FreeCellState = dealGame(initialDealNumber());
  let history: FreeCellState[] = [];
  let selection: Selection | null = null;
  let autoPlay = readNumber(AUTO_KEY, 0) === 1;
  let won = false;
  let hasProgress = false;
  let elapsedMs = 0;
  let lastSecond = -1;
  let message: string | null = null;
  let messageTimer = 0;
  let currentStreak = readNumber(STREAK_KEY, 0);
  let snapshot = buildSnapshot();

  function stats(): FreeCellStats {
    return {
      gamesWon: records.bestOf("gamesWon") ?? 0,
      currentStreak,
      bestStreak: records.bestOf("winStreak") ?? 0,
      fastestWinMs: records.bestOf("fastestWinMs"),
    };
  }

  function buildSnapshot(): FreeCellSnapshot {
    return {
      cascades: state.cascades,
      free: state.free,
      foundations: state.foundations,
      dealNumber: state.dealNumber,
      moves: state.moves,
      won,
      autoPlay,
      elapsedMs,
      canUndo: history.length > 0 && !won,
      selection,
      message,
      stats: stats(),
    };
  }

  function emit(): void {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function emitMessage(text: string | null): void {
    if (text !== null) {
      message = text;
      messageTimer = MESSAGE_SECONDS;
    }
    emit();
  }

  function checkWin(): void {
    if (!isWin(state)) return;
    won = true;
    const total = (records.bestOf("gamesWon") ?? 0) + 1;
    currentStreak += 1;
    records.submit({ gamesWon: total, winStreak: currentStreak, fastestWinMs: Math.round(elapsedMs) });
    writeValue(STREAK_KEY, String(currentStreak));
  }

  function commitNext(next: FreeCellState): void {
    history.push(state);
    if (history.length > MAX_HISTORY) history.shift();
    state = autoPlay ? autoCollectSafe(next) : next;
    hasProgress = true;
    message = null;
    checkWin();
    emit();
  }

  function computeSelection(loc: ClickLoc): Selection | "invalid" | null {
    if (loc.t === "cascadeCard") {
      const col = state.cascades[loc.col]!;
      const count = col.length - loc.row;
      if (count < 1) return null;
      if (!isOrderedRun(col.slice(loc.row))) return "invalid";
      return { zone: "cascade", index: loc.col, count };
    }
    if (loc.t === "freeCell") {
      return state.free[loc.index] === null ? null : { zone: "free", index: loc.index, count: 1 };
    }
    return null;
  }

  function selectedSingleCard(sel: Selection): Card | null {
    if (sel.count !== 1) return null;
    if (sel.zone === "free") return state.free[sel.index] ?? null;
    const col = state.cascades[sel.index]!;
    return col[col.length - 1] ?? null;
  }

  function destinationMove(sel: Selection, loc: ClickLoc): Move | null {
    const source: Source = { zone: sel.zone, index: sel.index };
    if (loc.t === "foundation") {
      const card = selectedSingleCard(sel);
      if (card === null || foundationAccepts(state, card) === null) return null;
      return { type: "toFoundation", from: source };
    }
    if (loc.t === "freeCell") {
      if (sel.count !== 1 || state.free[loc.index] !== null) return null;
      return { type: "toFree", from: source, freeIndex: loc.index };
    }
    const toCol = loc.col;
    if (sel.zone === "cascade") {
      if (toCol === sel.index) return null;
      return { type: "run", fromCol: sel.index, count: sel.count, toCol };
    }
    return { type: "freeToCascade", freeIndex: sel.index, toCol };
  }

  function applySelection(loc: ClickLoc): void {
    const result = computeSelection(loc);
    selection = result === "invalid" || result === null ? null : result;
    emitMessage(result === "invalid" ? "Not an ordered sequence" : null);
  }

  function onClick(loc: ClickLoc): void {
    if (won) return;
    const sel = selection;
    if (sel === null) {
      applySelection(loc);
      return;
    }

    if (sel.zone === "cascade" && loc.t === "cascadeCard" && loc.col === sel.index) {
      const topRow = state.cascades[sel.index]!.length - sel.count;
      if (loc.row === topRow) {
        selection = null;
        emit();
        return;
      }
      applySelection(loc);
      return;
    }
    if (sel.zone === "free" && loc.t === "freeCell" && loc.index === sel.index) {
      selection = null;
      emit();
      return;
    }

    const move = destinationMove(sel, loc);
    if (move !== null) {
      const next = applyMove(state, move);
      if (next !== null) {
        selection = null;
        commitNext(next);
        return;
      }
      selection = null;
      emitMessage("Illegal move");
      return;
    }
    applySelection(loc);
  }

  function smartMove(loc: ClickLoc): void {
    if (won) return;
    selection = null;
    let move: Move | null = null;
    if (loc.t === "cascadeCard") {
      const count = state.cascades[loc.col]!.length - loc.row;
      if (count >= 1) move = findSmartMove(state, "cascade", loc.col, count);
    } else if (loc.t === "freeCell") {
      if (state.free[loc.index] !== null) move = findSmartMove(state, "free", loc.index, 1);
    }
    if (move === null) {
      emitMessage("No move");
      return;
    }
    const next = applyMove(state, move);
    if (next === null) {
      emitMessage("No move");
      return;
    }
    commitNext(next);
  }

  function newDeal(dealNumber: number): void {
    if (hasProgress && !won) {
      currentStreak = 0;
      writeValue(STREAK_KEY, "0");
    }
    state = dealGame(dealNumber);
    history = [];
    selection = null;
    won = false;
    hasProgress = false;
    elapsedMs = 0;
    lastSecond = -1;
    message = null;
    messageTimer = 0;
    emit();
  }

  function randomDeal(): void {
    newDeal(1 + Math.floor(Math.random() * RANDOM_DEAL_RANGE));
  }

  function undo(): void {
    if (won) return;
    const prev = history.pop();
    if (prev === undefined) return;
    state = prev;
    selection = null;
    message = null;
    emit();
  }

  function toggleAutoPlay(): void {
    autoPlay = !autoPlay;
    writeValue(AUTO_KEY, autoPlay ? "1" : "0");
    if (autoPlay && !won) {
      const next = autoCollectSafe(state);
      if (next.moves !== state.moves) {
        history.push(state);
        state = next;
        hasProgress = true;
        checkWin();
      }
    }
    emit();
  }

  function collect(): void {
    if (won) return;
    const next = autoCollectSafe(state);
    if (next.moves === state.moves) {
      emitMessage("Nothing to collect");
      return;
    }
    history.push(state);
    state = next;
    selection = null;
    hasProgress = true;
    message = null;
    checkWin();
    emit();
  }

  function tick(dt: number): void {
    let dirty = false;
    if (messageTimer > 0) {
      messageTimer = Math.max(0, messageTimer - dt);
      if (messageTimer === 0 && message !== null) {
        message = null;
        dirty = true;
      }
    }
    if (!won && hasProgress) {
      elapsedMs += dt * 1000;
      const sec = Math.floor(elapsedMs / 1000);
      if (sec !== lastSecond) {
        lastSecond = sec;
        dirty = true;
      }
    }
    if (dirty) emit();
  }

  function shareLink(): string {
    const base =
      typeof window !== "undefined" && window.location !== undefined
        ? window.location.href
        : "https://jgengine.com/games/freecell";
    return withSeedParam(base, state.dealNumber);
  }

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onClick,
    smartMove,
    newDeal,
    randomDeal,
    restart: () => newDeal(state.dealNumber),
    undo,
    toggleAutoPlay,
    collect,
    tick,
    shareLink,
  };
}

export const freecellStore = createFreeCellStore();
