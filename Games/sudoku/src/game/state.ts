import type { Board } from "./sudoku/board";
import type { Difficulty } from "./sudoku/difficulty";

export const STORE_KEY = "sudoku";

export interface Settings {
  notesMode: boolean;
  showErrors: boolean;
}

export interface WinStats {
  difficulty: Difficulty;
  seconds: number;
  hintsUsed: number;
  newBest: boolean;
}

export interface AppState {
  board: Board;
  settings: Settings;
  bests: Partial<Record<Difficulty, number>>;
  past: Board[];
  win: WinStats | null;
}

export const HISTORY_LIMIT = 128;

let seedNonce = 0;

export function freshSeed(): string {
  seedNonce += 1;
  const clock = typeof performance !== "undefined" ? Math.floor(performance.now()) : 0;
  return `sk-${Date.now().toString(36)}-${clock.toString(36)}-${seedNonce.toString(36)}`;
}
