import { useGameStore } from "@jgengine/react/hooks";
import { localPlayerEntity } from "@jgengine/react/hooks";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { getRun, isMapOpen, prompts } from "../run/session";
import type { RunState } from "../run/runState";
import { STAMINA_STAT } from "../entities/catalog";

export function useRunState(): RunState {
  return useGameStore((ctx) => getRun(ctx));
}

export function useMapOpen(): boolean {
  return useGameStore((ctx) => isMapOpen(ctx));
}

export function usePlayerEntity(): SceneEntity | null {
  return useGameStore((ctx) => localPlayerEntity(ctx));
}

export function useNearActivePrompt(): boolean {
  return useGameStore((ctx) => {
    const player = localPlayerEntity(ctx);
    if (player === null) return false;
    const list = prompts(ctx);
    return resolveActivePrompt({ x: player.position[0], z: player.position[2] }, list) !== null;
  });
}

export function useStamina(): { current: number; max: number } {
  return useGameStore((ctx) => {
    const player = localPlayerEntity(ctx);
    if (player === null) return { current: 0, max: 100 };
    const stat = ctx.scene.entity.stats.get(player.id, STAMINA_STAT);
    return stat === null ? { current: 0, max: 100 } : { current: stat.current, max: stat.max };
  });
}
