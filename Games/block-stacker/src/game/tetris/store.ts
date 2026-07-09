import { seededRng } from "@jgengine/core/item/affix";

import {
  BACK_TO_BACK_MULTIPLIER,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LOCK_DELAY_SECONDS,
  MAX_LOCK_RESETS,
  clearLines,
  collides,
  comboBonus,
  createBoard,
  dropDistance,
  gravityInterval,
  isBoardInDanger,
  isGrounded,
  levelForLines,
  lineScore,
  linesUntilNextLevel,
  merge,
  type ActivePiece,
  type Board,
} from "./logic";
import { PIECE_TYPES, SPAWN_COLUMN, KICK_OFFSETS, type PieceType } from "./pieces";

export type GameStatus = "playing" | "gameover";

export interface TetrisSnapshot {
  readonly board: Board;
  readonly active: ActivePiece | null;
  readonly fallOffset: number;
  readonly ghostY: number | null;
  readonly next: readonly PieceType[];
  readonly hold: PieceType | null;
  readonly canHold: boolean;
  readonly score: number;
  readonly best: number;
  readonly lines: number;
  readonly level: number;
  readonly linesToNextLevel: number;
  readonly status: GameStatus;
  readonly combo: number;
  readonly backToBack: boolean;
  readonly message: string | null;
  readonly danger: boolean;
}

const PREVIEW_COUNT = 5;
const MESSAGE_DURATION = 1.4;
const CLEAR_LABEL: Record<number, string> = { 1: "Single", 2: "Double", 3: "Triple", 4: "Tetris!" };

interface MutableState {
  board: Board;
  active: ActivePiece | null;
  queue: PieceType[];
  bag: PieceType[];
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  best: number;
  lines: number;
  level: number;
  status: GameStatus;
  gravityAcc: number;
  fallOffset: number;
  lockDelayAcc: number;
  lockResets: number;
  combo: number;
  backToBack: boolean;
  message: string | null;
  messageTimer: number;
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
    best: 0,
    lines: 0,
    level: 0,
    status: "playing",
    gravityAcc: 0,
    fallOffset: 0,
    lockDelayAcc: 0,
    lockResets: 0,
    combo: -1,
    backToBack: false,
    message: null,
    messageTimer: 0,
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
    state.fallOffset = 0;
    state.lockDelayAcc = 0;
    state.lockResets = 0;
    if (collides(state.board, piece)) state.status = "gameover";
  }

  function noteMovement(): void {
    const active = state.active;
    if (active === null) return;
    if (isGrounded(state.board, active)) {
      if (state.lockResets < MAX_LOCK_RESETS) {
        state.lockDelayAcc = 0;
        state.lockResets += 1;
      }
    } else {
      state.lockDelayAcc = 0;
      state.lockResets = 0;
    }
  }

  function lockActive(): void {
    if (state.active === null) return;
    state.board = merge(state.board, state.active);
    const result = clearLines(state.board);
    state.board = result.board;
    state.lockDelayAcc = 0;
    state.lockResets = 0;
    if (result.cleared > 0) {
      state.lines += result.cleared;
      const isTetris = result.cleared === 4;
      const isB2B = isTetris && state.backToBack;
      let gained = lineScore(result.cleared, state.level);
      if (isB2B) gained = Math.round(gained * BACK_TO_BACK_MULTIPLIER);
      state.combo += 1;
      gained += comboBonus(state.combo, state.level);
      state.score += gained;
      state.level = levelForLines(state.lines);
      state.backToBack = isTetris;
      const label = CLEAR_LABEL[result.cleared] ?? "";
      const comboSuffix = state.combo > 0 ? ` +Combo x${state.combo}` : "";
      state.message = `${isB2B ? "Back-to-Back " : ""}${label}${comboSuffix}`;
      state.messageTimer = MESSAGE_DURATION;
    } else {
      state.combo = -1;
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
      fallOffset: state.fallOffset,
      ghostY,
      next: state.queue.slice(0, PREVIEW_COUNT),
      hold: state.hold,
      canHold: state.canHold,
      score: state.score,
      best: state.best,
      lines: state.lines,
      level: state.level,
      linesToNextLevel: linesUntilNextLevel(state.lines),
      status: state.status,
      combo: state.combo,
      backToBack: state.backToBack,
      message: state.message,
      danger: isBoardInDanger(state.board),
    };
  }

  function emit(): void {
    state.best = Math.max(state.best, state.score);
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
    state.fallOffset = 0;
    state.lockDelayAcc = 0;
    state.lockResets = 0;
    state.combo = -1;
    state.backToBack = false;
    state.message = null;
    state.messageTimer = 0;
    state.rng = seededRng(nextSeed ?? `${seed}-${Date.now()}`);
    spawnNext();
    emit();
  }

  function shift(dx: number): void {
    if (state.status !== "playing" || state.active === null) return;
    const moved = { ...state.active, x: state.active.x + dx };
    if (!collides(state.board, moved)) {
      state.active = moved;
      noteMovement();
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
        noteMovement();
        emit();
        return;
      }
    }
  }

  function softDrop(): void {
    if (state.status !== "playing" || state.active === null) return;
    const moved = { ...state.active, y: state.active.y + 1 };
    if (collides(state.board, moved)) return;
    state.active = moved;
    state.score += 1;
    state.gravityAcc = 0;
    state.fallOffset = 0;
    noteMovement();
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
      state.fallOffset = 0;
      state.lockDelayAcc = 0;
      state.lockResets = 0;
      if (collides(state.board, state.active)) state.status = "gameover";
    }
    state.canHold = false;
    emit();
  }

  function tick(dt: number): void {
    if (state.status !== "playing" || state.active === null) return;
    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      if (state.messageTimer === 0) state.message = null;
    }
    const active = state.active;
    if (active !== null && isGrounded(state.board, active)) {
      state.fallOffset = 0;
      state.lockDelayAcc += dt;
      if (state.lockDelayAcc >= LOCK_DELAY_SECONDS) lockActive();
    } else {
      const interval = gravityInterval(state.level);
      state.gravityAcc += dt;
      while (state.gravityAcc >= interval) {
        state.gravityAcc -= interval;
        const current: ActivePiece | null = state.active;
        if (current === null) break;
        const moved: ActivePiece = { ...current, y: current.y + 1 };
        if (collides(state.board, moved)) break;
        state.active = moved;
      }
      state.fallOffset = interval > 0 ? Math.min(1, state.gravityAcc / interval) : 0;
      state.lockDelayAcc = 0;
      state.lockResets = 0;
    }
    emit();
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
