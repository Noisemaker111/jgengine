import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { STORE_KEY, type AppState } from "./state";

/** Stage a mid-game beginner board: an opened region, a few flags, a running clock. */
export const uiScenario: UiPreviewScenario = (ctx, playable) => {
  ctx.game.commands.run("difficultyBeginner", {});
  ctx.game.commands.run("reveal", { index: 40 });

  const app = ctx.game.store.get(STORE_KEY) as AppState | undefined;
  if (app !== undefined) {
    const covered: number[] = [];
    app.board.cells.forEach((cell, i) => {
      if (!cell.revealed && cell.mark === "none") covered.push(i);
    });
    for (const index of covered.slice(0, 3)) ctx.game.commands.run("mark", { index });
  }

  for (let second = 0; second < 47; second += 1) playable.loop.onTick(ctx, 1);
};
