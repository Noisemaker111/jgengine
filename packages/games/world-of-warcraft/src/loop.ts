import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { distanceBetween } from "@jgengine/core/scene/spatial";
import { itemUseHandlers } from "./items/use-handlers";
import { loadouts } from "./loadouts";
import { lootTables } from "./entities/enemies/loot-tables";
import { enemyById } from "./entities/enemies/catalog";
import { player_default } from "./entities/players/catalog";
import { quests } from "./quests/catalog";
import { applyLevelUps, grantXp } from "./progression/curves";
import { TAB_TARGET_MAX_DISTANCE } from "./combat/constants";
import { tickAbilityCooldowns } from "./combat/abilityCooldowns";
import { tickPendingProjectiles } from "./combat/pendingProjectiles";
import { closePanels, openDialogue, scrollHotbar, togglePanel } from "./ui/uiController";
import { MOB_SPAWNS, TOWN_SPAWN, setupWorld, type MobSpawnPoint } from "./world/setup";

const MOB_RESPAWN_SECONDS = 20;
const PLAYER_RESPAWN_SECONDS = 3;
const HEALTH_REGEN_PER_SECOND = 3;
const MANA_REGEN_PER_SECOND = 5;

const activeMobs = new Map<string, MobSpawnPoint>();
const attackCooldowns = new Map<string, number>();
let mobRespawns: { spawn: MobSpawnPoint; remaining: number }[] = [];
let playerRespawn: { remaining: number; level: number; xp: number; xpMax: number } | null = null;

function yawBetween(from: EntityPosition, to: EntityPosition): number {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

function spawnMob(ctx: GameContext, spawn: MobSpawnPoint): void {
  if (enemyById(spawn.catalogId) === undefined) return;
  const instanceId = ctx.scene.entity.spawn(spawn.catalogId, {
    position: spawn.position,
    role: "npc",
  });
  activeMobs.set(instanceId, spawn);
}

function spawnPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(player_default.id, {
    id: ctx.player.userId,
    position: TOWN_SPAWN,
    role: "player",
  });
}

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.instanceId === ctx.player.userId) {
    const level = ctx.scene.entity.stats.get(ctx.player.userId, "level");
    const xp = ctx.scene.entity.stats.get(ctx.player.userId, "xp");
    playerRespawn = {
      remaining: PLAYER_RESPAWN_SECONDS,
      level: level?.current ?? 1,
      xp: xp?.current ?? 0,
      xpMax: xp?.max ?? 100,
    };
    return;
  }

  const enemy = enemyById(event.catalogId);
  if (enemy === undefined) return;

  const spawn = activeMobs.get(event.instanceId);
  if (spawn !== undefined) {
    activeMobs.delete(event.instanceId);
    attackCooldowns.delete(event.instanceId);
    mobRespawns.push({ spawn, remaining: MOB_RESPAWN_SECONDS });
  }

  if (event.reason.kind === "player_kill" && event.reason.killerUserId === ctx.player.userId) {
    grantXp(ctx, event.reason.killerUserId, enemy.xp);
  }
}

function onInit(ctx: GameContext): void {
  activeMobs.clear();
  attackCooldowns.clear();
  mobRespawns = [];
  playerRespawn = null;

  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);

  ctx.game.quest.register(quests);
  ctx.game.quest.bind("entity.died");

  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("quest.updated");
  ctx.game.feed.bind("loot.granted");
  ctx.game.feed.bind("stat.levelUp");

  ctx.game.commands.define("target.cycle", {
    apply(state: GameContext) {
      state.scene.entity.cycleTarget(state.player.userId, {
        filter: "hostile",
        maxDistance: TAB_TARGET_MAX_DISTANCE,
      });
      return state;
    },
  });
  ctx.game.commands.define("target.clear", {
    apply(state: GameContext) {
      state.scene.entity.setTarget(state.player.userId, null);
      return state;
    },
  });
  ctx.game.commands.define("ui.openBackpack", {
    apply(state: GameContext) {
      togglePanel("backpack");
      return state;
    },
  });
  ctx.game.commands.define("ui.openCharacter", {
    apply(state: GameContext) {
      togglePanel("character");
      return state;
    },
  });
  ctx.game.commands.define("ui.openAbilities", {
    apply(state: GameContext) {
      togglePanel("abilities");
      return state;
    },
  });
  ctx.game.commands.define("ui.closePanels", {
    apply(state: GameContext) {
      closePanels();
      return state;
    },
  });
  ctx.game.commands.define("ui.hotbarScrollNext", {
    apply(state: GameContext) {
      scrollHotbar(1);
      return state;
    },
  });
  ctx.game.commands.define("ui.hotbarScrollPrev", {
    apply(state: GameContext) {
      scrollHotbar(-1);
      return state;
    },
  });
  ctx.game.commands.define<{ questId: string }>("quest.accept", {
    validate: (state, input) => state.game.quest.canAccept(state.player.userId, input.questId),
    apply(state, input) {
      state.game.quest.accept(state.player.userId, input.questId);
      return state;
    },
  });
  ctx.game.commands.define<{ questId: string }>("quest.turnIn", {
    validate: (state, input) => state.game.quest.canTurnIn(state.player.userId, input.questId),
    apply(state, input) {
      state.game.quest.turnIn(state.player.userId, input.questId);
      applyLevelUps(state, state.player.userId);
      return state;
    },
  });
  ctx.game.commands.define<{ id: string }>("dialogue.open", {
    apply(state: GameContext, input) {
      openDialogue(input.id);
      return state;
    },
  });
  ctx.game.commands.define("dialogue.close", {
    apply(state: GameContext) {
      closePanels();
      return state;
    },
  });
  ctx.game.commands.define("npc.marshal.persuadeSuccess", {
    apply(state: GameContext) {
      state.game.economy.grant(state.player.userId, "gold", 15);
      state.game.feed.push("npc.persuade", { data: "The marshal relents — bounty raised. +15 gold." });
      return state;
    },
  });
  ctx.game.commands.define("npc.marshal.persuadeFailure", {
    apply(state: GameContext) {
      state.game.feed.push("npc.persuade", { data: "The marshal is unmoved." });
      return state;
    },
  });

  ctx.game.events.on("entity.died", (event) => onEntityDied(ctx, event));
  ctx.game.events.on("quest.completed", (event) => applyLevelUps(ctx, event.userId));

  setupWorld(ctx);
  for (const spawn of MOB_SPAWNS) spawnMob(ctx, spawn);
}

