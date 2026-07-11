import type { Mark } from "../logic/types";

export type { Mark };
export type View = "menu" | "play";
export type Status = "solving" | "won" | "failed";
export type PaintMode = "fill" | "cross";

export interface HistoryEntry {
  board: Mark[][];
  strikes: number;
}

export interface AppState {
  view: View;
  puzzleId: string | null;
  size: number;
  board: Mark[][];
  status: Status;
  paintMode: PaintMode;
  mistakesMode: boolean;
  strikes: number;
  maxStrikes: number;
  elapsedMs: number;
  running: boolean;
  stroke: { value: Mark } | null;
  history: HistoryEntry[];
  bestMs: number | null;
  completed: readonly string[];
  newRecord: boolean;
}
