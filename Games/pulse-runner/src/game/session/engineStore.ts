import { useGameStore } from "@jgengine/react/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { RunnerEngine, RunnerSnapshot } from "./runnerEngine";

const ENGINE_KEY = "pulse-runner:engine";

export function installEngine(ctx: GameContext, engine: RunnerEngine): void {
  ctx.game.store.set(ENGINE_KEY, engine);
}

export function readEngine(ctx: GameContext): RunnerEngine | undefined {
  return ctx.game.store.get(ENGINE_KEY) as RunnerEngine | undefined;
}

export function useRunnerSnapshot(): RunnerSnapshot | undefined {
  return useGameStore((ctx) => readEngine(ctx)?.snapshot());
}
