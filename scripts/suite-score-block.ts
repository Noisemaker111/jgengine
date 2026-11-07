// The markers round the suite score `gen-game-suite.ts` writes into each game's README and PLAN. The
// rest of those files is written by hand; only the text between the markers is generated, so a
// rebase conflict inside them is resolved and regenerated (`generated-rebase.ts`).
export const SUITE_SCORE_START = "<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->";
export const SUITE_SCORE_END = "<!-- /suite-score -->";
