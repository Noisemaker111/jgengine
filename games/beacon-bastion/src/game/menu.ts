import { openTitle } from "@jgengine/core/game/gameFlow";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { loadSlot, newestKeep, refreshBeaconSlots, withdrawKeep } from "./save";
import { restartDefense } from "./world/setup";

export function openKeepTitle(ctx: GameContext): void {
  openTitle(ctx);
  void refreshBeaconSlots(ctx);
}

export function beginRun(ctx: GameContext): void {
  restartDefense(ctx);
  ctx.time.play();
  setGamePhase(ctx, "playing");
}

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

export async function withdrawToTitle(ctx: GameContext, _slot: string): Promise<void> {
  await withdrawKeep(ctx);
  openKeepTitle(ctx);
}

export async function continueNewest(ctx: GameContext): Promise<boolean> {
  const slot = newestKeep();
  if (slot === null) return false;
  await loadSlot(ctx, slot);
  enterRun(ctx);
  return true;
}
