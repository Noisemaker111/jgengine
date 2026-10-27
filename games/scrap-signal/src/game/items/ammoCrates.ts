import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { AMMO_STAT_IDS } from "../ammo";
import { gunById, magLoaded, type GunDef } from "../handroll";
import { ammoCratesOpenedStore } from "../stores";
import { ZONES } from "../world/zones";
import { ammoPacksFor } from "./ammoDrops";
import { chestDropSpot } from "./chestDrops";

/** Seconds an emptied ammo crate takes to restock: like Borderlands' crates, they fill up again. */
export const AMMO_RESTOCK_SECONDS = 60;

/** Every zone's ammo crates, with the object id each is placed under. */
export const AMMO_CRATES: readonly { id: string; x: number; z: number }[] = ZONES.flatMap((zone) =>
  zone.chests.filter((chest) => chest.kind === "ammo").map((chest) => ({ x: chest.x, z: chest.z })),
).map((crate, index) => ({ id: `ammo_chest_${index}`, ...crate }));

/** Rounds a gun can still fire: its magazine and its pool. What a player reads off the ammo counter. */
export function roundsLeft(ctx: GameContext, gun: GunDef): number {
  return magLoaded(ctx, gun) + (ctx.scene.entity.stats.get(ctx.player.userId, AMMO_STAT_IDS[gun.ammo])?.current ?? 0);
}

/** Every gun you carry is empty, magazine and pool: time to find a crate. False with no gun at all. */
export function outOfAmmo(ctx: GameContext): boolean {
  const guns = ctx.player.inventory
    .state("hotbar")
    .slots.flatMap((slot) => {
      const gun = slot === null ? undefined : gunById(slot.itemId);
      return gun === undefined ? [] : [gun];
    });
  return guns.length > 0 && guns.every((gun) => roundsLeft(ctx, gun) === 0);
}

/** A crate gives a pack for every gun you carry (four slots at most), and a second for the emptiest. */
const PACKS_PER_CRATE = 4;

/** Whether the crate has ammo in it now. */
export function ammoCrateStocked(ctx: GameContext, instanceId: string): boolean {
  const openedAt = ammoCratesOpenedStore.read(ctx)[instanceId];
  return openedAt === undefined || ctx.time.now() - openedAt >= AMMO_RESTOCK_SECONDS;
}

/** Open an ammo crate: ammo for the guns you carry, and a grenade. An empty crate says so. */
export function openAmmoCrate(ctx: GameContext, instanceId: string): void {
  const userId = ctx.player.userId;
  if (!ammoCrateStocked(ctx, instanceId)) {
    ctx.scene.entity.floatText({ instanceId: userId, text: "CRATE EMPTY · RESTOCKING", kind: "warn" });
    return;
  }
  ammoCratesOpenedStore.write(ctx, { ...ammoCratesOpenedStore.read(ctx), [instanceId]: ctx.time.now() });
  const at = ctx.scene.object.get(instanceId)?.position ?? [0, 0, 0];
  const carried = ammoPacksFor(ctx, PACKS_PER_CRATE);
  const packs = carried.length > 0 ? [...carried, carried[0] ?? "ammo_pistol_pack"] : ["ammo_pistol_pack"];
  packs.forEach((itemId, index) => {
    ctx.scene.worldItem.spawn({ itemId, position: chestDropSpot(ctx, at, index, packs.length), source: "chest" });
  });
  ctx.scene.entity.stats.delta(userId, "grenades", 1);
  ctx.scene.entity.floatText({ instanceId: userId, text: "+1 GRENADE", kind: "pickup" });
}
