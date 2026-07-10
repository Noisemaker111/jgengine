import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import { seededRng } from "@jgengine/core/random/rng";
import { seedFromUrl, withSeedParam } from "@jgengine/core/random/seedLink";

import {
  arrowMove,
  clickMove,
  isSolved,
  shuffleByWalk,
  solvedBoard,
  type Board,
  type SlideDir,
} from "./logic";

export type BoardSize = 3 | 4 | 5;
export const BOARD_SIZES: readonly BoardSize[] = [3, 4, 5];

export type PuzzleStatus = "ready" | "playing" | "solved";

type RecordField = "timeMs" | "moves";

export interface PuzzleSnapshot {
  readonly size: BoardSize;
  readonly tiles: readonly number[];
  readonly moves: number;
  readonly elapsedMs: number;
  readonly status: PuzzleStatus;
  readonly seed: string;
  readonly shareUrl: string;
  readonly bestTimeMs: number | null;
  readonly bestMoves: number | null;
  readonly newTimeRecord: boolean;
  readonly newMovesRecord: boolean;
}

export interface PuzzleStore {
  getState(): PuzzleSnapshot;
  subscribe(listener: (snapshot: PuzzleSnapshot) => void): () => void;
  init(): void;
  newGame(seed?: string): void;
  restart(): void;
  setSize(size: BoardSize): void;
  clickTile(index: number): void;
  move(dir: SlideDir): void;
  tick(dt: number): void;
  preview(): void;
}

function walkStepsFor(size: BoardSize): number {
  return size * size * 30;
}

function resolveStorage(): RecordStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function currentHref(): string {
  if (typeof window === "undefined") return "";
  const href = window.location?.href;
  return typeof href === "string" ? href : "";
}

let seedCounter = 0;
function generateSeed(): string {
  seedCounter += 1;
  const now = typeof Date !== "undefined" ? Date.now() : 0;
  return (now * 31 + seedCounter).toString(36).slice(-7);
}

export function createPuzzleStore(): PuzzleStore {
  const storage = resolveStorage();
  const books = new Map<BoardSize, RecordBook<RecordField>>();
  const bookFor = (size: BoardSize): RecordBook<RecordField> => {
    let book = books.get(size);
    if (book === undefined) {
      book = createRecordBook<RecordField>({
        key: `fifteen-slide:best:${size}`,
        fields: { timeMs: "lower", moves: "lower" },
        storage,
      });
      books.set(size, book);
    }
    return book;
  };

  let size: BoardSize = 4;
  let board: Board = solvedBoard(size);
  let seed = "";
  let moves = 0;
  let elapsedMs = 0;
  let started = false;
  let status: PuzzleStatus = "ready";
  let newTimeRecord = false;
  let newMovesRecord = false;

  const listeners = new Set<(snapshot: PuzzleSnapshot) => void>();

  function snapshot(): PuzzleSnapshot {
    const book = bookFor(size);
    return {
      size,
      tiles: board.tiles,
      moves,
      elapsedMs,
      status,
      seed,
      shareUrl: withSeedParam(currentHref(), seed),
      bestTimeMs: book.bestOf("timeMs"),
      bestMoves: book.bestOf("moves"),
      newTimeRecord,
      newMovesRecord,
    };
  }

  let current = snapshot();
  function emit(): void {
    current = snapshot();
    for (const listener of listeners) listener(current);
  }

  function shuffleInto(nextSeed: string): void {
    seed = nextSeed;
    board = { n: size, tiles: shuffleByWalk(size, seededRng(nextSeed), walkStepsFor(size)) };
    moves = 0;
    elapsedMs = 0;
    started = false;
    status = "ready";
    newTimeRecord = false;
    newMovesRecord = false;
  }

  function newGame(nextSeed?: string): void {
    shuffleInto(nextSeed ?? generateSeed());
    emit();
  }

  function finishSolved(): void {
    status = "solved";
    started = false;
    const result = bookFor(size).submit({ timeMs: Math.round(elapsedMs), moves });
    newTimeRecord = result.improved.includes("timeMs");
    newMovesRecord = result.improved.includes("moves");
  }

  function applyBoard(next: Board | null): void {
    if (next === null || status === "solved") return;
    board = next;
    if (!started) {
      started = true;
      status = "playing";
    }
    moves += 1;
    if (isSolved(board)) finishSolved();
    emit();
  }

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    init() {
      const fromUrl = currentHref() === "" ? null : seedFromUrl(currentHref());
      newGame(fromUrl ?? undefined);
    },
    newGame,
    restart() {
      shuffleInto(seed === "" ? generateSeed() : seed);
      emit();
    },
    setSize(next) {
      if (next === size) return;
      size = next;
      newGame();
    },
    clickTile(index) {
      applyBoard(clickMove(board, index));
    },
    move(dir) {
      applyBoard(arrowMove(board, dir));
    },
    tick(dt) {
      if (status !== "playing" || !started) return;
      const beforeSecond = Math.floor(elapsedMs / 1000);
      elapsedMs += dt * 1000;
      if (Math.floor(elapsedMs / 1000) !== beforeSecond) emit();
    },
    preview() {
      size = 4;
      shuffleInto("noyes");
      board = { n: 4, tiles: shuffleByWalk(4, seededRng("noyes"), 14) };
      moves = 23;
      elapsedMs = 42_000;
      started = true;
      status = "playing";
      bookFor(4).submit({ timeMs: 58_200, moves: 41 });
      emit();
    },
  };
}

export const store = createPuzzleStore();
