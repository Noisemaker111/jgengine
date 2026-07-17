import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { entityMetaOf } from "@jgengine/core/scene/entityStore";
import { createControlGroupManager, HOME_BOOKMARK, type ControlGroupManager } from "./game/controlGroups";
import { player } from "./game/entities/players/catalog";
import { tickAuthoredTriggers } from "./game/triggers";

type PlayerMeta = { kind: "player" };

function isPlayerMeta(value: unknown): value is PlayerMeta {
  return typeof value === "object" && value !== null && (value as PlayerMeta).kind === "player";
}

let controlGroups: ControlGroupManager | null = null;

function ensureControlGroups(ctx: GameContext): ControlGroupManager {
  if (controlGroups === null) {
    controlGroups = createControlGroupManager({
      entityExists: (id) => ctx.scene.entity.get(id) !== null,
      focus: (id) => ctx.camera.follow(id),
    });
  }
  return controlGroups;
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
  // Seed the showcase's control groups: the player's own avatar sits in group 1
  // and in the non-numbered "home" bookmark, so a recall demonstrates both idioms.
  const groups = ensureControlGroups(ctx);
  groups.selection.replace([ctx.player.userId]);
  groups.bindGroup(1);
  groups.bookmarks.bind(HOME_BOOKMARK, [ctx.player.userId]);
}

function onTick(ctx: GameContext, dt: number): void {
  void dt;
  const entity = ctx.scene.entity.get(ctx.player.userId);
  if (entity === null) return;
  void entityMetaOf(entity, isPlayerMeta);
  const groups = ensureControlGroups(ctx);
  if (ctx.input.justPressed("recallGroup1")) groups.recallGroup(1);
  if (ctx.input.justPressed("recallHome")) groups.recallHome();
  tickAuthoredTriggers(ctx);
}

export const loop = { onInit, onNewPlayer, onTick };
