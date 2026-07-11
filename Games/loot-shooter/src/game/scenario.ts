import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { session } from "./run/session";

const TICK = 1 / 60;

export const lootShooterUiScenario: UiPreviewScenario = (ctx, playable) => {
  ctx.game.commands.run("run.start", {});
  for (let i = 0; i < Math.round(3.5 / TICK); i += 1) playable.loop.onTick(ctx, TICK);

  const userId = ctx.player.userId;
  ctx.player.inventory.put("hotbar", "rifle_rare", 1, { slot: 1 });
  ctx.player.inventory.put("hotbar", "shotgun_epic", 1, { slot: 2 });
  ctx.game.commands.run("selectSlot2", {});
  ctx.scene.entity.stats.set(userId, "health", { current: 58 });
  ctx.game.economy.grant(userId, "scrap", 132);

  for (const kill of ["drone_grunt", "skitter_grunt", "spitter_grunt"]) {
    session.noteKill(ctx, kill);
    ctx.game.feed.push("entity.died", { catalogId: kill });
  }

  const playerEntity = ctx.scene.entity.get(userId);
  const base = playerEntity?.position ?? [0, 0, 0];
  ctx.scene.worldItem.spawn({
    itemId: "railgun_legendary",
    position: [base[0] + 1.4, 0, base[2] + 1.6],
    rarity: "legendary",
    baseType: "railgun",
  });

  ctx.game.commands.run("fire", { aim: { yaw: 0, pitch: 0 } });
  for (let i = 0; i < 12; i += 1) playable.loop.onTick(ctx, TICK);
};
