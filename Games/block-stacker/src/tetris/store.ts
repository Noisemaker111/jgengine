import { seededRng } from "@jgengine/core/item/affix";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clearLines,
  collides,
  createBoard,
  dropDistance,
  gravityInterval,
  levelForLines,
  lineScore,
  merge,
  type ActivePiece,
  type Board,
} from "./logic";
import { PIECE_TYPES, SPAWN_COLUMN, KICK_OFFSETS, type PieceType } from "./pieces";

export type GameStatus = "playing" | "gameover";

export interface TetrisSnapshot {
  readonly board: Board;
  readonly active: ActivePiece | null;
  readonly ghostY: number | null;
  readonly next: readonly PieceType[];
  readonly hold: PieceType | null;
  readonly canHold: boolean;
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly status: GameStatus;
}

const PREVIEW_COUNT = 5;

interface MutableState {
  board: Board;
  active: ActivePiece | null;
  queue: PieceType[];
  bag: PieceType[];
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  status: GameStatus;
  gravityAcc: number;
  rng: () => number;
}

export interface TetrisStore {
  getState(): TetrisSnapshot;
  subscribe(listener: (state: TetrisSnapshot) => void): () => void;
  reset(seed?: string): void;
  shift(dx: number): void;
  rotate(direction: 1 | -1): void;
  softDrop(): void;
  hardDrop(): void;
  swapHold(): void;
  tick(dt: number): void;
}

function shuffle(source: readonly PieceType[], rng: () => number): PieceType[] {
  const out = source.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: SPAWN_COLUMN, y: 0 };
}

export function createTetrisStore(seed = "block-stacker"): TetrisStore {
  const listeners = new Set<(state: TetrisSnapshot) => void>();
  const state: MutableState = {
    board: createBoard(BOARD_WIDTH, BOARD_HEIGHT),
    active: null,
    queue: [],
    bag: [],
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 0,
    status: "playing",
    gravityAcc: 0,
    rng: seededRng(seed),
  };
  let snapshot: TetrisSnapshot = buildSnapshot();

  function refillQueue(): void {
    while (state.queue.length <= PREVIEW_COUNT) {
      if (state.bag.length === 0) state.bag = shuffle(PIECE_TYPES, state.rng);
      state.queue.push(state.bag.pop()!);
    }
  }

  function spawnNext(): void {
    refillQueue();
    const type = state.queue.shift()!;
    refillQueue();
    const piece = spawnPiece(type);
    state.active = piece;
    state.canHold = true;
    state.gravityAcc = 0;
    if (collides(state.board, piece)) state.status = "gameover";
  }

  function lockActive(): void {
    if (state.active === null) return;
    state.board = merge(state.board, state.active);
    const result = clearLines(state.board);
    state.board = result.board;
    if (result.cleared > 0) {
      state.lines += result.cleared;
      state.score += lineScore(result.cleared, state.level);
      state.level = levelForLines(state.lines);
    }
    state.active = null;
    spawnNext();
  }

  function buildSnapshot(): TetrisSnapshot {
    const active = state.active;
    const ghostY =
      active === null ? null : active.y + dropDistance(state.board, active);
    return {
      board: state.board,
      active,
      ghostY,
      next: state.queue.slice(0, PREVIEW_COUNT),
      hold: state.hold,
      canHold: state.canHold,
      score: state.score,
      lines: state.lines,
      level: state.level,
      status: state.status,
    };
  }

  function emit(): void {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function reset(nextSeed?: string): void {
    state.board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
    state.active = null;
    state.queue = [];
    state.bag = [];
    state.hold = null;
    state.canHold = true;
    state.score = 0;
    state.lines = 0;
    state.level = 0;
    state.status = "playing";
    state.gravityAcc = 0;
    state.rng = seededRng(nextSeed ?? `${seed}-${Date.now()}`);
    spawnNext();
    emit();
  }

  function shift(dx: number): void {
    if (state.status !== "playing" || state.active === null) return;
    const moved = { ...state.active, x: state.active.x + dx };
    if (!collides(state.board, moved)) {
      state.active = moved;
      emit();
    }
  }

  function rotate(direction: 1 | -1): void {
    if (state.status !== "playing" || state.active === null) return;
    const rotation = ((state.active.rotation + direction) % 4 + 4) % 4;
    for (const [kx, ky] of KICK_OFFSETS) {
      const candidate = {
        ...state.active,
        rotation,
        x: state.active.x + kx,
        y: state.active.y + ky,
      };
      if (!collides(state.board, candidate)) {
        state.active = candidate;
        emit();
        return;
      }
    }
  }

  function softDrop(): void {
    if (state.status !== "playing" || state.active === null) return;
    const moved = { ...state.active, y: state.active.y + 1 };
    if (collides(state.board, moved)) {
      lockActive();
    } else {
      state.active = moved;
      state.score += 1;
      state.gravityAcc = 0;
    }
    emit();
  }

  function hardDrop(): void {
    if (state.status !== "playing" || state.active === null) return;
    const distance = dropDistance(state.board, state.active);
    state.active = { ...state.active, y: state.active.y + distance };
    state.score += distance * 2;
    lockActive();
    emit();
  }

  function swapHold(): void {
    if (state.status !== "playing" || state.active === null || !state.canHold) return;
    const current = state.active.type;
    if (state.hold === null) {
      state.hold = current;
      state.active = null;
      spawnNext();
    } else {
      const swapped = state.hold;
      state.hold = current;
      state.active = spawnPiece(swapped);
      state.gravityAcc = 0;
      if (collides(state.board, state.active)) state.status = "gameover";
    }
    state.canHold = false;
    emit();
  }

  function tick(dt: number): void {
    if (state.status !== "playing" || state.active === null) return;
    state.gravityAcc += dt;
    const interval = gravityInterval(state.level);
    let changed = false;
    while (state.gravityAcc >= interval) {
      state.gravityAcc -= interval;
      const current: ActivePiece | null = state.active;
      if (current === null) break;
      const moved: ActivePiece = { ...current, y: current.y + 1 };
      if (collides(state.board, moved)) {
        lockActive();
        changed = true;
        break;
      }
      state.active = moved;
      changed = true;
    }
    if (changed) emit();
  }

  reset(seed);

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset,
    shift,
    rotate,
    softDrop,
    hardDrop,
    swapHold,
    tick,
  };
}

export const blockStackerStore = createTetrisStore();
