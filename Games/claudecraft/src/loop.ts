import type { GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { mobRuntimeOf, onMobDied, tickMobs } from "./game/ai/mobs";
import { tickAuras, tickHero } from "./game/combat/engine";
import { buildLootTables } from "./game/content";
import { useHandlers } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { CLASS_ENTITY_ID } from "./game/model";
import { killXp, levelTrack } from "./game/progression/curves";
import { registerCommands } from "./game/session/commands";
import { applySheet, clearAuras, heroOf, storeKeys } from "./game/session/hero";
import { QUESTS } from "./game/quests/catalog";
import { setupWorld } from "./game/world/setup";
import { PLAYER_SPAWN } from "./game/world/zones";

function onPlayerDied(ctx: GameContext, position: readonly [number, number, number]): void {
  const userId = ctx.player.userId;
  const level = ctx.scene.entity.stats.get(userId, "level");
  const xp = ctx.scene.entity.stats.get(userId, "xp");
  ctx.game.store.set(`deathstats:${userId}`, {
    level: level?.current ?? 1,
    xp: xp?.current ?? 0,
    xpMax: xp?.max ?? 400,
  });
  ctx.game.store.set(`corpse:${userId}`, [position[0], position[2]] as const);
  ctx.game.store.set(storeKeys.dead(userId), true);
  const hero = heroOf(userId);
  if (hero !== null) {
    hero.casting = null;
    hero.autoAttack = false;
  }
  ctx.game.store.delete(storeKeys.cast(userId));
}

function onKill(ctx: GameContext, victimInstanceId: string): void {
  const runtime = mobRuntimeOf(victimInstanceId);
  onMobDied(ctx, victimInstanceId);
  if (runtime === null) return;
  const userId = ctx.player.userId;
  const playerLevel = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const amount = killXp(playerLevel, runtime.level);
  if (amount <= 0) return;
  levelTrack.grantXp(ctx.scene.entity.stats, userId, amount, (newLevel) => {
    applySheet(ctx, userId, { fill: true });
    ctx.game.events.emit("stat.levelUp", { userId, stat: "level", level: newLevel });
  });
  ctx.scene.entity.floatText({ instanceId: userId, text: `+${amount} XP`, kind: "xp" });
}

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    ctx.item.use.register(useHandlers);
    ctx.player.loadout.register(loadouts);
    for (const table of buildLootTables()) ctx.game.loot.register(table);
    ctx.game.quest.register([...QUESTS]);
    ctx.game.quest.bind("entity.died");
    ctx.game.quest.bind("inventory.added");
    ctx.game.feed.bind("entity.died");
    ctx.game.feed.bind("loot.granted");
    registerCommands(ctx);
    ctx.game.events.on("entity.died", (evt) => {
      if (evt.instanceId === ctx.player.userId) {
        onPlayerDied(ctx, evt.position);
        return;
      }
      clearAuras(ctx, evt.instanceId);
      if (evt.reason.kind === "player_kill") onKill(ctx, evt.instanceId);
      else onMobDied(ctx, evt.instanceId);
    });
    setupWorld(ctx);
  },
  onNewPlayer(ctx) {
    const [x, z] = PLAYER_SPAWN;
    ctx.scene.entity.spawn(CLASS_ENTITY_ID, {
      id: ctx.player.userId,
      position: [x, ctx.world.groundHeightAt(x, z), z],
    });
  },
  onTick(ctx, dt) {
    const clamped = Math.min(dt, 0.25);
    tickHero(ctx, ctx.player.userId, clamped);
    tickMobs(ctx, clamped);
    tickAuras(ctx);
  },
};
