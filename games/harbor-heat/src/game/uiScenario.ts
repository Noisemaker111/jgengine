import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { handrollOf } from "./handroll";

const TICK = 1 / 60;

export const uiScenario: UiPreviewScenario = (ctx, playable) => {
  ctx.game.commands.run("game.start", {});
  ctx.camera.setCinematic(null);
  ctx.game.economy.grant(ctx.player.userId, "cash", 1420);
  ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: 72 });
  ctx.scene.entity.stats.set(ctx.player.userId, "armor", { current: 40 });
  handrollOf(ctx).addHeat(ctx, 160);
  for (let i = 0; i < 30; i += 1) playable.loop.onTick(ctx, TICK);
};
