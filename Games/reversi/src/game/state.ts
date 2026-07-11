import type { AiLevel } from "./ai";
import type { Board, Flip, Player } from "./board";

export const STORE_KEY = "reversi:app";
export const GAME_SEED = "reversi-canonical";

export type Mode = "ai" | "hotseat";
export type Status = "playing" | "over";

export interface RecordsView {
  readonly wins: Record<AiLevel, number>;
  readonly losses: Record<AiLevel, number>;
  readonly draws: Record<AiLevel, number>;
  readonly bestMargin: Readonly<Partial<Record<AiLevel, number>>>;
}

export interface LastMove {
  readonly index: number;
  readonly player: Player;
  readonly flips: readonly Flip[];
}

export interface GameResult {
  readonly winner: Player | 0;
  readonly dark: number;
  readonly light: number;
}

export interface HistorySnapshot {
  readonly board: Board;
  readonly toMove: Player;
  readonly ply: number;
  readonly lastMove: LastMove | null;
}

export interface AppState {
  readonly board: Board;
  readonly toMove: Player;
  readonly mode: Mode;
  readonly level: AiLevel;
  readonly aiSide: Player;
  readonly status: Status;
  readonly result: GameResult | null;
  readonly lastMove: LastMove | null;
  readonly legal: readonly number[];
  readonly history: readonly HistorySnapshot[];
  readonly passBanner: Player | null;
  readonly passBannerMs: number;
  readonly aiThinking: boolean;
  readonly aiTimerMs: number;
  readonly ply: number;
  readonly recorded: boolean;
  readonly counts: { readonly dark: number; readonly light: number };
  readonly records: RecordsView;
}
