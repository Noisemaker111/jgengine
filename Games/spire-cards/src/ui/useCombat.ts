import { useSyncExternalStore } from "react";

import { combat, type CombatSnapshot } from "../combat";

export function useCombat(): CombatSnapshot {
  return useSyncExternalStore(combat.subscribe, combat.getSnapshot, combat.getSnapshot);
}
