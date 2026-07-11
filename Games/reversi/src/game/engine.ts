import { seededRng } from "@jgengine/core/random/rng";

import { chooseMove } from "./ai";
import type { AiLevel } from "./ai";
import { DARK, LIGHT, applyMove, counts, createBoard, hasMove, legalMoves, opponent, winnerOf } from "./board";
import type { Player } from "./board";
import { readRecords, recordOutcome } from "./records";
import { GAME_SEED } from "./state";
import type { AppState, GameResult, HistorySnapshot, LastMove, Mode } from "./state";

export const AI_DELAY_MS = 600;
export const PASS_BANNER_MS = 1600;
export const HUMAN_SIDE: Player = DARK;
export const AI_SIDE: Player = LIGHT;

export function freshGame(mode: Mode, level: AiLevel): AppState {
  const board = createBoard();
  const c = counts(board);
  return {
    board,
    toMove: DARK,
    mode,
    level,
    aiSide: AI_SIDE,
    status: "playing",
    result: null,
    lastMove: null,
    legal: legalMoves(board, DARK),
    history: [],
    passBanner: null,
    passBannerMs: 0,
    aiThinking: mode === "ai" && AI_SIDE === DARK,
    aiTimerMs: 0,
    ply: 0,
    recorded: false,
    counts: { dark: c.dark, light: c.light },
    records: readRecords(),
  };
}

function snapshot(state: AppState): HistorySnapshot {
  return { board: state.board, toMove: state.toMove, ply: state.ply, lastMove: state.lastMove };
}

function settle(state: AppState): AppState {
  const c = counts(state.board);
  const winner = winnerOf(state.board);
  const result: GameResult = { winner, dark: c.dark, light: c.light };
  if (state.mode === "ai" && !state.recorded) {
    const humanSide = opponent(state.aiSide);
    if (winner === 0) recordOutcome(state.level, "draw", 0);
    else if (winner === humanSide) {
      const margin = humanSide === DARK ? c.dark - c.light : c.light - c.dark;
      recordOutcome(state.level, "win", margin);
    } else recordOutcome(state.level, "loss", 0);
  }
  return {
    ...state,
    status: "over",
    result,
    legal: [],
    aiThinking: false,
    aiTimerMs: 0,
    passBanner: null,
    passBannerMs: 0,
    recorded: true,
    counts: { dark: c.dark, light: c.light },
    records: readRecords(),
  };
}

function resolveAfterMove(state: AppState): AppState {
  let toMove = opponent(state.toMove);
  let passBanner: Player | null = null;
  let passBannerMs = 0;
  for (;;) {
    if (hasMove(state.board, toMove)) break;
    const other = opponent(toMove);
    if (!hasMove(state.board, other)) return settle({ ...state, toMove });
    passBanner = toMove;
    passBannerMs = PASS_BANNER_MS;
    toMove = other;
  }
  const c = counts(state.board);
  return {
    ...state,
    toMove,
    legal: legalMoves(state.board, toMove),
    passBanner,
    passBannerMs,
    aiThinking: state.mode === "ai" && toMove === state.aiSide,
    aiTimerMs: 0,
    counts: { dark: c.dark, light: c.light },
  };
}

function commit(state: AppState, player: Player, index: number): AppState {
  const { board, flips } = applyMove(state.board, player, index);
  const lastMove: LastMove = { index, player, flips };
  return resolveAfterMove({ ...state, board, lastMove, ply: state.ply + 1 });
}

export function humanMove(state: AppState, index: number): AppState | null {
  if (state.status !== "playing" || state.aiThinking) return null;
  if (state.mode === "ai" && state.toMove === state.aiSide) return null;
  if (!state.legal.includes(index)) return null;
  return commit({ ...state, history: [...state.history, snapshot(state)] }, state.toMove, index);
}

export function aiMove(state: AppState): AppState {
  const rng = seededRng(`${GAME_SEED}:${state.level}:${state.ply}`);
  const move = chooseMove(state.board, state.toMove, state.level, rng);
  if (move === null) return state;
  return commit(state, state.toMove, move);
}

export function undoMove(state: AppState): AppState {
  if (state.history.length === 0) return state;
  const history = state.history.slice(0, -1);
  const snap = state.history[state.history.length - 1];
  const c = counts(snap.board);
  return {
    ...state,
    board: snap.board,
    toMove: snap.toMove,
    ply: snap.ply,
    lastMove: snap.lastMove,
    status: "playing",
    result: null,
    legal: legalMoves(snap.board, snap.toMove),
    history,
    passBanner: null,
    passBannerMs: 0,
    aiThinking: false,
    aiTimerMs: 0,
    recorded: false,
    counts: { dark: c.dark, light: c.light },
  };
}