function onNewPlayer(ctx: GameContext): void {
  spawnPlayer(ctx);
  ctx.player.applyLoadout(ctx.player.userId, "starterKit");
}

function tickRespawns(ctx: GameContext, dt: number): void {
  const due = mobRespawns.filter((entry) => entry.remaining <= dt);
  mobRespawns = mobRespawns.filter((entry) => entry.remaining > dt);
  for (const entry of mobRespawns) entry.remaining -= dt;
  for (const entry of due) spawnMob(ctx, entry.spawn);

  if (playerRespawn !== null) {
    playerRespawn.remaining -= dt;
    if (playerRespawn.remaining <= 0) {
      const saved = playerRespawn;
      playerRespawn = null;
      spawnPlayer(ctx);
      ctx.scene.entity.stats.set(ctx.player.userId, "level", { current: saved.level });
      ctx.scene.entity.stats.set(ctx.player.userId, "xp", { current: saved.xp, max: saved.xpMax });
    }
  }
}

function tickMobs(ctx: GameContext, dt: number): boolean {
  const userId = ctx.player.userId;
  const player = ctx.scene.entity.get(userId);
  if (player === null) return false;

  let playerInCombat = false;
  for (const [mobId, spawn] of activeMobs) {
    const mob = ctx.scene.entity.get(mobId);
    if (mob === null) {
      activeMobs.delete(mobId);
      attackCooldowns.delete(mobId);
      continue;
    }
    const def = enemyById(mob.name);
    if (def === undefined) continue;

    const cooldown = Math.max(0, (attackCooldowns.get(mobId) ?? 0) - dt);
    attackCooldowns.set(mobId, cooldown);

    const distance = ctx.scene.entity.distance(mobId, userId);
    if (distance !== null && distance <= def.aggroRadius) {
      playerInCombat = true;
      if (distance > def.melee.range) {
        const next = ctx.scene.entity.moveToward(mobId, userId, {
          speed: def.walkSpeed,
          stopDistance: def.melee.range,
          dt,
        });
        if (next !== null) {
          ctx.scene.entity.setPose(mobId, { position: next, rotationY: yawBetween(mob.position, player.position) });
        }
      } else if (cooldown === 0 && ctx.scene.entity.canReceive(userId, "damage") === null) {
        ctx.scene.entity.effect({ from: mobId, to: userId, effect: "damage", via: { amount: def.melee.damage } });
        attackCooldowns.set(mobId, def.melee.cooldownSeconds);
      }
    } else if (distanceBetween(mob.position, spawn.position) > def.wanderRadius) {
      const next = ctx.scene.entity.moveToward(mobId, spawn.position, {
        speed: def.walkSpeed,
        stopDistance: 0.5,
        dt,
      });
      if (next !== null) {
        ctx.scene.entity.setPose(mobId, { position: next, rotationY: yawBetween(mob.position, spawn.position) });
      }
    }
  }
  return playerInCombat;
}

function tickRegen(ctx: GameContext, dt: number, inCombat: boolean): void {
  if (inCombat) return;
  const userId = ctx.player.userId;
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null && health.current < health.max) {
    ctx.scene.entity.stats.delta(userId, "health", HEALTH_REGEN_PER_SECOND * dt);
  }
  const mana = ctx.scene.entity.stats.get(userId, "mana");
  if (mana !== null && mana.current < mana.max) {
    ctx.scene.entity.stats.delta(userId, "mana", MANA_REGEN_PER_SECOND * dt);
  }
}

function tickTargetRange(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const targetId = ctx.scene.entity.getTarget(userId);
  if (targetId === null) return;
  const distance = ctx.scene.entity.distance(userId, targetId);
  if (distance === null || distance > TAB_TARGET_MAX_DISTANCE) {
    ctx.scene.entity.setTarget(userId, null);
  }
}

function onTick(ctx: GameContext, dt: number): void {
  tickAbilityCooldowns(dt, performance.now() / 1000);
  tickPendingProjectiles(dt, (shotId) => {
    ctx.scene.entity.settleProjectile(shotId);
  });
  tickRespawns(ctx, dt);
  tickTargetRange(ctx);
  const inCombat = tickMobs(ctx, dt);
  tickRegen(ctx, dt, inCombat);
}

export const loop = { onInit, onNewPlayer, onTick };
