import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { store } from "./store";

// Stage a mid-cascade moment for the HUD preview: play a real legal move, then
// fast-forward the store just past the swap so a clear (glow + floating score)
// is frozen on screen.
export const uiScenario: UiPreviewScenario = (ctx) => {
  const move = store.peekMove();
  if (move !== null) {
    ctx.game.commands.run("swap", {
      fromX: move.from.x,
      fromY: move.from.y,
      toX: move.to.x,
      toY: move.to.y,
    });
    store.advance(0.24);
  }
};
