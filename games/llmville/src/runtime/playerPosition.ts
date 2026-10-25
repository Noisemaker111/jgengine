import type { PlayerPosition } from "@llmville/game/movement/playerMovement";
import { useSyncExternalStore } from "react";

import type { GameEngine } from "@/runtime/gameEngine";

export function readPlayerPosition(engine: GameEngine): PlayerPosition {
  return engine.getState().player.position;
}

export function usePlayerPosition(engine: GameEngine): PlayerPosition {
  return useSyncExternalStore(
    (listener) => engine.subscribe(() => listener()),
    () => engine.getState().player.position,
    () => engine.getState().player.position,
  );
}

export function subscribePlayerPosition(
  engine: GameEngine,
  onChange: (position: PlayerPosition) => void,
): () => void {
  let lastX = Number.NaN;
  let lastZ = Number.NaN;
  return engine.subscribe(() => {
    const { x, z } = engine.getState().player.position;
    if (x === lastX && z === lastZ) return;
    lastX = x;
    lastZ = z;
    onChange({ x, z });
  });
}