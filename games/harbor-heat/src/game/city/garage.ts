import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { editorLayers } from "../../editorLayers";
import { cityEvent } from "../cityRuntime";
import { vehicleById } from "../entities/vehicles/catalog";
import { handrollOf } from "../handroll";
import { quietOnYourBlock } from "./street";

/**
 * Cars the player keeps: a car is theirs once bought or boosted, so getting back in costs no heat;
 * Sunset Motors' bay stores up to {@link GARAGE_SLOTS} of them between sessions.
 */
export const GARAGE_SLOTS = 3;

/** Catalog ids of the cars parked in the bay, oldest first. */
export const storedCarsStore = defineStore<string[] | undefined>("harbor.stored", undefined);

interface CarMeta {
  owned?: boolean;
}

const bay = (() => {
  const marker = editorLayers.markers.find((entry) => entry.id === "hideout_motors");
  return marker === undefined ? null : { x: marker.position.x, z: marker.position.z, radius: typeof marker.meta?.radius === "number" ? marker.meta.radius : 10 };
})();

/**
 * The player got into a car. A car they already own is just a car; a stranger's is a carjacking,
 * which is a crime the street reports unless the block is the player's.
 */
export function stealCar(ctx: GameContext, vehicle: { id: string; name: string; position: readonly [number, number, number]; meta?: unknown }): void {
  const meta = (vehicle.meta ?? {}) as CarMeta;
  if (meta.owned === true) return;
  ctx.scene.entity.update(vehicle.id, { meta: { ...meta, owned: true } });
  const label = vehicleById(vehicle.name)?.label ?? "car";
  if (quietOnYourBlock(ctx, vehicle)) {
    ctx.game.notices.push({ text: `Boosted a ${label}. Nobody on your block saw a thing.`, tone: "info" });
    return;
  }
  cityEvent(ctx, { kind: "carjack", at: [vehicle.position[0], vehicle.position[1], vehicle.position[2]] });
  ctx.game.notices.push({ text: `Boosted a ${label}. Somebody's calling it in.`, tone: "info" });
}

const inBay = (at: readonly [number, number, number]) => bay !== null && Math.hypot(bay.x - at[0], bay.z - at[2]) <= bay.radius;

export function registerGarage(ctx: GameContext): void {
  ctx.game.commands.define<Record<string, never>>("garage.store", {
    validate(state) {
      const handroll = handrollOf(state);
      const id = handroll.drivingVehicleId();
      const car = id === null ? null : state.scene.entity.get(id);
      if (car === null) return { reason: "no-car", message: "Drive a car into the bay to park it." };
      if (handroll.wanted().stars > 0) return { reason: "hot", message: "Rita won't park a hot car. Lose the heat or respray it." };
      if ((storedCarsStore.read(state) ?? []).length >= GARAGE_SLOTS) return { reason: "full", message: `The bay holds ${GARAGE_SLOTS} cars.` };
      return null;
    },
    apply(state) {
      const handroll = handrollOf(state);
      const id = handroll.drivingVehicleId();
      const car = id === null ? null : state.scene.entity.get(id);
      if (id === null || car === null) return;
      handroll.exitVehicle(state, true);
      state.scene.entity.despawn(id);
      storedCarsStore.write(state, [...(storedCarsStore.read(state) ?? []), car.name]);
      state.game.notices.push({ text: `Parked the ${vehicleById(car.name)?.label ?? "car"} in Sunset Motors' bay.`, tone: "success" });
    },
  });

  ctx.game.commands.define<Record<string, never>>("garage.retrieve", {
    validate(state) {
      return (storedCarsStore.read(state) ?? []).length === 0 ? { reason: "empty", message: "Nothing parked in the bay." } : null;
    },
    apply(state) {
      const stored = [...(storedCarsStore.read(state) ?? [])];
      const kind = stored.pop();
      if (kind === undefined || bay === null) return;
      storedCarsStore.write(state, stored);
      const x = bay.x + 4;
      const z = bay.z - 4;
      state.scene.entity.spawn(kind, { position: [x, state.world.groundHeightAt(x, z), z], role: "prop", meta: { owned: true } });
      state.game.notices.push({ text: `Rita rolls out your ${vehicleById(kind)?.label ?? "car"}.`, tone: "success" });
    },
  });
}

/** Park the car you're driving, or take one out on foot. */
export function garagePrompts(ctx: GameContext): PositionedPrompt[] {
  if (bay === null) return [];
  const handroll = handrollOf(ctx);
  const driving = handroll.drivingVehicleId();
  const body = ctx.scene.entity.get(driving ?? ctx.player.userId);
  if (body === null || !inBay(body.position)) return [];
  const stored = storedCarsStore.read(ctx) ?? [];
  const base = { position: { x: bay.x, z: bay.z }, priority: 2 };
  const reach = { radius: bay.radius, display: { kind: "keybind" as const, actionId: "interact" } };
  if (driving !== null) {
    if (handroll.wanted().stars > 0 || stored.length >= GARAGE_SLOTS) return [];
    return [{ ...base, id: "bay:store", prompt: { ...reach, invoke: { name: "garage.store", input: {} } } }];
  }
  if (stored.length === 0) return [];
  return [{ ...base, id: "bay:retrieve", priority: 0, prompt: { ...reach, invoke: { name: "garage.retrieve", input: {} } } }];
}

export function garagePromptLabel(ctx: GameContext, id: string): string | null {
  const stored = storedCarsStore.read(ctx) ?? [];
  if (id === "bay:store") return `Park it in the bay · ${stored.length}/${GARAGE_SLOTS}`;
  if (id === "bay:retrieve") return `Take out your ${vehicleById(stored[stored.length - 1] ?? "")?.label ?? "car"}`;
  return null;
}
