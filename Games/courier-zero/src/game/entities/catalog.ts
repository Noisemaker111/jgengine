import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const COURIER_ENTITY = "courier";
export const COURIER_BASE_WALK_SPEED = 4;
export const STAMINA_MAX = 100;
export const STAMINA_MIN = 0;
export const STAMINA_SPRINT_DRAIN_PER_SECOND = 26;
export const STAMINA_REGEN_PER_SECOND = 16;
export const STAMINA_STAT = "stamina";

const entities: Record<string, GameContextEntityEntry> = {
  [COURIER_ENTITY]: {
    movement: { walkSpeed: COURIER_BASE_WALK_SPEED },
    stats: {
      [STAMINA_STAT]: { max: STAMINA_MAX, min: STAMINA_MIN },
    },
    role: "player",
  },
};

export function entityById(id: string): GameContextEntityEntry | null {
  return entities[id] ?? null;
}
