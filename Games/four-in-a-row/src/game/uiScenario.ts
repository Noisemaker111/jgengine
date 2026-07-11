import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { boardFromMoves, type Move, type Player } from "./logic/board";
import type { RecordsView } from "./records";
import { STORE_KEY, type AppState } from "./state";

/** A balanced mid-game vs-Medium position, on the human's turn. */
const SEQUENCE = [3, 4, 2, 5, 4, 3, 5, 2, 3, 4];
const STAGED: Move[] = SEQUENCE.map((col) => ({ col, row: 0, player: 1 as Player }));

const RECORDS: RecordsView = {
  tallies: {
    easy: { win: 6, loss: 1, draw: 0 },
    medium: { win: 4, loss: 2, draw: 1 },
    hard: { win: 1, loss: 3, draw: 0 },
  },
  streak: { easy: 3, medium: 2, hard: 0 },
  bestStreak: { easy: 5, medium: 3, hard: 1 },
};

/** Stage the full playing HUD: mid-game board, turn/score indicator, controls, credit footer. */
export const uiScenario: UiPreviewScenario = (ctx) => {
  const board = boardFromMoves(STAGED, 1);
  const app: AppState = {
    board,
    mode: "medium",
    firstPlayer: 1,
    seed: "preview",
    aiThinking: false,
    aiCountdownMs: null,
    outcome: null,
    newBestStreak: false,
    recorded: false,
    records: RECORDS,
  };
  ctx.game.store.set(STORE_KEY, app);
};
