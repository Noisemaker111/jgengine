import { createLevelSequence, type LevelSequence } from "@jgengine/core/game/levelSequence";

import { LEVELS, parOf, type LevelDef } from "./levels";
import { starTier, twoStarThreshold } from "./progression";
import { createKeeperRecords, type KeeperRecords } from "./records";
import {
  applyMove,
  initBoard,
  isSolved,
  parseLevel,
  type BoardState,
  type CellKind,
  type Dir,
  type ParsedLevel,
} from "./sokoban";

export type LevelCard = {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly par: number;
  readonly unlocked: boolean;
  readonly completed: boolean;
  readonly stars: 0 | 1 | 2 | 3;
  readonly bestMoves: number | null;
  readonly bestPushes: number | null;
};

export type ActiveView = {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly par: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly CellKind[];
  readonly player: number;
  readonly crates: readonly number[];
  readonly moves: number;
  readonly pushes: number;
  readonly solved: boolean;
  readonly canUndo: boolean;
  readonly lastDir: Dir | null;
  readonly lastPushed: boolean;
  readonly moveSerial: number;
  readonly bestMoves: number | null;
  readonly twoStarThreshold: number;
};

export type WinView = {
  readonly index: number;
  readonly name: string;
  readonly stars: 1 | 2 | 3;
  readonly moves: number;
  readonly pushes: number;
  readonly par: number;
  readonly improvedMoves: boolean;
  readonly hasNext: boolean;
};

export type KeeperSnapshot = {
  readonly screen: "select" | "play";
  readonly levels: readonly LevelCard[];
  readonly active: ActiveView | null;
  readonly win: WinView | null;
  readonly frontier: number;
  readonly completedCount: number;
  readonly totalStars: number;
  readonly maxStars: number;
  readonly campaignComplete: boolean;
};

type HistoryEntry = {
  readonly player: number;
  readonly crates: readonly number[];
  readonly moves: number;
  readonly pushes: number;
  readonly lastDir: Dir | null;
  readonly lastPushed: boolean;
};

function resolveStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

class KeeperStore {
  private readonly parsed: readonly ParsedLevel[] = LEVELS.map((level) => parseLevel(level.grid));
  private readonly records: KeeperRecords = createKeeperRecords(resolveStorage());
  private readonly seq: LevelSequence<{ index: number }> = createLevelSequence({
    levels: LEVELS.map((level, index) => ({ id: level.id, config: { index } })),
  });
  private readonly listeners = new Set<(state: KeeperSnapshot) => void>();

  private screen: "select" | "play" = "select";
  private activeIndex = 0;
  private board: BoardState | null = null;
  private history: HistoryEntry[] = [];
  private win: WinView | null = null;
  private moveSerial = 0;
  private snapshot: KeeperSnapshot;

  constructor() {
    this.reseedFrontier();
    this.snapshot = this.build();
  }

  getState = (): KeeperSnapshot => this.snapshot;

