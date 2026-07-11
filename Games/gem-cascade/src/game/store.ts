import { seededRng } from "@jgengine/core/random/rng";

import {
  areAdjacent,
  clearCells,
  collapseAndRefill,
  findFirstMove,
  gemAt,
  generateBoard,
  hasLegalMove,
  hasMatch,
  matchesOf,
  reshuffle,
  scoreCascade,
  swapped,
  uniqueCells,
  type Board,
  type Cell,
} from "./board";
import { records } from "./records";

export type Mode = "endless" | "timed";
export type Status = "playing" | "gameover";
export type Phase = "idle" | "swapping" | "reverting" | "clearing" | "falling";

export const TIMED_SECONDS = 120;

const SWAP_TIME = 0.2;
const CLEAR_TIME = 0.28;
const FALL_TIME = 0.3;
const HINT_SHOW = 2.6;
const HINT_COOLDOWN = 6;
const FLOAT_TTL = 0.95;
const TOAST_TTL = 2.4;

export interface GemSprite {
  readonly id: number;
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly clearing: boolean;
}

export interface FloatItem {
  readonly id: number;
  readonly gx: number;
  readonly gy: number;
  readonly text: string;
  readonly variant: "score" | "chain";
  readonly tier: number;
  readonly bornAt: number;
}

export interface ToastItem {
  readonly id: number;
  readonly text: string;
  readonly bornAt: number;
}

export interface Snapshot {
  readonly mode: Mode;
  readonly status: Status;
  readonly size: number;
  readonly score: number;
  readonly moves: number;
  readonly timed: boolean;
  readonly secondsLeft: number;
  readonly sprites: readonly GemSprite[];
  readonly selected: Cell | null;
  readonly hintCells: readonly Cell[];
  readonly interactive: boolean;
  readonly phase: Phase;
  readonly chain: number;
  readonly bestChain: number;
  readonly hintReady: boolean;
  readonly hintCooldown: number;
  readonly floats: readonly FloatItem[];
  readonly toasts: readonly ToastItem[];
  readonly best: { readonly endless: number | null; readonly timed: number | null };
}

interface State {
  mode: Mode;
  status: Status;
  board: Board;
  rng: () => number;
  seed: string;
  score: number;
  moves: number;
  cascade: number;
  bestChain: number;
  lastMultiplier: number;
  phase: Phase;
  phaseElapsed: number;
  clock: number;
  selected: Cell | null;
  pendingSwap: { a: Cell; b: Cell } | null;
  clearingIds: Set<number>;
  pendingClearCells: Cell[];
  hintCells: Cell[] | null;
  hintTimer: number;
  hintCooldown: number;
  timeLeft: number;
  floats: FloatItem[];
  toasts: ToastItem[];
}

export interface GemStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Snapshot;
  advance(dt: number): void;
  selectCell(cell: Cell): void;
  requestSwap(a: Cell, b: Cell): void;
  useHint(): void;
  newGame(mode?: Mode): void;
  setMode(mode: Mode): void;
  peekMove(): { from: Cell; to: Cell } | null;
}

const EMPTY_SNAPSHOT: Snapshot = {
  mode: "endless",
  status: "playing",
  size: 8,
  score: 0,
  moves: 0,
  timed: false,
  secondsLeft: 0,
  sprites: [],
  selected: null,
  hintCells: [],
  interactive: false,
  phase: "idle",
  chain: 0,
  bestChain: 0,
  hintReady: false,
  hintCooldown: 0,
  floats: [],
  toasts: [],
  best: { endless: null, timed: null },
};

let runSerial = 0;
let floatSerial = 0;
let toastSerial = 0;

