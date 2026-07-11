import { useGameStore } from "@jgengine/react/hooks";

import { STORE_KEY } from "../state";
import type { AppState } from "../state";

export function useApp(): AppState | undefined {
  return useGameStore((ctx) => ctx.game.store.get(STORE_KEY) as AppState | undefined);
}
