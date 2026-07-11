import type { Player } from "./logic/board";
import type { AiLevel } from "./logic/ai";
import type { Board } from "./logic/board";
import type { Outcome, RecordsView } from "./records";

export const STORE_KEY = "four-in-a-row";

/** Sunflower is always the human; Crimson is always the AI in vs-AI modes. */
export const HUMAN_PLAYER: Player = 1;
export const AI_PLAYER: Player = 2;

/** Delay before the AI commits, so the human's drop animation lands first. */
export const AI_THINK_MS = 480;

export type Mode = AiLevel | "hotseat";

export interface AppState {
  board: Board;
  mode: Mode;
  /** Who moves first this game; alternates each rematch. */
  firstPlayer: Player;
  /** Seeds the AI's tie-break rng (combined with move count). */
  seed: string;
  aiThinking: boolean;
  aiCountdownMs: number | null;
  /** From the human's perspective in vs-AI modes; null in hotseat. */
  outcome: Outcome | null;
  newBestStreak: boolean;
  /** Whether this game's result was already folded into the records. */
  recorded: boolean;
  records: RecordsView;
}

export function isAiMode(mode: Mode): mode is AiLevel {
  return mode !== "hotseat";
}

export function aiLevel(mode: Mode): AiLevel | null {
  return mode === "hotseat" ? null : mode;
}

let seedNonce = 0;

export function freshSeed(): string {
  seedNonce += 1;
  const clock = typeof performance !== "undefined" ? Math.floor(performance.now()) : 0;
  return `fir-${Date.now().toString(36)}-${clock.toString(36)}-${seedNonce.toString(36)}`;
}
