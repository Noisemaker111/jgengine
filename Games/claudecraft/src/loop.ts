import type { GameLoop } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { mobRuntimeOf, onMobDied } from "./game/ai/mobs";
import { startAuctionSweep } from "./game/auction/systems";
import { setupAudioCues } from "./game/audio/setup";
import { onFiestaEntityDied } from "./game/arena/fiesta";
import { buildLootTables } from "./game/content";
import { useHandlers } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { CLASS_ENTITY_ID } from "./game/model";
import { killXp, levelTrack } from "./game/progression/curves";
import { registerCommands } from "./game/session/commands";
import { applySheet, clearAuras, grantTalentPoint, heroOf } from "./game/session/hero";
import { castStore, corpseStore, deadStore, deathStatsStore, restedStore } from "./game/session/stores";
import { QUESTS } from "./game/quests/catalog";
import { setupWorld } from "./game/world/setup";
import { isWorldBoss, onWorldBossKilled } from "./game/world/worldBoss";
import { PLAYER_SPAWN } from "./game/world/zones";

function onPlayerDied(
  ctx: GameContext,
  userId: string,
  position: readonly [number, number, number],
): void {
  const level = ctx.scene.entity.stats.get(userId, "level");
  const xp = ctx.scene.entity.stats.get(userId, "xp");
  deathStatsStore.write(ctx, userId, {
    level: level?.current ?? 1,
    xp: xp?.current ?? 0,
    xpMax: xp?.max ?? 400,
  });
  corpseStore.write(ctx, userId, [position[0], position[2]]);
  deadStore.write(ctx, userId, true);
  const hero = heroOf(ctx, userId);
  if (hero !== null) {
    hero.casting = null;
    hero.autoAttack = false;
  }
  castStore.clear(ctx, userId);
}

function onKill(ctx: GameContext, killerUserId: string, victimInstanceId: string): void {
  const runtime = mobRuntimeOf(ctx, victimInstanceId);
  onMobDied(ctx, victimInstanceId);
  if (runtime === null) return;
  const userId = killerUserId;
  const playerLevel = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const baseAmount = killXp(playerLevel, runtime.level);
  if (baseAmount <= 0) return;
  const pool = restedStore.read(ctx, userId);
  const restedBonus = Math.min(pool, baseAmount);
  if (restedBonus > 0) restedStore.write(ctx, userId, pool - restedBonus);
  const amount = baseAmount + restedBonus;
  levelTrack.grantXp(ctx.scene.entity.stats, userId, amount, (newLevel) => {
    applySheet(ctx, userId, { fill: true });
    grantTalentPoint(ctx, userId, newLevel);
    ctx.game.events.emit("stat.levelUp", { userId, stat: "level", level: newLevel });
  });
  ctx.scene.entity.floatText({
    instanceId: userId,
    text: restedBonus > 0 ? `+${amount} XP (rested)` : `+${amount} XP`,
    kind: "xp",
  });
}

/** Boot + join only — per-frame work lives in `game/systems.ts` via `defineGame({ systems })`. */
export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    ctx.item.use.register(useHandlers);
    ctx.player.loadout.register(loadouts);
    for (const table of buildLootTables()) ctx.game.loot.register(table);
    ctx.game.quest!.register([...QUESTS]);
    ctx.game.quest!.bind("entity.died");
    ctx.game.quest!.bind("inventory.added");
    ctx.game.feed.bind("entity.died");
    ctx.game.feed.bind("loot.granted");
    registerCommands(ctx);
    setupAudioCues(ctx);
    startAuctionSweep(ctx);
    setGamePhase(ctx, "menu");
    ctx.game.events.on("entity.died", (evt) => {
      if (onFiestaEntityDied(ctx, evt)) {
        onMobDied(ctx, evt.instanceId);
        return;
      }
      if ((ctx.game.players?.has(evt.instanceId) ?? false) || evt.instanceId === ctx.player.userId) {
        onPlayerDied(ctx, evt.instanceId, evt.position);
        return;
      }
      clearAuras(ctx, evt.instanceId);
      const wasWorldBoss = isWorldBoss(ctx, evt.instanceId);
      const killerUserId = evt.reason.kind === "player_kill" ? evt.reason.killerUserId : ctx.player.userId;
      if (evt.reason.kind === "player_kill") onKill(ctx, killerUserId, evt.instanceId);
      else onMobDied(ctx, evt.instanceId);
      if (wasWorldBoss) onWorldBossKilled(ctx, evt.instanceId, killerUserId);
    });
    setupWorld(ctx);
  },
  onNewPlayer(ctx, player) {
    const userId = player?.userId ?? ctx.player.userId;
    const [x, z] = PLAYER_SPAWN;
    ctx.scene.entity.spawn(CLASS_ENTITY_ID, {
      id: userId,
      position: [x, ctx.world.groundHeightAt(x, z), z],
    });
  },
};
