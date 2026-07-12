import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { handroll } from "./handroll";
import { vehicleById } from "./entities/vehicles/catalog";

export const DIALOGUE_STORE_KEY = "vice.dialogue";
export const SHOP_STORE_KEY = "vice.shop";

function selectedHotbarItem(ctx: GameContext): string | null {
  const slots = ctx.player.inventory.state("hotbar").slots;
  const selected = (ctx.game.store.get("vice.slot") as number | undefined) ?? 0;
  const slot = slots[selected];
  return slot?.itemId ?? null;
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define("fire", {
    apply(state, input) {
      if (handroll.drivingVehicleId() !== null) return;
      const itemId = selectedHotbarItem(state);
      if (itemId === null) return;
      const aim = (input as { aim?: { yaw: number; pitch: number } }).aim;
      state.item.use.use({ from: state.player.userId, itemId, aim });
    },
  });

  ctx.game.commands.define("throwGrenade", {
    apply(state) {
      if (handroll.drivingVehicleId() !== null) return;
      state.item.use.use({ from: state.player.userId, itemId: "grenade_pineapple" });
    },
  });

  ctx.game.commands.define("useMedkit", {
    apply(state) {
      state.item.use.use({ from: state.player.userId, itemId: "medkit_street" });
    },
  });

  ctx.game.commands.define("vehicle.enter", {
    apply(state, input) {
      const vehicleId = (input as { vehicle?: string }).vehicle;
      if (vehicleId === undefined || handroll.drivingVehicleId() !== null) return;
      const vehicle = state.scene.entity.get(vehicleId);
      if (vehicle === null || vehicleById(vehicle.name) === undefined) return;
      handroll.enterVehicle(state, vehicleId);
      handroll.addHeat(state, 30);
      state.game.feed.push("vice.log", { text: `Boosted a ${vehicleById(vehicle.name)?.label ?? "car"}` });
    },
  });

  ctx.game.commands.define("exitVehicle", {
    apply(state) {
      handroll.exitVehicle(state);
    },
  });

  ctx.game.commands.define("contact.talk", {
    apply(state, input) {
      const dialogue = (input as { dialogue?: string }).dialogue;
      if (dialogue !== undefined) state.game.store.set(DIALOGUE_STORE_KEY, dialogue);
    },
  });

  ctx.game.commands.define("dialogue.close", {
    apply(state) {
      state.game.store.delete(DIALOGUE_STORE_KEY);
    },
  });

  ctx.game.commands.define("mission.acknowledge", {
    apply(state) {
      state.game.store.delete(DIALOGUE_STORE_KEY);
    },
  });

  ctx.game.commands.define("shop.open", {
    apply(state) {
      state.game.store.set(SHOP_STORE_KEY, "shop_ammunation");
    },
  });

  ctx.game.commands.define("shop.close", {
    apply(state) {
      state.game.store.delete(SHOP_STORE_KEY);
    },
  });

  ctx.game.commands.define("shop.buy", {
    apply(state, input) {
      const itemId = (input as { item?: string }).item;
      if (itemId === undefined) return;
      const isWeapon = itemId.startsWith("pistol") || itemId.startsWith("smg") || itemId.startsWith("shotgun");
      const result = state.game.trade.buy(itemId, 1, {
        shop: "shop_ammunation",
        inventoryId: isWeapon ? "hotbar" : "backpack",
      });
      if (result !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: result.reason.toUpperCase(), kind: "warn" });
      }
    },
  });

  for (let slot = 1; slot <= 4; slot += 1) {
    ctx.game.commands.define(`selectSlot${slot}`, {
      apply(state) {
        state.game.store.set("vice.slot", slot - 1);
      },
    });
  }
}
