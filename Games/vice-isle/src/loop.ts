import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { registerCommands } from "./game/commands";
import { enemyById } from "./game/entities/enemies/catalog";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { resetHandroll, handroll } from "./game/handroll";
import { itemUseHandlers, resetWeaponState } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { QUESTS } from "./game/quests/catalog";
import { MARCO_POS, PLAYER_SPAWN } from "./game/world/districts";
import { setupWorld } from "./game/world/setup";

const AGGRO_RADIUS = 18;
const GANGER_SHOT_RANGE = 14;

function tickGangers(ctx: GameContext, dt: number): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const now = ctx.time.now();
  for (const entity of ctx.scene.entity.list()) {
    if (!entity.name.startsWith("ganger_")) continue;
    const dist = Math.hypot(entity.position[0] - player.position[0], entity.position[2] - player.position[2]);
    if (dist > AGGRO_RADIUS) continue;
    if (dist > 6) {
      ctx.scene.entity.moveToward(entity.id, player.position, {
        speed: entity.name === "ganger_enforcer" ? 3.8 : 4.4,
        stopDistance: 5,
        dt,
      });
    }
    if (dist < GANGER_SHOT_RANGE && ctx.scene.entity.hasLineOfSight(entity.id, ctx.player.userId)) {
      const meta = (entity.meta ?? {}) as { nextShotAt?: number };
      if ((meta.nextShotAt ?? 0) <= now) {
        ctx.scene.entity.update(entity.id, { meta: { ...meta, nextShotAt: now + 1.4 } });
        ctx.scene.entity.effect({
          from: entity.id,
          to: ctx.player.userId,
          effect: "damage",
          via: { amount: entity.name === "ganger_enforcer" ? 12 : 6 },
        });
      }
    }
  }
}

function tickMissions(ctx: GameContext): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const quests = ctx.game.quest.list(ctx.player.userId);

  const welcome = quests.find((q) => q.questId === "m1_welcome" && q.status === "active");
  if (welcome !== undefined) {
    const dist = Math.hypot(player.position[0] - MARCO_POS[0], player.position[2] - MARCO_POS[2]);
    if (dist < 5) {
      ctx.game.quest.progress(ctx.player.userId, "m1_welcome", "meet_marco", 1);
      ctx.game.quest.turnIn(ctx.player.userId, "m1_welcome");
      ctx.game.store.set("vice.dialogue", "dlg_marco");
    }
  }

  const shake = quests.find((q) => q.questId === "m4_shake_the_heat" && q.status === "active");
  if (shake !== undefined) {
    const wanted = handroll.wanted();
    if (wanted.peakStars >= 3 && wanted.stars === 0) {
      ctx.game.quest.progress(ctx.player.userId, "m4_shake_the_heat", "lose_wanted", 1);
      ctx.game.quest.turnIn(ctx.player.userId, "m4_shake_the_heat");
      ctx.game.feed.push("vice.log", { text: "You shook the heat. Vice Isle is yours." });
    }
  }

  for (const quest of quests) {
    if (quest.status !== "active") continue;
    if (quest.questId === "m2_dock_sweep" || quest.questId === "m3_the_ledger") {
      if (ctx.game.quest.canTurnIn(ctx.player.userId, quest.questId) === null) {
        ctx.game.quest.turnIn(ctx.player.userId, quest.questId);
      }
    }
  }
}

function onInit(ctx: GameContext): void {
  resetHandroll();
  resetWeaponState();
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.quest.register(QUESTS);
  ctx.game.quest.bind("entity.died");
  ctx.game.quest.bind("inventory.added");
  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("entity.died", (event) => {
    const dead = event as { instanceId?: string; catalogId?: string };
    const catalogId = dead.catalogId ?? "";
    const enemy = enemyById(catalogId);
    if (enemy !== undefined && enemy.bounty > 0) {
      ctx.game.economy.grant(ctx.player.userId, "cash", enemy.bounty);
    }
    if (catalogId.startsWith("ped_")) handroll.addHeat(ctx, 60);
    if (catalogId.startsWith("cop_")) handroll.addHeat(ctx, 110);
  });

  registerCommands(ctx);
  setupWorld(ctx);
}

function onNewPlayer(ctx: GameContext): void {
  const y = ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
  ctx.scene.entity.spawn("street_runner", {
    id: ctx.player.userId,
    position: [PLAYER_SPAWN[0], y, PLAYER_SPAWN[2]],
    role: "player",
  });
  if (ctx.player.isNew) {
    ctx.player.applyLoadout(ctx.player.userId, "starterKit");
    ctx.game.quest.grant(ctx.player.userId, "m1_welcome");
  }
}

function onTick(ctx: GameContext, dt: number): void {
  handroll.tick(ctx, dt);
  tickGangers(ctx, dt);
  tickMissions(ctx);

  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (health !== null && health.current <= 0) {
    handroll.exitVehicle(ctx);
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: health.max });
    ctx.scene.entity.stats.set(ctx.player.userId, "armor", { current: 0 });
    const y = ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
    ctx.scene.entity.setPose(ctx.player.userId, { position: [PLAYER_SPAWN[0], y, PLAYER_SPAWN[2]] });
    ctx.game.economy.charge(ctx.player.userId, "cash", Math.min(200, ctx.game.economy.balance(ctx.player.userId, "cash")));
    handroll.clearWanted(ctx);
    ctx.game.feed.push("vice.log", { text: "Wasted. The clinic took its cut." });
  }
}

export const loop = { onInit, onNewPlayer, onTick };