  subscribe = (listener: (state: KeeperSnapshot) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  begin(): void {
    this.reseedFrontier();
    this.screen = "select";
    this.win = null;
    this.emit();
  }

  openSelect(): void {
    this.screen = "select";
    this.win = null;
    this.emit();
  }

  continueCampaign(): void {
    const current = this.seq.current();
    this.load(current === null ? 0 : current.config.index);
  }

  selectLevel(index: number): void {
    if (index < 0 || index >= LEVELS.length) return;
    if (!this.isUnlocked(index)) return;
    this.load(index);
  }

  restart(): void {
    this.load(this.activeIndex);
  }

  nextLevel(): void {
    const next = this.activeIndex + 1;
    if (next < LEVELS.length) this.load(next);
    else this.openSelect();
  }

  preview(index: number, moves: string): void {
    if (index < 0 || index >= LEVELS.length) return;
    this.load(index);
    for (const ch of moves) this.move(ch as Dir);
  }

  move(dir: Dir): void {
    const board = this.board;
    if (board === null || this.win !== null || isSolved(board)) return;
    const before = this.captureBoard(board);
    const result = applyMove(board, dir);
    if (!result.moved) return;
    this.history.push(before);
    this.moveSerial += 1;
    if (isSolved(board)) this.onSolve();
    this.emit();
  }

  undo(): void {
    const board = this.board;
    if (board === null || this.history.length === 0) return;
    const entry = this.history.pop();
    if (entry === undefined) return;
    board.player = entry.player;
    board.crates = entry.crates.slice();
    board.moves = entry.moves;
    board.pushes = entry.pushes;
    board.lastDir = entry.lastDir;
    board.lastPushed = entry.lastPushed;
    this.win = null;
    this.moveSerial += 1;
    this.emit();
  }

  private load(index: number): void {
    this.activeIndex = index;
    this.board = initBoard(this.parsed[index]);
    this.history = [];
    this.win = null;
    this.moveSerial = 0;
    this.screen = "play";
    this.emit();
  }

  private onSolve(): void {
    const board = this.board;
    if (board === null) return;
    const level = LEVELS[this.activeIndex];
    const { improvedMoves } = this.records.submit(level.id, board.moves, board.pushes);
    this.reseedFrontier();
    this.win = {
      index: this.activeIndex,
      name: level.name,
      stars: starTier(board.moves, parOf(level)),
      moves: board.moves,
      pushes: board.pushes,
      par: parOf(level),
      improvedMoves,
      hasNext: this.activeIndex < LEVELS.length - 1,
    };
  }

  private reseedFrontier(): void {
    this.seq.reset();
    this.seq.start();
    for (const level of LEVELS) {
      if (!this.records.recordFor(level.id).completed) break;
      this.seq.clear();
      if (!this.seq.advance()) break;
    }
  }

  private isUnlocked(index: number): boolean {
    if (index === 0) return true;
    return this.records.recordFor(LEVELS[index - 1].id).completed;
  }

  private captureBoard(board: BoardState): HistoryEntry {
    return {
      player: board.player,
      crates: board.crates.slice(),
      moves: board.moves,
      pushes: board.pushes,
      lastDir: board.lastDir,
      lastPushed: board.lastPushed,
    };
  }

  private cardFor(level: LevelDef, index: number): LevelCard {
    const record = this.records.recordFor(level.id);
    const par = parOf(level);
    const stars: 0 | 1 | 2 | 3 = record.bestMoves === null ? 0 : starTier(record.bestMoves, par);
    return {
      index,
      id: level.id,
      name: level.name,
      par,
      unlocked: this.isUnlocked(index),
      completed: record.completed,
      stars,
      bestMoves: record.bestMoves,
      bestPushes: record.bestPushes,
    };
  }

  private activeView(): ActiveView | null {
    const board = this.board;
    if (board === null) return null;
    const level = LEVELS[this.activeIndex];
    const record = this.records.recordFor(level.id);
    return {
      index: this.activeIndex,
      id: level.id,
      name: level.name,
      par: parOf(level),
      width: board.parsed.width,
      height: board.parsed.height,
      cells: board.parsed.cells,
      player: board.player,
      crates: board.crates.slice(),
      moves: board.moves,
      pushes: board.pushes,
      solved: isSolved(board),
      canUndo: this.history.length > 0,
      lastDir: board.lastDir,
      lastPushed: board.lastPushed,
      moveSerial: this.moveSerial,
      bestMoves: record.bestMoves,
      twoStarThreshold: twoStarThreshold(parOf(level)),
    };
  }

  private build(): KeeperSnapshot {
    const levels = LEVELS.map((level, index) => this.cardFor(level, index));
    const completedCount = levels.filter((card) => card.completed).length;
    const totalStars = levels.reduce((sum, card) => sum + card.stars, 0);
    const progress = this.seq.progress();
    return {
      screen: this.screen,
      levels,
      active: this.activeView(),
      win: this.win,
      frontier: progress.index,
      completedCount,
      totalStars,
      maxStars: LEVELS.length * 3,
      campaignComplete: this.seq.status() === "complete",
    };
  }

  private emit(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export const keeperStore = new KeeperStore();
