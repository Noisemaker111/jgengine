import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { STORE_KEY } from "./state";
import type { AppState } from "./state";

/** Stage a mid-game vs-Club board: discs placed, legal-move dots live for the human,
 *  a running score bug, controls and the credit footer all in frame. */
export const uiScenario: UiPreviewScenario = (ctx, playable) => {
  ctx.game.commands.run("startGame", { mode: "ai", level: "club" });

  const read = (): AppState | undefined => ctx.game.store.get(STORE_KEY) as AppState | undefined;
  const settle = (): void => {
    for (let t = 0; t < 90; t++) {
      const app = read();
      if (app === undefined || (!app.aiThinking && app.passBanner === null)) break;
      playable.loop.onTick(ctx, 1 / 60);
    }
  };

  for (let round = 0; round < 7; round++) {
    settle();
    const app = read();
    if (app === undefined || app.status !== "playing") break;
    if (app.aiThinking || app.toMove === app.aiSide) continue;
    if (app.legal.length === 0) break;
    ctx.game.commands.run("place", { index: app.legal[Math.floor(app.legal.length / 2)] });
  }
  settle();
};
