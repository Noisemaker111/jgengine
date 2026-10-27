import type { GameContext } from "@jgengine/core/runtime/gameContext";

// Stand-ins for a game's own rules, so the keybinds snippet compiles.
// The hand-rolled side calls the same functions.

export function openDoor(ctx: GameContext): void {
  ctx.game.notices.push({ text: "The gate creaks open", tone: "info" });
}

export function shoot(ctx: GameContext, input: { aim?: { yaw: number; pitch: number } }): void {
  ctx.item.use.use({ from: ctx.player.userId, itemId: "rifle", ...(input.aim && { aim: input.aim }) });
}

let inventoryOpen = false;
export function toggleInventory(ctx: GameContext): void {
  inventoryOpen = !inventoryOpen;
  ctx.touch();
}
