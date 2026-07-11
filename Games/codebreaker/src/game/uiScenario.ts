import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { CODE_LENGTH, MODE_KEYS, addPeg, createRound, submitGuess, type Options } from "./codebreaker";
import type { ModeRecord, RecordsSnapshot } from "./records";
import { STORE_KEY, type AppState } from "./state";

const PREVIEW_OPTIONS: Options = { duplicates: true, hard: false };

function stagedRecords(): RecordsSnapshot {
  const out = {} as Record<(typeof MODE_KEYS)[number], ModeRecord>;
  for (const mode of MODE_KEYS) {
    out[mode] = mode === "6-dup" ? { streak: 4, bestStreak: 7, fewest: 5 } : { streak: 0, bestStreak: 0, fewest: null };
  }
  return out;
}

/** Stage the full playing HUD: three scored rows, a half-filled active row, populated records. */
export const uiScenario: UiPreviewScenario = (ctx) => {
  const base = createRound("codebreaker-preview-7", PREVIEW_OPTIONS, "ranked");
  const secret = base.secret;
  const colors = base.colors;

  const notWinning = (guess: number[]): number[] =>
    guess.length === CODE_LENGTH && guess.every((value, index) => value === secret[index])
      ? [(guess[0] + 1) % colors, ...guess.slice(1)]
      : guess;

  const guesses: number[][] = [
    notWinning([secret[1], secret[2], secret[3], secret[0]]),
    notWinning([secret[3], secret[2], secret[1], secret[0]]),
    notWinning([secret[0], secret[1], (secret[2] + 1) % colors, (secret[3] + 2) % colors]),
  ];

  let round = base;
  for (const guess of guesses) {
    for (const color of guess) round = addPeg(round, color);
    round = submitGuess(round);
  }
  round = addPeg(round, secret[0]);
  round = addPeg(round, (secret[1] + 1) % colors);

  const app: AppState = { round, records: stagedRecords(), result: null };
  ctx.game.store.set(STORE_KEY, app);
};
