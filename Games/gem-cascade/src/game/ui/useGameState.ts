import { useSyncExternalStore } from "react";

import { store, type Snapshot } from "../store";

export function useGameState(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
