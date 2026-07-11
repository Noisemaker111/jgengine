import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { candidateDigits } from "./sudoku/board";
import { STORE_KEY, type AppState } from "./state";

/** Stage a mid-solve Medium board: filled digits, visible pencil notes, a live selection and clock. */
export const uiScenario: UiPreviewScenario = (ctx, playable) => {
  const read = (): AppState | undefined => ctx.game.store.get(STORE_KEY) as AppState | undefined;
  const run = (cmd: string, input: Record<string, unknown> = {}) => ctx.game.commands.run(cmd, input);

  run("difficultyMedium");
  let app = read();
  if (app === undefined) return;

  const solution = app.board.solution;
  const empties = app.board.values.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);

  // Fill a batch of correct digits so the board reads mid-solve, not blank.
  for (const i of empties.slice(0, 16)) {
    run("select", { index: i });
    run(`num${solution[i]}`);
  }

  // Pencil marks on a few of the remaining empties.
  run("toggleNotes");
  app = read();
  if (app !== undefined) {
    const remaining = app.board.values.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    for (const i of remaining.slice(0, 6)) {
      run("select", { index: i });
      for (const d of candidateDigits(app.board, i).slice(0, 3)) run(`num${d}`);
    }
  }
  run("toggleNotes");

  // Select a filled cell to show selection + same-number highlighting.
  const selApp = read();
  if (selApp !== undefined) {
    const filled = selApp.board.values.findIndex((v, i) => v !== 0 && selApp.board.given[i] === 0);
    run("select", { index: filled >= 0 ? filled : 40 });
  }

  for (let second = 0; second < 95; second += 1) playable.loop.onTick(ctx, 1);
};
