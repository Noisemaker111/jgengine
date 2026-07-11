import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { EchoState } from "./machine";
import type { BestSubmission } from "./records";

export type RunState = EchoState & { readonly bests: BestSubmission | null };

export const RUN_KEY = "run";

let runCounter = 0;

export function freshSeed(): string {
  runCounter += 1;
  return `${Date.now().toString(36)}${runCounter.toString(36)}`;
}

export function getRun(ctx: GameContext): RunState | null {
  const run = ctx.game.store.get(RUN_KEY);
  return run === undefined ? null : (run as RunState);
}

export function setRun(ctx: GameContext, run: RunState): void {
  ctx.game.store.set(RUN_KEY, run);
}
