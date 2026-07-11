import { seededRng } from "@jgengine/core/random/rng";

export const CODE_LENGTH = 4;
export const MAX_ROWS = 10;
export const COLORS_NORMAL = 6;
export const COLORS_HARD = 8;

export interface Options {
  readonly duplicates: boolean;
  readonly hard: boolean;
}

export type GameStatus = "playing" | "won" | "lost";

export interface Feedback {
  /** Exact position + color matches. */
  readonly black: number;
  /** Right color, wrong position. */
  readonly white: number;
}

export interface Guess {
  readonly pegs: readonly number[];
  readonly feedback: Feedback;
}

/** Whether a round counts toward records — only fresh random games do. */
export type RoundKind = "ranked" | "daily" | "shared";

export interface Round {
  readonly secret: readonly number[];
  readonly colors: number;
  readonly options: Options;
  readonly seed: string;
  readonly kind: RoundKind;
  readonly guesses: readonly Guess[];
  readonly active: readonly number[];
  readonly status: GameStatus;
  readonly revealed: boolean;
}

export const MODE_KEYS = ["6-dup", "6-uniq", "8-dup", "8-uniq"] as const;
export type ModeKey = (typeof MODE_KEYS)[number];

export function colorsFor(options: Options): number {
  return options.hard ? COLORS_HARD : COLORS_NORMAL;
}

export function modeKey(options: Options): ModeKey {
  const base = options.hard ? "8" : "6";
  return `${base}-${options.duplicates ? "dup" : "uniq"}` as ModeKey;
}

/**
 * Canonical Mastermind / Bulls & Cows scoring with correct duplicate handling:
 * exact matches are counted first and removed from both tallies, so each secret
 * peg contributes to at most one key peg (black beats white).
 */
export function scoreGuess(secret: readonly number[], guess: readonly number[]): Feedback {
  let black = 0;
  const secretLeft = new Map<number, number>();
  const guessLeft = new Map<number, number>();
  for (let i = 0; i < secret.length; i += 1) {
    if (guess[i] === secret[i]) {
      black += 1;
    } else {
      secretLeft.set(secret[i], (secretLeft.get(secret[i]) ?? 0) + 1);
      guessLeft.set(guess[i], (guessLeft.get(guess[i]) ?? 0) + 1);
    }
  }
  let white = 0;
  for (const [color, count] of guessLeft) {
    white += Math.min(count, secretLeft.get(color) ?? 0);
  }
  return { black, white };
}

export function makeSecret(seed: string, options: Options): number[] {
  const rng = seededRng(seed);
  const colors = colorsFor(options);
  if (options.duplicates) {
    const secret: number[] = [];
    for (let i = 0; i < CODE_LENGTH; i += 1) secret.push(Math.floor(rng() * colors));
    return secret;
  }
  const pool = Array.from({ length: colors }, (_, index) => index);
  const secret: number[] = [];
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const pick = Math.floor(rng() * pool.length);
    secret.push(pool[pick]);
    pool.splice(pick, 1);
  }
  return secret;
}

export function createRound(seed: string, options: Options, kind: RoundKind = "ranked"): Round {
  return {
    secret: makeSecret(seed, options),
    colors: colorsFor(options),
    options,
    seed,
    kind,
    guesses: [],
    active: [],
    status: "playing",
    revealed: false,
  };
}

export function addPeg(round: Round, color: number): Round {
  if (round.status !== "playing") return round;
  if (round.active.length >= CODE_LENGTH) return round;
  if (!Number.isInteger(color) || color < 0 || color >= round.colors) return round;
  return { ...round, active: [...round.active, color] };
}

export function removePeg(round: Round): Round {
  if (round.status !== "playing" || round.active.length === 0) return round;
  return { ...round, active: round.active.slice(0, -1) };
}

export function clearActive(round: Round): Round {
  if (round.status !== "playing" || round.active.length === 0) return round;
  return { ...round, active: [] };
}

export function canSubmit(round: Round): boolean {
  return round.status === "playing" && round.active.length === CODE_LENGTH;
}

export function submitGuess(round: Round): Round {
  if (!canSubmit(round)) return round;
  const feedback = scoreGuess(round.secret, round.active);
  const guesses: Guess[] = [...round.guesses, { pegs: round.active, feedback }];
  if (feedback.black === CODE_LENGTH) {
    return { ...round, guesses, active: [], status: "won", revealed: true };
  }
  if (guesses.length >= MAX_ROWS) {
    return { ...round, guesses, active: [], status: "lost", revealed: true };
  }
  return { ...round, guesses, active: [] };
}

export function rowsLeft(round: Round): number {
  return Math.max(0, MAX_ROWS - round.guesses.length);
}
