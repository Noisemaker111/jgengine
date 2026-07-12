import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMMO_STAT_IDS, type AmmoPool } from "./ammo";
import { gearById, AMMO_PRICES } from "./items/gear/catalog";
import { gunById, rollGun, startReload, ffylPhase } from "./handroll";
import { skillByIdOrNull } from "./progression/curves";
import { session } from "./session";

const PICKUP_RADIUS = 2.8;
const chestRng = seededRng("bl2-red-chests");

interface AimPayload {
  aim?: { yaw: number; pitch: number };
}

export function selectedGunId(ctx: GameContext): string | null {
  const slots = ctx.player.inventory.state("hotbar").slots;
  const stack = slots[session.selectedSlot()];
  return stack?.itemId ?? null;
}

function playerLevel(ctx: GameContext): number {
  return ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1;
}

function pickupWorldItem(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const playerEntity = ctx.scene.entity.get(userId);
  if (playerEntity === null) return;
  const nearestId = ctx.scene.worldItem.nearestInRadius(playerEntity.position, PICKUP_RADIUS);
  if (nearestId === null) return;
  const record = ctx.scene.worldItem.get(nearestId);
  if (record === null) return;

  const gun = gunById(record.itemId);
  if (gun !== undefined) {
    const slot = session.selectedSlot();
    const slots = ctx.player.inventory.state("hotbar").slots;
    const current = slots[slot] ?? null;
    ctx.scene.worldItem.consume(record.instanceId);
    if (current !== null) {
      ctx.player.inventory.take("hotbar", current.itemId, current.count);
      const held = gunById(current.itemId);
      ctx.scene.worldItem.spawn({
        itemId: current.itemId,
        position: [playerEntity.position[0], playerEntity.position[1], playerEntity.position[2]],
        rarity: held?.rarity,
        baseType: held?.family,
        source: "swap",
      });
    }
    ctx.player.inventory.put("hotbar", gun.id, 1, { slot });
    ctx.game.store.set("lastPickup", { gunId: gun.id, atMs: ctx.time.now() * 1000 });
    ctx.scene.entity.floatText({ instanceId: userId, text: gun.name.toUpperCase(), kind: "pickup" });
    ctx.game.feed.push("loot.pickup", { itemId: gun.id, rarity: gun.rarity });
    return;
  }

  const gear = gearById(record.itemId);
  if (gear === undefined) return;
  if (gear.kind === "ammo" && gear.ammo !== undefined && gear.ammoAmount !== undefined) {
    const statId = AMMO_STAT_IDS[gear.ammo];
    const pool = ctx.scene.entity.stats.get(userId, statId);
    if (pool !== null && pool.current >= pool.max) {
      ctx.scene.entity.floatText({ instanceId: userId, text: "AMMO FULL", kind: "warn" });
      return;
    }
    ctx.scene.worldItem.consume(record.instanceId);
    ctx.scene.entity.stats.delta(userId, statId, gear.ammoAmount * record.count);
    ctx.scene.entity.floatText({ instanceId: userId, text: `+${gear.ammoAmount * record.count} ${gear.name.toUpperCase()}`, kind: "pickup" });
    return;
  }
  const result = ctx.player.inventory.put("backpack", gear.id, record.count);
  if (result.status !== "ok") {
    ctx.scene.entity.floatText({ instanceId: userId, text: "PACK FULL", kind: "warn" });
    return;
  }
  ctx.scene.worldItem.consume(record.instanceId);
  ctx.scene.entity.floatText({ instanceId: userId, text: gear.name.toUpperCase(), kind: "pickup" });
}

function openRedChest(ctx: GameContext, instanceId: string): void {
  const opened = (ctx.game.store.get("openedChests") as readonly string[] | undefined) ?? [];
  if (opened.includes(instanceId)) {
    ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "CHEST EMPTY", kind: "warn" });
    return;
  }
  ctx.game.store.set("openedChests", [...opened, instanceId]);
  const object = ctx.scene.object.get(instanceId);
  const at = object?.position ?? ctx.scene.entity.get(ctx.player.userId)?.position ?? [0, 0, 0];
  for (let roll = 0; roll < 2; roll += 1) {
    const gun = rollGun(chestRng, playerLevel(ctx), { luck: 4 });
    ctx.scene.worldItem.spawn({
      itemId: gun.id,
      position: [at[0] + 0.8 + roll * 0.8, at[1], at[2] + 0.9],
      rarity: gun.rarity,
      baseType: gun.family,
      source: "chest",
    });
  }
}

