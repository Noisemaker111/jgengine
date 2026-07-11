import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { Puzzle } from "./logic/types";
import { PUZZLES, puzzleById } from "./puzzles/catalog";
import {
  emptyBoard,
  reduceClear,
  reduceEndStroke,
  reduceStrokeAdd,
  reduceStrokeStart,
  reduceUndo,
} from "./state/engine";
import { bestOf, completedIds, markCompleted, submitTime } from "./state/records";
import { getState, setState } from "./state/store";
import type { AppState, PaintMode } from "./state/types";

const MAX_STRIKES = 3;
const TIMER_CAP_MS = 3_600_000;

interface CommandInput {
  id?: unknown;
  r?: unknown;
  c?: unknown;
  mode?: unknown;
}

function intOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function inBounds(r: number, c: number, size: number): boolean {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function currentPuzzle(state: AppState | undefined): Puzzle | undefined {
  return state?.puzzleId === null || state?.puzzleId === undefined
    ? undefined
    : puzzleById(state.puzzleId);
}

function startState(puzzle: Puzzle, mistakesMode: boolean, paintMode: PaintMode): AppState {
  return {
    view: "play",
    puzzleId: puzzle.id,
    size: puzzle.size,
    board: emptyBoard(puzzle.size),
    status: "solving",
    paintMode,
    mistakesMode,
    strikes: 0,
    maxStrikes: MAX_STRIKES,
    elapsedMs: 0,
    running: true,
    stroke: null,
    history: [],
    bestMs: bestOf(puzzle.id),
    completed: completedIds(),
    newRecord: false,
  };
}

function menuState(prev?: AppState): AppState {
  return {
    view: "menu",
    puzzleId: null,
    size: 0,
    board: [],
    status: "solving",
    paintMode: prev?.paintMode ?? "fill",
    mistakesMode: prev?.mistakesMode ?? false,
    strikes: 0,
    maxStrikes: MAX_STRIKES,
    elapsedMs: 0,
    running: false,
    stroke: null,
    history: [],
    bestMs: null,
    completed: completedIds(),
    newRecord: false,
  };
}

export function initApp(ctx: GameContext): void {
  setState(ctx, menuState());
}

// Persist the win exactly once on the solving -> won transition, then mirror
// the fresh best/completion back into the state.
function commit(ctx: GameContext, prev: AppState | undefined, next: AppState): void {
  if (next.status === "won" && prev?.status !== "won" && next.puzzleId !== null) {
    const improved = submitTime(next.puzzleId, Math.round(next.elapsedMs));
    const completed = markCompleted(next.puzzleId);
    setState(ctx, { ...next, newRecord: improved, bestMs: bestOf(next.puzzleId), completed });
    return;
  }
  setState(ctx, next);
}

export function registerCommands(ctx: GameContext): void {
  const commands = ctx.game.commands;

  commands.define<CommandInput>("selectPuzzle", {
    apply: (context, input) => {
      const id = typeof input.id === "string" ? input.id : null;
      const puzzle = id === null ? undefined : puzzleById(id);
      if (puzzle === undefined) return;
      const prev = getState(context);
      setState(context, startState(puzzle, prev?.mistakesMode ?? false, prev?.paintMode ?? "fill"));
    },
  });

  commands.define<CommandInput>("openMenu", {
    apply: (context) => {
      setState(context, menuState(getState(context)));
    },
  });

  commands.define<CommandInput>("paintStart", {
    apply: (context, input) => {
      const state = getState(context);
      if (state === undefined || state.view !== "play") return;
      const puzzle = currentPuzzle(state);
      if (puzzle === undefined) return;
      const r = intOf(input.r);
      const c = intOf(input.c);
      if (r === null || c === null || !inBounds(r, c, state.size)) return;
      const want = input.mode === "cross" ? "cross" : "fill";
      commit(context, state, reduceStrokeStart(state, puzzle, r, c, want));
    },
  });

  commands.define<CommandInput>("paintAdd", {
    apply: (context, input) => {
      const state = getState(context);
      if (state === undefined || state.view !== "play") return;
      const puzzle = currentPuzzle(state);
      if (puzzle === undefined) return;
      const r = intOf(input.r);
      const c = intOf(input.c);
      if (r === null || c === null || !inBounds(r, c, state.size)) return;
      commit(context, state, reduceStrokeAdd(state, puzzle, r, c));
    },
  });

  commands.define<CommandInput>("paintEnd", {
    apply: (context) => {
      const state = getState(context);
      if (state === undefined) return;
      setState(context, reduceEndStroke(state));
    },
  });

  commands.define<CommandInput>("undo", {
    apply: (context) => {
      const state = getState(context);
      if (state === undefined || state.view !== "play") return;
      setState(context, reduceUndo(state));
    },
  });

  commands.define<CommandInput>("clearBoard", {
    apply: (context) => {
      const state = getState(context);
      if (state === undefined || state.view !== "play") return;
      setState(context, reduceClear(state));
    },
  });

  commands.define<CommandInput>("toggleMode", {
    apply: (context) => {
      const state = getState(context);
      if (state === undefined) return;
      setState(context, { ...state, paintMode: state.paintMode === "fill" ? "cross" : "fill" });
    },
  });

  commands.define<CommandInput>("setMode", {
    apply: (context, input) => {
      const state = getState(context);
      if (state === undefined) return;
      const mode: PaintMode = input.mode === "cross" ? "cross" : "fill";
      setState(context, { ...state, paintMode: mode });
    },
  });

  commands.define<CommandInput>("toggleMistakes", {
    apply: (context) => {
      const state = getState(context);
      if (state === undefined || state.status === "won") return;
      setState(context, {
        ...state,
        mistakesMode: !state.mistakesMode,
        strikes: 0,
        status: state.status === "failed" ? "solving" : state.status,
        running: state.view === "play",
      });
    },
  });

  commands.define<CommandInput>("nextPuzzle", {
    apply: (context) => {
      const state = getState(context);
      if (state === undefined || state.puzzleId === null) return;
      const index = PUZZLES.findIndex((p) => p.id === state.puzzleId);
      const next = index >= 0 && index < PUZZLES.length - 1 ? PUZZLES[index + 1] : null;
      if (next === null) {
        setState(context, menuState(state));
        return;
      }
      setState(context, startState(next, state.mistakesMode, state.paintMode));
    },
  });
}

export function tick(ctx: GameContext, dt: number): void {
  const state = getState(ctx);
  if (state === undefined || state.view !== "play" || state.status !== "solving" || !state.running)
    return;
  const next = Math.min(state.elapsedMs + dt * 1000, TIMER_CAP_MS);
  if (Math.floor(next / 1000) !== Math.floor(state.elapsedMs / 1000)) {
    setState(ctx, { ...state, elapsedMs: next });
  } else {
    state.elapsedMs = next;
  }
}
