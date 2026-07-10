import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import { seededRng } from "@jgengine/core/random/rng";

import {
  DIR_RIGHT,
  bufferTurn,
  createInitialState,
  intervalForScore,
  step,
  type Cell,
  type Dir,
  type Mode,
  type Phase,
  type SnakeState,
} from "./logic";

export interface SnakeSnapshot extends SnakeState {
  readonly best: number;
}

export interface SnakeStore {
  getState(): SnakeSnapshot;
  subscribe(listener: (snapshot: SnakeSnapshot) => void): () => void;
  reset(): void;
  setMode(mode: Mode): void;
  turn(dir: Dir): void;
  confirm(): void;
  togglePause(): void;
  restart(): void;
  tick(dtSeconds: number): void;
  preview(): void;
}

const MAX_STEPS_PER_FRAME = 5;

function resolveStorage(): RecordStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function createSnakeStore(): SnakeStore {
  const listeners = new Set<(snapshot: SnakeSnapshot) => void>();
  const records = createRecordBook<Mode>({
    key: "jgengine.snake.best.v1",
    fields: { walled: "higher", wrap: "higher" },
    storage: resolveStorage(),
  });

  let runIndex = 0;
  let mode: Mode = "walled";
  let rng = seededRng(`snake-${mode}-${runIndex}`);
  let state: SnakeState = createInitialState(mode, rng, "start");
  let accMs = 0;
  let submitted = false;
  let bestOverride: number | null = null;
  let snapshot = build();

  function build(): SnakeSnapshot {
    const best = bestOverride ?? records.bestOf(mode) ?? 0;
    return { ...state, best };
  }

  function emit(): void {
    snapshot = build();
    for (const listener of listeners) listener(snapshot);
  }

  function nextRng(): () => number {
    runIndex += 1;
    return seededRng(`snake-${mode}-${runIndex}`);
  }

  function newBoard(phase: Phase): void {
    rng = nextRng();
    state = createInitialState(mode, rng, phase);
    accMs = 0;
    submitted = false;
    bestOverride = null;
  }

  function recordScore(): void {
    if (submitted) return;
    submitted = true;
    const run: Partial<Record<Mode, number>> = {};
    run[mode] = state.score;
    records.submit(run);
  }

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      newBoard("start");
      emit();
    },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      newBoard("start");
      emit();
    },
    turn(dir) {
      const next = bufferTurn(state, dir);
      if (next === state) return;
      state = next;
      emit();
    },
    confirm() {
      if (state.phase === "start" || state.phase === "paused") {
        state = { ...state, phase: "playing" };
      } else if (state.phase === "gameover") {
        newBoard("playing");
      } else {
        return;
      }
      emit();
    },
    togglePause() {
      if (state.phase === "playing") state = { ...state, phase: "paused" };
      else if (state.phase === "paused") state = { ...state, phase: "playing" };
      else return;
      emit();
    },
    restart() {
      newBoard("playing");
      emit();
    },
    tick(dtSeconds) {
      if (state.phase !== "playing") return;
      accMs += dtSeconds * 1000;
      let steps = 0;
      let changed = false;
      while (accMs >= state.intervalMs && steps < MAX_STEPS_PER_FRAME) {
        accMs -= state.intervalMs;
        state = step(state, rng);
        steps += 1;
        changed = true;
        if (state.phase !== "playing") {
          recordScore();
          break;
        }
      }
      if (changed) emit();
    },
    preview() {
      mode = "walled";
      rng = seededRng("snake-preview");
      const body: Cell[] = [
        { x: 13, y: 10 },
        { x: 12, y: 10 },
        { x: 11, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 11 },
        { x: 10, y: 12 },
        { x: 11, y: 12 },
        { x: 12, y: 12 },
      ];
      state = {
        mode,
        phase: "playing",
        snake: body,
        dir: DIR_RIGHT,
        pendingDir: null,
        food: { x: 16, y: 7 },
        score: body.length - 1,
        length: body.length,
        intervalMs: intervalForScore(body.length - 1),
        ticks: 48,
        lastAteTick: 44,
        streak: 2,
        grewAtTick: -100,
        deathCause: null,
        won: false,
      };
      accMs = 0;
      submitted = true;
      bestOverride = 14;
      emit();
    },
  };
}

export const snakeStore = createSnakeStore();
