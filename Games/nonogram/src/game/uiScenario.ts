import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { puzzleById } from "./puzzles/catalog";
import { appStore } from "./state/store";

// Stage the FULL playing HUD mid-solve: a partially filled board with visible
// clues, a running clock, controls, and the credit footer.
export const uiScenario: UiPreviewScenario = (ctx, playable) => {
  ctx.game.commands.run("selectPuzzle", { id: "duck" });
  const puzzle = puzzleById("duck");
  if (puzzle !== undefined) {
    for (const r of [5, 6, 7])
      for (let c = 0; c < puzzle.size; c += 1)
        if (puzzle.solution[r][c]) {
          ctx.game.commands.run("paintStart", { r, c, mode: "fill" });
          ctx.game.commands.run("paintEnd", {});
        }
    for (const [r, c] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [0, 9],
      [9, 0],
      [9, 9],
    ]) {
      ctx.game.commands.run("paintStart", { r, c, mode: "cross" });
      ctx.game.commands.run("paintEnd", {});
    }
  }
  for (let second = 0; second < 47; second += 1) playable.loop.onTick(ctx, 1);

  const state = appStore.peek(ctx);
  if (state !== undefined) appStore.write(ctx, { ...state, bestMs: 61_000 });
};