function openAmmoChest(ctx: GameContext, instanceId: string): void {
  const object = ctx.scene.object.get(instanceId);
  const at = object?.position ?? [0, 0, 0];
  const pools: readonly AmmoPool[] = ["pistol", "smg", "shotgun", "rifle"];
  for (let index = 0; index < 2; index += 1) {
    const pool = pools[Math.floor(chestRng() * pools.length)]!;
    ctx.scene.worldItem.spawn({
      itemId: `ammo_${pool}_pack`,
      position: [at[0] + 0.6 + index * 0.7, at[1], at[2] + 0.8],
      source: "chest",
    });
  }
  ctx.scene.entity.stats.delta(ctx.player.userId, "grenades", 1);
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "+1 GRENADE", kind: "pickup" });
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define<AimPayload>("fire", {
    apply(state: GameContext, input) {
      if (ffylPhase() === "dead") return;
      const itemId = selectedGunId(state);
      if (itemId === null) return;
      state.item.use.use({ from: state.player.userId, itemId, inventoryId: "hotbar", aim: input.aim });
    },
  });

  ctx.game.commands.define("reload", {
    apply(state: GameContext) {
      const itemId = selectedGunId(state);
      if (itemId === null) return;
      const gun = gunById(itemId);
      if (gun === undefined) return;
      startReload(state, gun, state.time.now() * 1000);
    },
  });

  for (const slot of [0, 1, 2, 3]) {
    ctx.game.commands.define(`selectSlot${slot + 1}`, {
      apply(state: GameContext) {
        session.selectSlot(state, slot);
      },
    });
  }

  ctx.game.commands.define<AimPayload>("throwGrenade", {
    apply(state: GameContext, input) {
      state.item.use.use({ from: state.player.userId, itemId: "frag_grenade", inventoryId: "backpack", aim: input.aim });
    },
  });

  ctx.game.commands.define("useHealthVial", {
    apply(state: GameContext) {
      const itemId =
        state.player.inventory.count("backpack", "insta_health_big") > 0 ? "insta_health_big" : "insta_health";
      state.item.use.use({ from: state.player.userId, itemId, inventoryId: "backpack" });
    },
  });

  ctx.game.commands.define("pickup", {
    apply(state: GameContext) {
      pickupWorldItem(state);
    },
  });

  ctx.game.commands.define<{ instanceId?: string }>("chest.openRed", {
    apply(state: GameContext, input) {
      if (input.instanceId !== undefined) openRedChest(state, input.instanceId);
    },
  });

  ctx.game.commands.define<{ instanceId?: string }>("chest.openAmmo", {
    apply(state: GameContext, input) {
      if (input.instanceId !== undefined) openAmmoChest(state, input.instanceId);
    },
  });

  ctx.game.commands.define<{ vendor?: string }>("vendor.open", {
    apply(state: GameContext, input) {
      if (input.vendor !== undefined) state.game.store.set("vendorOpen", input.vendor);
    },
  });

  ctx.game.commands.define("vendor.close", {
    apply(state: GameContext) {
      state.game.store.delete("vendorOpen");
    },
  });

  ctx.game.commands.define<{ itemId?: string }>("vendor.buyGear", {
    apply(state: GameContext, input) {
      if (input.itemId === undefined) return;
      const rejection = state.game.trade.buy(input.itemId, 1, { shop: "shop_pandora", inventoryId: "backpack" });
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "NOT ENOUGH CASH", kind: "warn" });
      }
    },
  });

  ctx.game.commands.define<{ pool?: AmmoPool }>("vendor.buyAmmo", {
    apply(state: GameContext, input) {
      if (input.pool === undefined) return;
      const price = AMMO_PRICES[input.pool];
      const userId = state.player.userId;
      const statId = AMMO_STAT_IDS[input.pool];
      const stat = state.scene.entity.stats.get(userId, statId);
      if (stat !== null && stat.current >= stat.max) {
        state.scene.entity.floatText({ instanceId: userId, text: "AMMO FULL", kind: "warn" });
        return;
      }
      const rejection = state.game.economy.charge(userId, "cash", price.cash);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: userId, text: "NOT ENOUGH CASH", kind: "warn" });
        return;
      }
      state.scene.entity.stats.delta(userId, statId, price.amount);
    },
  });

  ctx.game.commands.define<{ vendor?: string }>("vendor.gunOfTheDay", {
    apply(state: GameContext, input) {
      const userId = state.player.userId;
      const rejection = state.game.economy.charge(userId, "cash", 300);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: userId, text: "NOT ENOUGH CASH", kind: "warn" });
        return;
      }
      const gun = rollGun(chestRng, playerLevel(state), { luck: 6 });
      const playerEntity = state.scene.entity.get(userId);
      const at = playerEntity?.position ?? [0, 0, 0];
      state.scene.worldItem.spawn({
        itemId: gun.id,
        position: [at[0] + 1.2, at[1], at[2] + 1.2],
        rarity: gun.rarity,
        baseType: gun.family,
        source: input.vendor ?? "vendor",
      });
    },
  });

  ctx.game.commands.define("ui.openSkills", {
    apply(state: GameContext) {
      const open = state.game.store.get("skillsOpen") === true;
      if (open) state.game.store.delete("skillsOpen");
      else state.game.store.set("skillsOpen", true);
    },
  });

  ctx.game.commands.define<{ skill?: string }>("skill.spend", {
    apply(state: GameContext, input) {
      const skill = skillByIdOrNull(input.skill ?? "");
      if (skill === null) return;
      const userId = state.player.userId;
      const points = state.scene.entity.stats.get(userId, "skillPoints");
      const rank = state.scene.entity.stats.get(userId, skill.statId);
      if (points === null || rank === null || points.current < 1 || rank.current >= rank.max) return;
      state.scene.entity.stats.delta(userId, "skillPoints", -1);
      state.scene.entity.stats.delta(userId, skill.statId, 1);
      if (skill.id === "brawn") {
        const health = state.scene.entity.stats.get(userId, "health");
        if (health !== null) {
          const bonus = Math.round(health.max * 0.08);
          state.scene.entity.stats.set(userId, "health", { max: health.max + bonus });
          state.scene.entity.stats.delta(userId, "health", bonus);
        }
      }
    },
  });
}
