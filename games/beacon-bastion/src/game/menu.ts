import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { loadSlot, newestKeep, refreshBeaconSlots, saveToSlot } from "./save";
import { restartDefense } from "./world/setup";

/** Boot into the keep with the defense already standing behind the title, and the clock stopped. */
export function openTitle(ctx: GameContext): void {
  ctx.time.pause();
  setGamePhase(ctx, "menu");
  void refreshBeaconSlots(ctx);
}

/** The title's backdrop is the standing keep; a new run clears it and hands control back. */
export function beginRun(ctx: GameContext): void {
  restartDefense(ctx);
  ctx.time.play();
  setGamePhase(ctx, "playing");
}

/** Hand control to a run already standing in the world (a loaded keep) without restarting it. */
export function enterRun(ctx: GameContext): void {
  ctx.time.play();
  setGamePhase(ctx, "playing");
}

export function pauseRun(ctx: GameContext): void {
  if (gamePhase(ctx) !== "playing") return;
  ctx.time.pause();
  setGamePhase(ctx, "paused");
}

export function resumeRun(ctx: GameContext): void {
  if (gamePhase(ctx) !== "paused") return;
  ctx.time.play();
  setGamePhase(ctx, "playing");
}

/** Keep the defense on disk, then stand in front of it. */
export async function withdrawToTitle(ctx: GameContext, slot: string): Promise<void> {
  await saveToSlot(ctx, slot);
  openTitle(ctx);
}

/** Resume the newest keep from its document — the menu's Continue. */
export async function continueNewest(ctx: GameContext): Promise<boolean> {
  const slot = newestKeep();
  if (slot === null) return false;
  await loadSlot(ctx, slot);
  enterRun(ctx);
  return true;
}
