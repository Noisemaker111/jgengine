import type { Board, BoardConfig, Difficulty, StandardDifficulty } from "./board";

export const STORE_KEY = "flag-sweep";

export interface Settings {
  questionsEnabled: boolean;
}

export interface GameResult {
  won: boolean;
  difficulty: Difficulty;
  seconds: number;
  newBest: boolean;
}

export interface AppState {
  board: Board;
  settings: Settings;
  result: GameResult | null;
  bests: Partial<Record<StandardDifficulty, number>>;
  customConfig: BoardConfig;
}

let seedNonce = 0;

export function freshSeed(): string {
  seedNonce += 1;
  const clock = typeof performance !== "undefined" ? Math.floor(performance.now()) : 0;
  return `fs-${Date.now().toString(36)}-${clock.toString(36)}-${seedNonce.toString(36)}`;
}
