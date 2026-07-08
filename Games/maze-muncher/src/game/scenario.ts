import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { SCORE } from "./catalog";
import { onTick } from "../loop";
import { cellToWorld, powerCells } from "./maze";

export const mazeMuncherScenario: UiPreviewScenario = (ctx: GameContext) => {
  const step = 1 / 60;
  for (let index = 0; index < 90; index += 1) onTick(ctx, step);
  const power = powerCells[0]!;
  const world = cellToWorld(power.c, power.r);
  ctx.scene.entity.setPose(ctx.player.userId, { position: world });
  for (let index = 0; index < 45; index += 1) onTick(ctx, step);
  ctx.scene.entity.stats.delta(ctx.player.userId, SCORE, 1240);
};
