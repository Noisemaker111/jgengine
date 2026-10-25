import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { handrollOf } from "./handroll";
import { vehicleById } from "./entities/vehicles/catalog";
import { CRED_GATES, credLevel } from "./progression/cred";
import { GARAGE_POS } from "./world/districts";
import { sessionStore, startedThisBoot, syncSession } from "./session";
import { registerCourier } from "./jobs/courier";
import { registerGigs } from "./jobs/gigs";
import { buyNightMarket } from "./items/nightMarket";
import { buyFromShop, earn, spend } from "./cash";
import { stealCar } from "./city/garage";
import { awayStore, passTime, secondsUntilMorning } from "./away";
import { buyUpgrade, upgradeById, upgradeRank } from "./progression/upgrades";

export const shopStore = defineStore<string | undefined>("harbor.shop", undefined);
export const garageStore = defineStore<boolean | undefined>("harbor.garage", undefined);
export const startedStore = defineStore<boolean | undefined>("harbor.started", undefined);
export const slotStore = defineStore<number | undefined>("harbor.slot", undefined);
/** True once a whole-world save was restored this boot — title shows Continue and start skips the intro. */
export const continueStore = defineStore<boolean | undefined>("harbor.continue", undefined);
/** Palmview Bungalow ownership — persisted with the world save. */
/** Ammu-Isle's hours, sim clock. */
export const SHOP_OPENS = 8;
export const SHOP_CLOSES = 22;
export const safehouseStore = defineStore<boolean | undefined>("harbor.safehouse", undefined);
/** Whether the bungalow's board is open. */
export const houseStore = defineStore<boolean | undefined>("harbor.house", undefined);
/** Best Ocean Loop time in seconds — persisted; beating it pays a bonus. */
export const bestRaceStore = defineStore<number | undefined>("harbor.bestRace", undefined);

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
  registerCourier(ctx);
  registerGigs(ctx);
  ctx.game.commands.define("session.pause", { apply(state, input) {
    sessionStore.write(state, { ...sessionStore.read(state), paused: (input as { paused: boolean }).paused });
    syncSession(state, startedStore.read(state) === true);
  } });
  ctx.game.commands.define("session.settings", { apply(state, input) {
    sessionStore.write(state, { ...sessionStore.read(state), settings: (input as { open: boolean }).open });
    syncSession(state, startedStore.read(state) === true);
  } });
  ctx.game.commands.define("session.dismiss", { apply(state) {
    sessionStore.write(state, { ...sessionStore.read(state), notice: "" });
    syncSession(state, startedStore.read(state) === true);
  } });
  ctx.game.commands.define("session.save", { apply(state) { void state.game.save?.checkpoint(); } });
  // A result screen's "Title": back to the dispatch board over the paused coast; Continue picks the run up.
  ctx.game.commands.define("session.title", { apply(state) {
    sessionStore.write(state, { ...sessionStore.read(state), paused: false, notice: "" });
    startedStore.write(state, false);
    syncSession(state, false);
  } });
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
      startedThisBoot(state).value = true;
      // Live now: the shell reveals the on-screen touch controls only in the `playing` phase.
      syncSession(state, true);
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
      stealCar(state, vehicle);
    },
  });

  ctx.game.commands.define("exitVehicle", {
    apply(state) {
      handrollOf(state).exitVehicle(state);
    },
  });

  ctx.game.commands.define("shop.open", {
    validate(state) {
      const hour = state.time.calendar().hour;
      return hour >= SHOP_OPENS && hour < SHOP_CLOSES ? null : { reason: "closed", message: `Ammu-Isle is shut. Open ${SHOP_OPENS}:00 to ${SHOP_CLOSES}:00; the night market runs after dark.` };
    },
    apply(state) {
      shopStore.write(state, "shop_ammunation");
    },
  });

  ctx.game.commands.define("shop.close", {
    apply(state) {
      shopStore.clear(state);
    },
  });

  ctx.game.commands.define<{ itemId?: string }>("market.buy", {
    apply(state, input) {
      if (input.itemId !== undefined) buyNightMarket(state, input.itemId);
    },
  });

  ctx.game.commands.define("shop.buy", {
    apply(state, input) {
      const itemId = (input as { item?: string }).item;
      if (itemId === undefined) return;
      const gate = credGateBlocking(state, itemId);
      if (gate !== null) {
        state.game.notices.push({ text: `Needs street cred ${gate}.`, tone: "deny" });
        return;
      }
      const isWeapon = itemId.startsWith("pistol") || itemId.startsWith("smg") || itemId.startsWith("shotgun");
      const result = buyFromShop(state, itemId, {
        shop: "shop_ammunation",
        inventoryId: isWeapon ? "hotbar" : "backpack",
      });
      if (result !== null) {
        state.game.notices.push({ text: `Can't buy that: ${result.reason.replaceAll("-", " ")}.`, tone: "deny" });
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
        state.game.notices.push({ text: `Needs street cred ${gate}.`, tone: "deny" });
        return;
      }
      if (!spend(state, def.price, "garage-purchase", def.id)) {
        state.game.notices.push({ text: "Not enough cash.", tone: "deny" });
        return;
      }
      const x = GARAGE_POS[0] + 6;
      const z = GARAGE_POS[2] + 6;
      // The shared allocator keeps repeated purchases distinct, including after a saved-world reload.
      state.scene.entity.spawn(def.id, {
        position: [x, state.world.groundHeightAt(x, z), z],
        role: "prop",
        meta: { owned: true },
      });
      garageStore.clear(state);
      state.game.notices.push({ text: `Bought a ${def.label}`, tone: "success" });
    },
  });

  ctx.game.commands.define("race.start", {
    apply(state) {
      if (handrollOf(state).drivingVehicleId() === null) {
        state.game.notices.push({ text: "You need a car to race.", tone: "deny" });
        return;
      }
      if (handrollOf(state).raceActive()) return;
      if (!spend(state, RACE_ENTRY_FEE, "race-entry")) {
        state.game.notices.push({ text: `Race entry is $${RACE_ENTRY_FEE}.`, tone: "deny" });
        return;
      }
      if (!handrollOf(state).startRace(state)) {
        earn(state, RACE_ENTRY_FEE, "race-refund");
        return;
      }
      state.game.notices.push({ text: `Ocean Loop entry paid — $${RACE_ENTRY_FEE}.`, tone: "info" });
    },
  });

  ctx.game.commands.define("safehouse.buy", {
    apply(state) {
      if (safehouseStore.read(state) === true) return;
      if (!spend(state, SAFEHOUSE_PRICE, "safehouse-purchase")) {
        state.game.notices.push({ text: "Not enough cash.", tone: "deny" });
        return;
      }
      safehouseStore.write(state, true);
      state.game.notices.push({ text: "Palmview Bungalow is yours — rest up, respawn here.", tone: "success" });
      state.scene.entity.floatText({ instanceId: state.player.userId, text: "SAFEHOUSE OWNED", kind: "good" });
    },
  });

  ctx.game.commands.define("safehouse.rest", {
    apply(state) {
      if (safehouseStore.read(state) !== true) return;
      houseStore.write(state, true);
    },
  });

  ctx.game.commands.define("house.close", {
    apply(state) {
      houseStore.clear(state);
    },
  });

  ctx.game.commands.define("safehouse.patch", {
    apply(state) {
      if (safehouseStore.read(state) !== true) return;
      restUp(state);
      state.game.notices.push({ text: "Rested at the bungalow — back to full health. Progress saved.", tone: "success" });
      void state.game.save?.checkpoint();
    },
  });

  ctx.game.commands.define("safehouse.sleep", {
    validate(state) {
      if (safehouseStore.read(state) !== true) return { reason: "no-house", message: "You need a bed of your own." };
      if (handrollOf(state).wanted().stars > 0) return { reason: "hot", message: "Nobody sleeps with HHPD on the street. Lose the heat first." };
      return null;
    },
    apply(state) {
      houseStore.clear(state);
      restUp(state);
      passTime(state, secondsUntilMorning(state), "sleep");
      void state.game.save?.checkpoint();
    },
  });

  ctx.game.commands.define("away.dismiss", {
    apply(state) {
      awayStore.clear(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("upgrade.buy", {
    validate(state, input) {
      const node = upgradeById(input.id);
      if (node === undefined) return { reason: "unknown", message: "Nobody sells that." };
      if (node.shop === "house" && safehouseStore.read(state) !== true) return { reason: "no-house", message: "Buy the bungalow first." };
      return null;
    },
    apply(state, input) {
      const node = upgradeById(input.id);
      if (node === undefined) return;
      const result = buyUpgrade(state, input.id, (cost) => spend(state, cost, "upgrade-purchase", input.id));
      if (!result.ok) {
        const text = result.reason === "max-rank" ? `${node.label} is maxed out.` : result.reason === "insufficient-funds" ? "Not enough cash." : "Not available yet.";
        state.game.notices.push({ text, tone: "deny" });
        return;
      }
      if (node.shop === "garage") handrollOf(state).retuneOwnedCars(state);
      const rank = upgradeRank(state, input.id);
      state.game.notices.push({ text: `${node.label}${(node.maxRank ?? 1) > 1 ? ` ${rank}` : ""}: ${node.lines[rank - 1] ?? "installed"}.`, tone: "success" });
    },
  });

  ctx.game.commands.define("shop.bribe", {
    apply(state) {
      const wanted = handrollOf(state).wanted();
      if (wanted.stars === 0) return;
      const cost = wanted.stars * 250;
      if (!spend(state, cost, "bribe")) {
        state.game.notices.push({ text: "Not enough cash.", tone: "deny" });
        return;
      }
      handrollOf(state).clearWanted(state);
      state.game.notices.push({ text: `Bribed HHPD for $${cost}`, tone: "success" });
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

/** A night in the bungalow: full health, and whatever its rooms stock. */
function restUp(ctx: GameContext): void {
  const me = ctx.player.userId;
  const health = ctx.scene.entity.stats.get(me, "health");
  if (health !== null) ctx.scene.entity.stats.set(me, "health", { current: health.max });
  if (upgradeRank(ctx, "house_locker") > 0) {
    for (const stat of ["ammo_9mm", "ammo_shell"]) {
      const ammo = ctx.scene.entity.stats.get(me, stat);
      if (ammo !== null) ctx.scene.entity.stats.set(me, stat, { current: ammo.max });
    }
  }
  if (upgradeRank(ctx, "house_med") > 0 && ctx.player.inventory.count("backpack", "medkit_street") < 1) ctx.player.inventory.put("backpack", "medkit_street", 1);
}
