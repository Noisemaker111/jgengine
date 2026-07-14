import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { isMobInstance } from "./ai/mobs";

export const uiScenario: UiPreviewScenario = (ctx, playable) => {
  const userId = ctx.player.userId;
  ctx.game.commands.run("class.select", { classId: "warrior" });
  ctx.game.quest!.accept(userId, "q_wolves");
  const wolf = ctx.scene.entity.list().find((entity) => entity.name === "forest_wolf" && isMobInstance(ctx, entity.id));
  if (wolf !== undefined) {
    ctx.scene.entity.setPose(userId, {
      position: [wolf.position[0] + 2, wolf.position[1], wolf.position[2]],
    });
    ctx.scene.entity.setTarget(userId, wolf.id);
    ctx.game.commands.run("attack", {});
    for (let index = 0; index < 240; index += 1) {
      ctx.time.advance(1 / 60);
      playable.loop.onTick(ctx, 1 / 60);
    }
  }
};
