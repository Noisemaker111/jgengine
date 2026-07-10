import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const COURIER_ENTITY = "courier";

const courierEntry: GameContextEntityEntry = {
  role: "player",
  movement: { walkSpeed: 0 },
};

function entityById(id: string): GameContextEntityEntry | null {
  return id === COURIER_ENTITY ? courierEntry : null;
}

export const content: GameContextContent = { entityById };
