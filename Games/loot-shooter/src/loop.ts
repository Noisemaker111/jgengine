import { setPlayControlsActive } from "@jgengine/core/game/controlGate";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { SOUND_IDS } from "./game/audio/catalog";
import { registerCommands } from "./game/commands";
import { tickEnemies } from "./game/entities/enemies/ai";
import { enemyById } from "./game/entities/enemies/catalog";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { player } from "./game/entities/players/catalog";
import { itemUseHandlers } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { grantXp } from "./game/progression/curves";
import { challenges } from "./game/quests/catalog";
import { session } from "./game/run/session";
import { recordsStore } from "./game/run/stores";
import { PLAYER_SPAWN, setupWorld } from "./game/world/setup";

const LEVEL_HEALTH_BONUS = 6;
const LEVEL_HEAL = 25;

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.instanceId === ctx.player.userId) {
    session.noteDefeat(ctx);
    return;
  }
  const enemy = enemyById(event.catalogId);
  if (enemy === undefined) return;
  session.noteKill(ctx, event.catalogId);
  if (event.reason.kind === "player_kill" && event.reason.killerUserId === ctx.player.userId) {
    ctx.game.events.emit("audio.play", { sound: SOUND_IDS.killConfirm });
    grantXp(ctx, event.reason.killerUserId, enemy.xp);
  }
}

function onLevelUp(ctx: GameContext, userId: string, levelsGained: number): void {
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health === null) return;
  ctx.scene.entity.stats.set(userId, "health", {
    max: health.max + LEVEL_HEALTH_BONUS * levelsGained,
  });
  ctx.scene.entity.stats.delta(userId, "health", LEVEL_HEAL);
}

function onInit(ctx: GameContext): void {
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.quest.register(challenges);
  ctx.game.quest.bind("entity.died");
  registerCommands(ctx);

  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("quest.completed", (event) => {
    ctx.game.quest.turnIn(event.userId, event.questId);
    ctx.game.events.emit("audio.play", { sound: SOUND_IDS.levelUp });
    const reward = challenges.find((challenge) => challenge.id === event.questId)?.rewards?.economy?.scrap;
    ctx.scene.entity.floatText({
      instanceId: event.userId,
      text: reward === undefined ? "CHALLENGE COMPLETE" : `CHALLENGE +${reward} SCRAP`,
      kind: "pickup",
    });
  });

  ctx.game.events.on("entity.died", (event) => onEntityDied(ctx, event));
  ctx.game.events.on("stat.levelUp", (event) => {
    if (event.stat === "level") {
      onLevelUp(ctx, event.userId, 1);
      ctx.game.events.emit("audio.play", { sound: SOUND_IDS.levelUp });
    }
  });

  setupWorld(ctx);
  recordsStore.write(ctx, { ...session.records().best() });
  setPlayControlsActive(ctx, false);
  setGamePhase(ctx, "menu");
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(player.id, {
    id: ctx.player.userId,
    position: PLAYER_SPAWN,
    role: "player",
  });
  if (ctx.player.isNew) ctx.player.applyLoadout(ctx.player.userId, "starterKit");
}

function onTick(ctx: GameContext, dt: number): void {
  session.tick(ctx, dt);
  if (session.status() === "wave") tickEnemies(ctx, dt);
}

export const loop = { onInit, onNewPlayer, onTick };
