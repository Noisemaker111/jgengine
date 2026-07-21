import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { defineStore } from "@jgengine/core/store/defineStore";
import { handrollOf } from "./handroll";
import { vehicleById } from "./entities/vehicles/catalog";
import { CRED_GATES, credLevel } from "./progression/cred";
import { GARAGE_POS } from "./world/districts";

export const shopStore = defineStore<string | undefined>("vice.shop", undefined);
export const garageStore = defineStore<boolean | undefined>("vice.garage", undefined);
export const startedStore = defineStore<boolean | undefined>("vice.started", undefined);
export const slotStore = defineStore<number | undefined>("vice.slot", undefined);
/** True once a whole-world save was restored this boot — title shows Continue and start skips the intro. */
export const continueStore = defineStore<boolean | undefined>("vice.continue", undefined);
/** Palmview Bungalow ownership — persisted with the world save. */
export const safehouseStore = defineStore<boolean | undefined>("vice.safehouse", undefined);
/** Best Ocean Loop time in seconds — persisted; beating it pays a bonus. */
export const bestRaceStore = defineStore<number | undefined>("vice.bestRace", undefined);

export const SAFEHOUSE_PRICE = 5000;
export const RACE_ENTRY_FEE = 200;
export const RACE_WIN_PAYOUT = 600;
export const RACE_BEST_BONUS = 250;

/** True for shoot/drive/capture boots that must land on the chase cam immediately (#1519). */
export function shouldSkipIntroFlyover(): boolean {
  if (typeof globalThis.location === "undefined") return false;
  const search = globalThis.location.search ?? "";
  if (/[?&](spawn|cam)=/.test(search)) return true;
  if (typeof document !== "undefined") {
    const capture = document.documentElement?.dataset?.jgCapture;
    if (capture === "ready" || capture === "pending") return true;
  }
  return false;
}

/** Cred gate for a purchasable id, or null when the player clears it. */
export function credGateBlocking(ctx: GameContext, id: string): number | null {
  const gate = CRED_GATES[id];
  if (gate === undefined || credLevel(ctx) >= gate) return null;
  return gate;
}