function createStore(): GemStore {
  const listeners = new Set<() => void>();
  let state: State | null = null;
  let snapshot: Snapshot = EMPTY_SNAPSHOT;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function build(s: State): Snapshot {
    const sprites: GemSprite[] = [];
    for (let y = 0; y < s.board.height; y += 1) {
      for (let x = 0; x < s.board.width; x += 1) {
        const g = gemAt(s.board, x, y);
        if (g !== null) sprites.push({ id: g.id, kind: g.kind, x, y, clearing: s.clearingIds.has(g.id) });
      }
    }
    sprites.sort((a, b) => a.id - b.id);
    return {
      mode: s.mode,
      status: s.status,
      size: s.board.width,
      score: s.score,
      moves: s.moves,
      timed: s.mode === "timed",
      secondsLeft: s.mode === "timed" ? Math.max(0, Math.ceil(s.timeLeft)) : 0,
      sprites,
      selected: s.selected,
      hintCells: s.hintCells ?? [],
      interactive: s.phase === "idle" && s.status === "playing",
      phase: s.phase,
      chain: s.cascade,
      bestChain: s.bestChain,
      hintReady: s.hintCooldown <= 0 && s.phase === "idle" && s.status === "playing",
      hintCooldown: Math.max(0, Math.ceil(s.hintCooldown)),
      floats: s.floats,
      toasts: s.toasts,
      best: { endless: records.bestOf("endless"), timed: records.bestOf("timed") },
    };
  }

  function sync(): void {
    snapshot = state === null ? EMPTY_SNAPSHOT : build(state);
    notify();
  }

  function submitScore(s: State): void {
    records.submit(s.mode === "timed" ? { timed: s.score } : { endless: s.score });
  }

  function addToast(s: State, text: string): void {
    toastSerial += 1;
    s.toasts = [...s.toasts, { id: toastSerial, text, bornAt: s.clock }];
  }

  function beginClear(s: State): void {
    const runs = matchesOf(s.board);
    if (runs.length === 0) {
      endCascade(s);
      return;
    }
    s.cascade += 1;
    const cells = uniqueCells(runs);
    const score = scoreCascade(runs, s.cascade);
    s.score += score.points;
    s.lastMultiplier = score.multiplier;
    if (s.cascade > s.bestChain) s.bestChain = s.cascade;

    const ids = new Set<number>();
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      const g = gemAt(s.board, c.x, c.y);
      if (g !== null) ids.add(g.id);
      sx += c.x;
      sy += c.y;
    }
    s.clearingIds = ids;
    s.pendingClearCells = cells;

    floatSerial += 1;
    const additions: FloatItem[] = [
      {
        id: floatSerial,
        gx: sx / cells.length,
        gy: sy / cells.length,
        text: `+${score.points}`,
        variant: "score",
        tier: score.multiplier,
        bornAt: s.clock,
      },
    ];
    if (score.multiplier >= 2) {
      floatSerial += 1;
      additions.push({
        id: floatSerial,
        gx: (s.board.width - 1) / 2,
        gy: (s.board.height - 1) / 2,
        text: `Chain ×${score.multiplier}`,
        variant: "chain",
        tier: score.multiplier,
        bornAt: s.clock,
      });
    }
    s.floats = [...s.floats, ...additions];

    s.phase = "clearing";
    s.phaseElapsed = 0;
  }

  function applyClear(s: State): void {
    s.board = collapseAndRefill(clearCells(s.board, s.pendingClearCells), s.rng);
    s.clearingIds = new Set();
    s.pendingClearCells = [];
    s.phase = "falling";
    s.phaseElapsed = 0;
  }

  function afterFall(s: State): void {
    if (hasMatch(s.board)) {
      beginClear(s);
      return;
    }
    endCascade(s);
  }

  function endCascade(s: State): void {
    s.phase = "idle";
    s.phaseElapsed = 0;
    s.pendingSwap = null;
    s.cascade = 0;
    submitScore(s);
    if (s.status === "playing" && !hasLegalMove(s.board)) {
      s.board = reshuffle(s.board, s.rng);
      addToast(s, "No moves left — reshuffling the board!");
    }
  }

  function resolveSwap(s: State): void {
    const swap = s.pendingSwap;
    if (swap === null) {
      s.phase = "idle";
      return;
    }
    if (hasMatch(s.board)) {
      s.moves += 1;
      s.cascade = 0;
      s.pendingSwap = null;
      beginClear(s);
    } else {
      s.board = swapped(s.board, swap.a, swap.b);
      s.phase = "reverting";
      s.phaseElapsed = 0;
    }
  }

  function beginSwap(s: State, a: Cell, b: Cell): void {
    s.board = swapped(s.board, a, b);
    s.pendingSwap = { a, b };
    s.selected = null;
    s.hintCells = null;
    s.phase = "swapping";
    s.phaseElapsed = 0;
    sync();
  }

  function endGame(s: State): void {
    s.status = "gameover";
    s.selected = null;
    submitScore(s);
  }

  function start(mode: Mode): void {
    runSerial += 1;
    const seed = `gem-cascade:${mode}:${runSerial}`;
    const rng = seededRng(seed);
    state = {
      mode,
      status: "playing",
      board: generateBoard(rng),
      rng,
      seed,
      score: 0,
      moves: 0,
      cascade: 0,
      bestChain: 0,
      lastMultiplier: 1,
      phase: "idle",
      phaseElapsed: 0,
      clock: 0,
      selected: null,
      pendingSwap: null,
      clearingIds: new Set(),
      pendingClearCells: [],
      hintCells: null,
      hintTimer: 0,
      hintCooldown: 0,
      timeLeft: mode === "timed" ? TIMED_SECONDS : Number.POSITIVE_INFINITY,
      floats: [],
      toasts: [],
    };
    sync();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    advance(dt) {
      if (state === null) return;
      const s = state;
      let dirty = false;
      s.clock += dt;

      if (s.status === "playing" && s.mode === "timed") {
        const before = Math.ceil(s.timeLeft);
        s.timeLeft -= dt;
        if (s.timeLeft <= 0) {
          s.timeLeft = 0;
          endGame(s);
          dirty = true;
        } else if (Math.ceil(s.timeLeft) !== before) {
          dirty = true;
        }
      }

      if (s.hintCooldown > 0) {
        const before = Math.ceil(s.hintCooldown);
        s.hintCooldown = Math.max(0, s.hintCooldown - dt);
        if (Math.ceil(s.hintCooldown) !== before) dirty = true;
      }
      if (s.hintCells !== null) {
        s.hintTimer -= dt;
        if (s.hintTimer <= 0) {
          s.hintCells = null;
          dirty = true;
        }
      }

      const floatsBefore = s.floats.length;
      s.floats = s.floats.filter((f) => s.clock - f.bornAt < FLOAT_TTL);
      if (s.floats.length !== floatsBefore) dirty = true;
      const toastsBefore = s.toasts.length;
      s.toasts = s.toasts.filter((t) => s.clock - t.bornAt < TOAST_TTL);
      if (s.toasts.length !== toastsBefore) dirty = true;

      if (s.phase !== "idle") {
        s.phaseElapsed += dt;
        switch (s.phase) {
          case "swapping":
            if (s.phaseElapsed >= SWAP_TIME) {
              resolveSwap(s);
              dirty = true;
            }
            break;
          case "reverting":
            if (s.phaseElapsed >= SWAP_TIME) {
              s.phase = "idle";
              s.pendingSwap = null;
              dirty = true;
            }
            break;
          case "clearing":
            if (s.phaseElapsed >= CLEAR_TIME) {
              applyClear(s);
              dirty = true;
            }
            break;
          case "falling":
            if (s.phaseElapsed >= FALL_TIME) {
              afterFall(s);
              dirty = true;
            }
            break;
        }
      }

      if (dirty) sync();
    },
    selectCell(cell) {
      if (state === null) return;
      const s = state;
      if (s.phase !== "idle" || s.status !== "playing") return;
      const sel = s.selected;
      if (sel === null) {
        s.selected = cell;
        sync();
        return;
      }
      if (sel.x === cell.x && sel.y === cell.y) {
        s.selected = null;
        sync();
        return;
      }
      if (areAdjacent(sel, cell)) {
        beginSwap(s, sel, cell);
        return;
      }
      s.selected = cell;
      sync();
    },
    requestSwap(a, b) {
      if (state === null) return;
      const s = state;
      if (s.phase !== "idle" || s.status !== "playing") return;
      if (!areAdjacent(a, b)) return;
      beginSwap(s, a, b);
    },
    useHint() {
      if (state === null) return;
      const s = state;
      if (s.status !== "playing" || s.phase !== "idle" || s.hintCooldown > 0) return;
      const move = findFirstMove(s.board);
      if (move === null) return;
      s.hintCells = [move.from, move.to];
      s.hintTimer = HINT_SHOW;
      s.hintCooldown = HINT_COOLDOWN;
      sync();
    },
    newGame(mode) {
      start(mode ?? state?.mode ?? "endless");
    },
    setMode(mode) {
      start(mode);
    },
    peekMove() {
      return state === null ? null : findFirstMove(state.board);
    },
  };
}

export const store: GemStore = createStore();
