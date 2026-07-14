import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMMO_LABELS, AMMO_STAT_IDS } from "./ammo";
import { SOUND_IDS } from "./audio/catalog";
import { gearById } from "./items/gear/catalog";
import { weaponById, type AmmoPool } from "./items/weapons/catalog";
import { AMMO_PRICES, MYSTERY_CRATE, SHOP_ID, stationById } from "./objects/stations";
import { CHALLENGE_IDS } from "./quests/catalog";
import { session } from "./run/session";

const PICKUP_RADIUS = 2.6;

interface AimPayload {
  aim?: { yaw: number; pitch: number };
}

function selectedWeaponId(ctx: GameContext): string | null {
  const slots = ctx.player.inventory.state("hotbar").slots;
  const stack = slots[session.selectedSlot()];
  return stack?.itemId ?? null;
}

function pickupWorldItem(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const playerEntity = ctx.scene.entity.get(userId);
  if (playerEntity === null) return;
  const nearestId = ctx.scene.worldItem.nearestInRadius(playerEntity.position, PICKUP_RADIUS);
  if (nearestId === null) return;
  const record = ctx.scene.worldItem.get(nearestId);
  if (record === null) return;

  const weapon = weaponById(record.itemId);
  if (weapon !== undefined) {
    const slot = session.selectedSlot();
    const slots = ctx.player.inventory.state("hotbar").slots;
    const current = slots[slot] ?? null;
    ctx.scene.worldItem.consume(record.instanceId);
    if (current !== null) {
      ctx.player.inventory.take("hotbar", current.itemId, current.count);
      const held = weaponById(current.itemId);
      ctx.scene.worldItem.spawn({
        itemId: current.itemId,
        position: [playerEntity.position[0], playerEntity.position[1], playerEntity.position[2]],
        rarity: held?.rarity,
        baseType: held?.family,
        source: "swap",
      });
    }
    ctx.player.inventory.put("hotbar", weapon.id, 1, { slot });
    ctx.game.events.emit("audio.play", { sound: SOUND_IDS.pickupWeapon });
    ctx.scene.entity.floatText({ instanceId: userId, text: weapon.name.toUpperCase(), kind: "pickup" });
    ctx.game.feed.push("loot.pickup", { itemId: weapon.id, rarity: weapon.rarity });
    if (weapon.rarity === "legendary") {
      ctx.game.quest!.progress(userId, CHALLENGE_IDS.legendaryFind, "pickup", 1);
    }
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
    ctx.game.events.emit("audio.play", { sound: SOUND_IDS.pickupGear });
    ctx.scene.entity.floatText({
      instanceId: userId,
      text: `+${gear.ammoAmount * record.count} ${AMMO_LABELS[gear.ammo].toUpperCase()}`,
      kind: "pickup",
    });
    return;
  }
  const result = ctx.player.inventory.put("backpack", gear.id, record.count);
  if (result.status !== "ok") {
    ctx.scene.entity.floatText({ instanceId: userId, text: "PACK FULL", kind: "warn" });
    return;
  }
  ctx.scene.worldItem.consume(record.instanceId);
  ctx.game.events.emit("audio.play", { sound: SOUND_IDS.pickupGear });
  ctx.scene.entity.floatText({ instanceId: userId, text: gear.name.toUpperCase(), kind: "pickup" });
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define("run.start", {
    apply(state: GameContext) {
      session.start(state);
    },
  });

  ctx.game.commands.define<AimPayload>("fire", {
    apply(state: GameContext, input) {
      if (session.status() !== "wave" && session.status() !== "intermission") return;
      const itemId = selectedWeaponId(state);
      if (itemId === null) return;
      state.item.use.use({
        from: state.player.userId,
        itemId,
        inventoryId: "hotbar",
        aim: input.aim,
      });
    },
  });

  for (const slot of [0, 1, 2]) {
    ctx.game.commands.define(`selectSlot${slot + 1}`, {
      apply(state: GameContext) {
        session.selectSlot(state, slot);
      },
    });
  }

  ctx.game.commands.define<AimPayload>("throwGrenade", {
    apply(state: GameContext, input) {
      if (session.status() !== "wave" && session.status() !== "intermission") return;
      state.item.use.use({
        from: state.player.userId,
        itemId: "frag_grenade",
        inventoryId: "backpack",
        aim: input.aim,
      });
    },
  });

  ctx.game.commands.define("useMedkit", {
    apply(state: GameContext) {
      const backpack = state.player.inventory;
      const itemId =
        backpack.count("backpack", "medkit_small") > 0
          ? "medkit_small"
          : backpack.count("backpack", "medkit_large") > 0
            ? "medkit_large"
            : "medkit_small";
      state.item.use.use({ from: state.player.userId, itemId, inventoryId: "backpack" });
    },
  });

  ctx.game.commands.define("pickup", {
    apply(state: GameContext) {
      pickupWorldItem(state);
    },
  });

  ctx.game.commands.define("run.endless", {
    apply(state: GameContext) {
      session.enterEndless(state);
    },
  });

  ctx.game.commands.define<{ station?: string }>("shop.open", {
    apply(state: GameContext, input) {
      if (input.station === undefined || stationById(input.station) === undefined) return;
      state.game.store.set("shopOpen", input.station);
    },
  });

  ctx.game.commands.define("shop.close", {
    apply(state: GameContext) {
      state.game.store.delete("shopOpen");
    },
  });

  ctx.game.commands.define<{ itemId?: string }>("shop.buyGear", {
    apply(state: GameContext, input) {
      if (input.itemId === undefined) return;
      const userId = state.player.userId;
      const rejection = state.game.trade!.buy(input.itemId, 1, { shop: SHOP_ID, inventoryId: "backpack" });
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: userId, text: "NOT ENOUGH SCRAP", kind: "warn" });
        return;
      }
      state.game.events.emit("audio.play", { sound: SOUND_IDS.pickupGear });
    },
  });

  ctx.game.commands.define<{ pool?: AmmoPool }>("shop.buyAmmo", {
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
      const rejection = state.game.economy.charge(userId, "scrap", price.scrap);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: userId, text: "NOT ENOUGH SCRAP", kind: "warn" });
        return;
      }
      state.scene.entity.stats.delta(userId, statId, price.amount);
      state.game.events.emit("audio.play", { sound: SOUND_IDS.pickupGear });
    },
  });

  ctx.game.commands.define<{ station?: string }>("shop.mystery", {
    apply(state: GameContext, input) {
      const userId = state.player.userId;
      const station = stationById(input.station ?? "") ?? stationById("station_gear")!;
      const rejection = state.game.economy.charge(userId, "scrap", MYSTERY_CRATE.scrap);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: userId, text: "NOT ENOUGH SCRAP", kind: "warn" });
        return;
      }
      const drops = state.game.loot.roll(MYSTERY_CRATE.table);
      const weaponDrop = drops.find((drop) => drop.item !== undefined);
      if (weaponDrop?.item === undefined) {
        state.game.economy.grant(userId, "scrap", MYSTERY_CRATE.scrap);
        return;
      }
      const def = weaponById(weaponDrop.item);
      state.scene.worldItem.spawn({
        itemId: weaponDrop.item,
        position: [station.position[0] + 1.6, 0, station.position[1] + 1.6],
        rarity: def?.rarity,
        baseType: def?.family,
        source: "mystery_crate",
      });
      state.game.events.emit("audio.play", { sound: SOUND_IDS.pickupWeapon });
      state.scene.entity.floatText({ instanceId: userId, text: "CRATE CRACKED", kind: "pickup" });
    },
  });
}
