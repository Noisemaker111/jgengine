import { useGameStore } from "@jgengine/react/hooks";

import { RUN_STORE_KEY, type RunState } from "./types";

export function useRunState(): RunState | undefined {
  return useGameStore((ctx) => ctx.game.store.get(RUN_STORE_KEY) as RunState | undefined);
}
