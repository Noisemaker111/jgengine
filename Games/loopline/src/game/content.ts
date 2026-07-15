import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";

import { BUILDABLES } from "./objects/catalog";
import { GUEST_ID, GUEST_SCALE, GUEST_WALK_SPEED } from "./entities/guests/catalog";

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId === GUEST_ID) {
    return {
      role: "npc",
      scale: GUEST_SCALE,
      movement: { poses: ["standing"], walkSpeed: GUEST_WALK_SPEED },
    };
  }
  return null;
}

function objectById(catalogId: string): GameContextObjectEntry | null {
  return BUILDABLES[catalogId] !== undefined ? {} : null;
}

export const content: GameContextContent = { entityById, objectById };
