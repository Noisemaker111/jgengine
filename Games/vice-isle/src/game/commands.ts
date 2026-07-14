import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { handroll } from "./handroll";
import { vehicleById } from "./entities/vehicles/catalog";
import { GARAGE_POS } from "./world/districts";

export const DIALOGUE_STORE_KEY = "vice.dialogue";
export const SHOP_STORE_KEY = "vice.shop";
export const GARAGE_STORE_KEY = "vice.garage";
export const STARTED_STORE_KEY = "vice.started";

function selectedHotbarItem(ctx: GameContext): string | null {
  const slots = ctx.player.inventory.state("hotbar").slots;
  const selected = (ctx.game.store.get("vice.slot") as number | undefined) ?? 0;
  const slot = slots[selected];
  return slot?.itemId ?? null;
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define("fire", {
    apply(state, input) {
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

  ctx.game.commands.define("game.start", {
    apply(state) {
      if ((state.game.store.get(STARTED_STORE_KEY) as boolean | undefined) === true) return;
      state.game.store.set(STARTED_STORE_KEY, true);
      const player = state.scene.entity.get(state.player.userId);
      const px = player?.position[0] ?? -176;
      const pz = player?.position[2] ?? 24;
      const py = player?.position[1] ?? 0;
      state.camera.setCinematic({
        keyframes: [
          { position: { x: 60, y: 160, z: -180 }, lookAt: { x: 40, y: 10, z: -60 }, duration: 0.01 },
          { position: { x: -40, y: 90, z: 60 }, lookAt: { x: -60, y: 4, z: 40 }, duration: 3, ease: "smooth" },
          { position: { x: px + 6, y: py + 4, z: pz + 10 }, lookAt: { x: px, y: py + 1.5, z: pz }, duration: 3, ease: "smooth" },
        ],
      });
      state.time.after(6.4, () => {
        state.camera.setCinematic(null);
      });
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
      const result = state.game.trade!.buy(itemId, 1, {
        shop: "shop_ammunation",
        inventoryId: isWeapon ? "hotbar" : "backpack",
      });
      if (result !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: result.reason.toUpperCase(), kind: "warn" });
      }
    },
  });

  ctx.game.commands.define("garage.open", {
    apply(state) {
      state.game.store.set(GARAGE_STORE_KEY, true);
    },
  });

  ctx.game.commands.define("garage.close", {
    apply(state) {
      state.game.store.delete(GARAGE_STORE_KEY);
    },
  });

  ctx.game.commands.define("garage.buy", {
    apply(state, input) {
      const kind = (input as { vehicle?: string }).vehicle;
      const def = kind !== undefined ? vehicleById(kind) : undefined;
      if (def === undefined || def.price <= 0) return;
      const charge = state.game.economy.charge(state.player.userId, "cash", def.price);
      if (charge !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "NOT ENOUGH CASH", kind: "warn" });
        return;
      }
      const x = GARAGE_POS[0] + 6;
      const z = GARAGE_POS[2] + 6;
      state.scene.entity.spawn(def.id, {
        id: `bought_${state.time.now().toFixed(0)}_${def.id}`,
        position: [x, state.world.groundHeightAt(x, z), z],
        role: "prop",
      });
      state.game.store.delete(GARAGE_STORE_KEY);
      state.game.feed.push("vice.log", { text: `Bought a ${def.label}` });
    },
  });

  ctx.game.commands.define("race.start", {
    apply(state) {
      if (handroll.drivingVehicleId() === null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "YOU NEED A CAR", kind: "warn" });
        return;
      }
      handroll.startRace(state);
    },
  });

  ctx.game.commands.define("shop.bribe", {
    apply(state) {
      const wanted = handroll.wanted();
      if (wanted.stars === 0) return;
      const cost = wanted.stars * 250;
      const charge = state.game.economy.charge(state.player.userId, "cash", cost);
      if (charge !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "NOT ENOUGH CASH", kind: "warn" });
        return;
      }
      handroll.clearWanted(state);
      state.game.feed.push("vice.log", { text: `Bribed VCPD for $${cost}` });
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
