import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { getMatch } from "./match/store";

export const uiScenario: UiPreviewScenario = (ctx, playable) => {
  ctx.game.commands.run("setMode", { mode: "ai-hard" });
  const m = getMatch(ctx);
  m.scoreL = 8;
  m.scoreR = 7;
  m.volley = 6;
  m.phase = "rally";
  m.ball = { x: 118, y: 44, vx: 96, vy: -58 };
  m.ballSpeed = 118;
  m.left.y = 52;
  m.right.y = 40;
  m.matchPointL = false;
  m.matchPointR = false;
  for (let i = 0; i < 12; i += 1) {
    ctx.time.advance(1 / 60);
    playable.loop.onTick(ctx, 1 / 60);
  }
};
