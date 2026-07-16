import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { entityMetaOf } from "@jgengine/core/scene/entityStore";
import { player } from "./game/entities/players/catalog";

type PlayerMeta = { kind: "player" };

function isPlayerMeta(value: unknown): value is PlayerMeta {
  return typeof value === "object" && value !== null && (value as PlayerMeta).kind === "player";
}

function onInit(ctx: GameContext): void {
  void ctx;
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(player.id, {
    id: ctx.player.userId,
    position: [0, 0, 0],
    role: "player",
    meta: { kind: "player" } satisfies PlayerMeta,
  });
}

function onTick(ctx: GameContext, dt: number): void {
  void dt;
  const entity = ctx.scene.entity.get(ctx.player.userId);
  if (entity === null) return;
  // Typed meta narrow — no `as PlayerMeta` cast (CRITIQUE-ACTIONS T1).
  void entityMetaOf(entity, isPlayerMeta);
}

export const loop = { onInit, onNewPlayer, onTick };
