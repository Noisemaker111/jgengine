import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";

import { registerBuildCommands } from "../build/commands";
import { BASE_CATALOG_ID, BASE_ENTITY_ID, GOLD_CURRENCY, STARTING_GOLD } from "../entities/base/catalog";
import { creepDef, CREEP_CATALOG } from "../entities/enemies/catalog";
import { resetSession, session } from "../session";
import { KEEP_POINT } from "./path";

function handleEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.catalogId === BASE_CATALOG_ID) {
    session.gameOver = true;
    return;
  }
  if (event.catalogId in CREEP_CATALOG) {
    session.creeps.delete(event.instanceId);
    const beneficiary = event.reason.kind === "player_kill" ? event.reason.killerUserId : ctx.player.userId;
    ctx.game.economy.grant(beneficiary, GOLD_CURRENCY, creepDef(event.catalogId).bounty);
  }
}

export function setupWorld(ctx: GameContext): void {
  resetSession();
  ctx.game.economy.grant(ctx.player.userId, GOLD_CURRENCY, STARTING_GOLD);
  ctx.scene.entity.spawn(BASE_CATALOG_ID, { id: BASE_ENTITY_ID, position: KEEP_POINT, role: "prop" });
  registerBuildCommands(ctx);
  ctx.game.events.on("entity.died", (event) => handleEntityDied(ctx, event));
}

export function heartbeat(ctx: GameContext): void {
  const base = ctx.scene.entity.get(BASE_ENTITY_ID);
  if (base !== null) ctx.scene.entity.setPose(BASE_ENTITY_ID, { position: base.position });
}
