import { useGameStore } from "@jgengine/react/hooks";
import type { CurrentField } from "../course/current";
import type { HudSnapshot, ResultsSnapshot } from "../race/tick";

export function useHud(): HudSnapshot | undefined {
  return useGameStore((ctx) => ctx.game.store.get("hud") as HudSnapshot | undefined);
}

export function useCurrentField(): CurrentField | undefined {
  return useGameStore((ctx) => ctx.game.store.get("current") as CurrentField | undefined);
}

export function useResults(): ResultsSnapshot | undefined {
  return useGameStore((ctx) => ctx.game.store.get("results") as ResultsSnapshot | undefined);
}
