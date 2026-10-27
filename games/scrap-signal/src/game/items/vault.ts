import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import { noteEquipped } from "../feel";
import { gunById } from "../handroll";
import { openWeaponSlots } from "../progression/unlocks";
import { session } from "../session";

/** Whether the Coretown vault's window is open. */
export const vaultOpenStore = defineStore<boolean>("scrap.vaultOpen", false);

export const VAULT = "vault";

function deny(ctx: GameContext, text: string): false {
  ctx.game.notices.push({ text, tone: "deny" });
  return false;
}

/** Put the gun in weapon slot `slot` into the vault. */
export function depositGun(ctx: GameContext, slot: number): boolean {
  const stack = ctx.player.inventory.state("hotbar").slots[slot] ?? null;
  if (stack === null || gunById(stack.itemId) === undefined) return deny(ctx, "No gun in that slot.");
  const room = ctx.player.inventory.state(VAULT).slots.some((entry) => entry === null);
  if (!room) return deny(ctx, "The vault is full.");
  ctx.player.inventory.take("hotbar", stack.itemId, stack.count);
  ctx.player.inventory.put(VAULT, stack.itemId, stack.count);
  if (session.selectedSlot() === slot) noteEquipped(null);
  return true;
}

/** Take a gun out of the vault into the first free weapon slot that is open. */
export function withdrawGun(ctx: GameContext, itemId: string): boolean {
  if (ctx.player.inventory.count(VAULT, itemId) <= 0) return deny(ctx, "That gun is not in the vault.");
  const open = openWeaponSlots(ctx);
  const slot = ctx.player.inventory.state("hotbar").slots.findIndex((entry, index) => index < open && entry === null);
  if (slot < 0) return deny(ctx, "No free weapon slot. Store a gun first.");
  ctx.player.inventory.take(VAULT, itemId, 1);
  ctx.player.inventory.put("hotbar", itemId, 1, { slot });
  if (session.selectedSlot() === slot) noteEquipped(itemId);
  return true;
}
