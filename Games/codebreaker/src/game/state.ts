import type { ModeKey, RoundKind, Round } from "./codebreaker";
import type { RecordsSnapshot } from "./records";

export const STORE_KEY = "codebreaker";

export interface GameResult {
  readonly won: boolean;
  readonly guesses: number;
  readonly mode: ModeKey;
  readonly kind: RoundKind;
  readonly streak: number;
  readonly newBestStreak: boolean;
  readonly newFewest: boolean;
}

export interface AppState {
  readonly round: Round;
  readonly records: RecordsSnapshot;
  readonly result: GameResult | null;
}

let seedNonce = 0;

export function freshSeed(): string {
  seedNonce += 1;
  const clock = typeof performance !== "undefined" ? Math.floor(performance.now()) : 0;
  return `cb-${Date.now().toString(36)}-${clock.toString(36)}-${seedNonce.toString(36)}`;
}
