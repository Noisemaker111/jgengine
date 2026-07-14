import type { GameLoop } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { mobRuntimeOf, onMobDied, tickMobs } from "./game/ai/mobs";
import { setupAudioCues, tickMusic } from "./game/audio/setup";
import { onFiestaEntityDied, tickFiesta } from "./game/arena/fiesta";
import { tickAuras, tickHero } from "./game/combat/engine";
import { buildLootTables } from "./game/content";
import { tickDelve } from "./game/delves/systems";
import { useHandlers } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { tickMail } from "./game/mail/systems";
import { tickValeCup } from "./game/minigames/valeCup";
import { tickProtectYumi } from "./game/minigames/yumi";
import { CLASS_ENTITY_ID } from "./game/model";
import { tickPets } from "./game/pets/systems";
import { killXp, levelTrack } from "./game/progression/curves";
import { registerCommands } from "./game/session/commands";
import { applySheet, clearAuras, grantTalentPoint, heroOf, storeKeys } from "./game/session/hero";
import { QUESTS } from "./game/quests/catalog";
import { setupWorld } from "./game/world/setup";
import { isWorldBoss, onWorldBossKilled, tickWorldBoss } from "./game/world/worldBoss";
import { PLAYER_SPAWN } from "./game/world/zones";
import { resolvePlayerMovementTuning, stepPlayerMovement } from "@jgengine/core/movement/playerMovement";
import { physics, world } from "./world";

const movementTuning = resolvePlayerMovementTuning({ physics, world });
const EMPTY_INPUT = { held: [] as readonly string[], pointer: null };

function tickPlayerSystems(ctx: GameContext, userId: string, dt: number): void {
  tickHero(ctx, userId, dt);
  tickPets(ctx, userId, dt);
  tickDelve(ctx, userId, dt);
  tickMail(ctx, userId);
  tickValeCup(ctx, userId, dt);
  tickProtectYumi(ctx, userId, dt);
  tickFiesta(ctx, userId, dt);
  tickMusic(ctx, userId);
}

function onPlayerDied(
  ctx: GameContext,
  userId: string,
  position: readonly [number, number, number],
): void {
  const level = ctx.scene.entity.stats.get(userId, "level");
  const xp = ctx.scene.entity.stats.get(userId, "xp");
  ctx.game.store.set(`deathstats:${userId}`, {
    level: level?.current ?? 1,
    xp: xp?.current ?? 0,
    xpMax: xp?.max ?? 400,
  });
  ctx.game.store.set(`corpse:${userId}`, [position[0], position[2]] as const);
  ctx.game.store.set(storeKeys.dead(userId), true);
  const hero = heroOf(ctx, userId);
  if (hero !== null) {
    hero.casting = null;
    hero.autoAttack = false;
  }
  ctx.game.store.delete(storeKeys.cast(userId));
}

function onKill(ctx: GameContext, killerUserId: string, victimInstanceId: string): void {
  const runtime = mobRuntimeOf(ctx, victimInstanceId);
  onMobDied(ctx, victimInstanceId);
  if (runtime === null) return;
  const userId = killerUserId;
  const playerLevel = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const baseAmount = killXp(playerLevel, runtime.level);
  if (baseAmount <= 0) return;
  const pool = (ctx.game.store.get(storeKeys.rested(userId)) as number | undefined) ?? 0;
  const restedBonus = Math.min(pool, baseAmount);
  if (restedBonus > 0) ctx.game.store.set(storeKeys.rested(userId), pool - restedBonus);
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
  onTick(ctx, dt) {
    const clamped = Math.min(dt, 0.25);
    tickWorldBoss(ctx);
    tickMobs(ctx, clamped);
    tickAuras(ctx);
    const members = ctx.game.players?.list() ?? [];
    if (members.length === 0) {
      tickPlayerSystems(ctx, ctx.player.userId, clamped);
      return;
    }
    for (const member of members) {
      stepPlayerMovement(ctx, member.userId, member.input ?? EMPTY_INPUT, dt, movementTuning);
      tickPlayerSystems(ctx, member.userId, clamped);
    }
  },
};
