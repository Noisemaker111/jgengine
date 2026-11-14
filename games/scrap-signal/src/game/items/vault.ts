import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import { earn, spend } from "../cash";
import { bark } from "../combat/personalityRuntime";
import { noteEquipped } from "../feel";
import { conditionOf, gunById, mergeCost, mergeGuns, mergePlan, rarityRank, type GunDef } from "../handroll";
import { openWeaponSlots } from "../progression/unlocks";
import { session } from "../session";

/**
 * Hank's garage workbench on the cul-de-sac: it keeps the junk you cannot carry (the bench's
 * shelves are the `vault` inventory), salvages what you do not want into cash and spare parts, and
 * merges two weapons into one (`handroll/merge.ts`).
 */
export const vaultOpenStore = defineStore<boolean>("scrap.vaultOpen", false);

export const VAULT = "vault";

function deny(ctx: GameContext, text: string): false {
  ctx.game.notices.push({ text, tone: "deny" });
  return false;
}

/** Put the gun in weapon slot `slot` on the workbench shelf. */
export function depositGun(ctx: GameContext, slot: number): boolean {
  const stack = ctx.player.inventory.state("hotbar").slots[slot] ?? null;
  if (stack === null || gunById(stack.itemId) === undefined) return deny(ctx, "No weapon in that slot.");
  const room = ctx.player.inventory.state(VAULT).slots.some((entry) => entry === null);
  if (!room) return deny(ctx, "The workbench shelf is full.");
  ctx.player.inventory.take("hotbar", stack.itemId, stack.count);
  ctx.player.inventory.put(VAULT, stack.itemId, stack.count);
  if (session.selectedSlot() === slot) noteEquipped(null);
  return true;
}

/** Take a gun off the shelf into the first free weapon slot that is open. */
export function withdrawGun(ctx: GameContext, itemId: string): boolean {
  if (ctx.player.inventory.count(VAULT, itemId) <= 0) return deny(ctx, "That weapon is not on the shelf.");
  const open = openWeaponSlots(ctx);
  const slot = ctx.player.inventory.state("hotbar").slots.findIndex((entry, index) => index < open && entry === null);
  if (slot < 0) return deny(ctx, "No free weapon slot. Shelve something first.");
  ctx.player.inventory.take(VAULT, itemId, 1);
  ctx.player.inventory.put("hotbar", itemId, 1, { slot });
  if (session.selectedSlot() === slot) noteEquipped(itemId);
  return true;
}

/** Where a weapon the player owns sits: a weapon slot (its index) or the shelf. */
type Holding = { where: "hotbar"; slot: number } | { where: "vault" };

function holdingOf(ctx: GameContext, itemId: string): Holding | null {
  const slot = ctx.player.inventory.state("hotbar").slots.findIndex((entry) => entry?.itemId === itemId);
  if (slot >= 0) return { where: "hotbar", slot };
  return ctx.player.inventory.count(VAULT, itemId) > 0 ? { where: "vault" } : null;
}

function release(ctx: GameContext, itemId: string, holding: Holding): void {
  if (holding.where === "hotbar") {
    ctx.player.inventory.take("hotbar", itemId, 1);
    if (session.selectedSlot() === holding.slot) noteEquipped(null);
  } else {
    ctx.player.inventory.take(VAULT, itemId, 1);
  }
}

/** What salvaging a weapon pays: cash by level and condition, and spare parts for the good stuff. */
export function salvageValue(gun: Pick<GunDef, "level" | "rarity">): { cash: number; cores: number } {
  const rank = rarityRank(gun.rarity);
  return { cash: Math.round(8 * Math.max(1, gun.level) * (1 + rank)), cores: rank >= 2 ? rank - 1 : 0 };
}

/** Break a weapon down at the bench. It says goodbye first. */
export function salvageGun(ctx: GameContext, itemId: string): boolean {
  const gun = gunById(itemId);
  const holding = holdingOf(ctx, itemId);
  if (gun === undefined || holding === null) return deny(ctx, "You don't have that weapon.");
  const value = salvageValue(gun);
  bark(ctx, gun, "switchAway");
  release(ctx, itemId, holding);
  earn(ctx, "cash", value.cash, "salvage", gun.id);
  if (value.cores > 0) earn(ctx, "cores", value.cores, "salvage", gun.id);
  ctx.game.notices.push({ text: `Salvaged ${gun.name}: +$${value.cash}${value.cores > 0 ? ` +${value.cores} parts` : ""}`, tone: "success" });
  return true;
}

/**
 * Merge two weapons: `bodyId` gives the body and the voice, `modId` gives the mod. Both go in, one
 * comes out where the body donor was. Costs cash and a spare part (`mergeCost`).
 */
export function mergeAtBench(ctx: GameContext, bodyId: string, modId: string): GunDef | null {
  if (bodyId === modId) return deny(ctx, "Pick two different weapons.") || null;
  const body = gunById(bodyId);
  const mod = gunById(modId);
  const bodyAt = holdingOf(ctx, bodyId);
  const modAt = holdingOf(ctx, modId);
  if (body === undefined || mod === undefined || bodyAt === null || modAt === null) return deny(ctx, "You need both weapons on you or on the shelf.") || null;
  const plan = mergePlan(body, mod);
  const cost = mergeCost(plan);
  const userId = ctx.player.userId;
  if (ctx.game.economy.balance(userId, "cash") < cost.cash || ctx.game.economy.balance(userId, "cores") < cost.cores) {
    return deny(ctx, `The bench needs $${cost.cash} and ${cost.cores} spare part${cost.cores === 1 ? "" : "s"}.`) || null;
  }
  spend(ctx, "cash", cost.cash, "workbench-merge", `${bodyId}+${modId}`);
  spend(ctx, "cores", cost.cores, "workbench-merge", `${bodyId}+${modId}`);
  const merged = mergeGuns(body, mod);
  release(ctx, bodyId, bodyAt);
  release(ctx, modId, modAt);
  if (bodyAt.where === "hotbar") {
    ctx.player.inventory.put("hotbar", merged.id, 1, { slot: bodyAt.slot });
    if (session.selectedSlot() === bodyAt.slot) noteEquipped(merged.id);
  } else {
    ctx.player.inventory.put(VAULT, merged.id, 1);
  }
  bark(ctx, merged, "merge");
  ctx.game.notices.push({ text: `Merged: ${merged.name} (${conditionOf(merged.rarity)})`, tone: "success" });
  return merged;
}