function selectedHotbarItem(ctx: GameContext): string | null {
  const slots = ctx.player.inventory.state("hotbar").slots;
  const selected = slotStore.read(ctx) ?? 0;
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
      if (handrollOf(state).drivingVehicleId() !== null) return;
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
      if (startedStore.read(state) === true) return;
      startedStore.write(state, true);
      // Live now: the shell reveals the on-screen touch controls only in the `playing` phase.
      setGamePhase(state, "playing");
      // Continuing a save drops straight back into play; the flyover is a first-run intro.
      if (continueStore.read(state) === true) return;
      // Capture/drive tools (`?spawn=`, `?cam=`, jg-capture) need an instant chase cam — the old
      // 6s god-cam path opened on empty lawn voids mid-flight and made playtests unreadable (#1519).
      if (shouldSkipIntroFlyover()) {
        state.camera.setCinematic(null);
        state.camera.follow(state.player.userId);
        return;
      }
      const player = state.scene.entity.get(state.player.userId);
      const px = player?.position[0] ?? -176;
      const pz = player?.position[2] ?? 24;
      const py = player?.position[1] ?? 0;
      // Short street-framed flyover that stays over the grid, then lands on the chase shoulder.
      // Auto-clears when the path completes (no sim-clock clear timer).
      state.camera.setCinematic({
        keyframes: [
          { position: { x: px + 28, y: py + 22, z: pz + 36 }, lookAt: { x: px + 8, y: py + 2, z: pz + 8 }, duration: 0.01 },
          { position: { x: px + 14, y: py + 10, z: pz + 18 }, lookAt: { x: px, y: py + 1.4, z: pz }, duration: 1.4, ease: "smooth" },
          { position: { x: px + 5.5, y: py + 3.2, z: pz + 8 }, lookAt: { x: px, y: py + 1.2, z: pz }, duration: 1.2, ease: "smooth" },
        ],
      });
    },
  });

  ctx.game.commands.define("vehicle.enter", {
    apply(state, input) {
      const vehicleId = (input as { vehicle?: string }).vehicle;
      if (vehicleId === undefined || handrollOf(state).drivingVehicleId() !== null) return;
      const vehicle = state.scene.entity.get(vehicleId);
      if (vehicle === null || vehicleById(vehicle.name) === undefined) return;
      handrollOf(state).enterVehicle(state, vehicleId);
      handrollOf(state).addHeat(state, 30);
      state.game.feed.push("vice.log", { text: `Boosted a ${vehicleById(vehicle.name)?.label ?? "car"}` });
    },
  });

  ctx.game.commands.define("exitVehicle", {
    apply(state) {
      handrollOf(state).exitVehicle(state);
    },
  });

  ctx.game.commands.define("shop.open", {
    apply(state) {
      shopStore.write(state, "shop_ammunation");
    },
  });

  ctx.game.commands.define("shop.close", {
    apply(state) {
      shopStore.clear(state);
    },
  });

  ctx.game.commands.define("shop.buy", {
    apply(state, input) {
      const itemId = (input as { item?: string }).item;
      if (itemId === undefined) return;
      const gate = credGateBlocking(state, itemId);
      if (gate !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: `NEEDS CRED ${gate}`, kind: "warn" });
        return;
      }
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
      garageStore.write(state, true);
    },
  });

  ctx.game.commands.define("garage.close", {
    apply(state) {
      garageStore.clear(state);
    },
  });

  ctx.game.commands.define("garage.buy", {
    apply(state, input) {
      const kind = (input as { vehicle?: string }).vehicle;
      const def = kind !== undefined ? vehicleById(kind) : undefined;
      if (def === undefined || def.price <= 0) return;
      const gate = credGateBlocking(state, def.id);
      if (gate !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: `NEEDS CRED ${gate}`, kind: "warn" });
        return;
      }
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
      garageStore.clear(state);
      state.game.feed.push("vice.log", { text: `Bought a ${def.label}` });
    },
  });

  ctx.game.commands.define("race.start", {
    apply(state) {
      if (handrollOf(state).drivingVehicleId() === null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "YOU NEED A CAR", kind: "warn" });
        return;
      }
      if (handrollOf(state).raceActive()) return;
      const charge = state.game.economy.charge(state.player.userId, "cash", RACE_ENTRY_FEE);
      if (charge !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: `ENTRY $${RACE_ENTRY_FEE}`, kind: "warn" });
        return;
      }
      if (!handrollOf(state).startRace(state)) {
        state.game.economy.grant(state.player.userId, "cash", RACE_ENTRY_FEE);
        return;
      }
      state.game.feed.push("vice.log", { text: `Ocean Loop entry paid — $${RACE_ENTRY_FEE}.` });
    },
  });

  ctx.game.commands.define("safehouse.buy", {
    apply(state) {
      if (safehouseStore.read(state) === true) return;
      const charge = state.game.economy.charge(state.player.userId, "cash", SAFEHOUSE_PRICE);
      if (charge !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "NOT ENOUGH CASH", kind: "warn" });
        return;
      }
      safehouseStore.write(state, true);
      state.game.feed.push("vice.log", { text: "Palmview Bungalow is yours — rest up, respawn here." });
      state.scene.entity.floatText({ instanceId: state.player.userId, text: "SAFEHOUSE OWNED", kind: "good" });
    },
  });

  ctx.game.commands.define("safehouse.rest", {
    apply(state) {
      if (safehouseStore.read(state) !== true) return;
      const health = state.scene.entity.stats.get(state.player.userId, "health");
      if (health === null) return;
      state.scene.entity.stats.set(state.player.userId, "health", { current: health.max });
      state.game.feed.push("vice.log", { text: "Rested at the bungalow — back to full health." });
    },
  });

  ctx.game.commands.define("shop.bribe", {
    apply(state) {
      const wanted = handrollOf(state).wanted();
      if (wanted.stars === 0) return;
      const cost = wanted.stars * 250;
      const charge = state.game.economy.charge(state.player.userId, "cash", cost);
      if (charge !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "NOT ENOUGH CASH", kind: "warn" });
        return;
      }
      handrollOf(state).clearWanted(state);
      state.game.feed.push("vice.log", { text: `Bribed VCPD for $${cost}` });
    },
  });

  for (let slot = 1; slot <= 4; slot += 1) {
    ctx.game.commands.define(`selectSlot${slot}`, {
      apply(state) {
        slotStore.write(state, slot - 1);
      },
    });
  }
}
