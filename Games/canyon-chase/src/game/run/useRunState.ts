import { useGameStore } from "@jgengine/react";
import type { RunState } from "./runState";
import { RUN_STORE_KEY } from "./storeKeys";

export function useRunState(): RunState | undefined {
  return useGameStore((ctx) => ctx.game.store.get(RUN_STORE_KEY) as RunState | undefined);
}
