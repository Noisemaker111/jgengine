import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMMO_LABELS, AMMO_STAT_IDS } from "./ammo";
import { gearById } from "./items/gear/catalog";
import { weaponById } from "./items/weapons/catalog";
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
    ctx.scene.entity.floatText({ instanceId: userId, text: weapon.name.toUpperCase(), kind: "pickup" });
    ctx.game.feed.push("loot.pickup", { data: { itemId: weapon.id, rarity: weapon.rarity } });
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
      state.item.use.use(state, {
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
      state.item.use.use(state, {
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
      state.item.use.use(state, { from: state.player.userId, itemId, inventoryId: "backpack" });
    },
  });

  ctx.game.commands.define("pickup", {
    apply(state: GameContext) {
      pickupWorldItem(state);
    },
  });
}
