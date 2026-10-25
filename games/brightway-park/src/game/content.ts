import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";

import { BUILDABLES } from "./objects/catalog";
import { GUEST_KINDS, GUEST_SCALE, GUEST_WALK_SPEED } from "./entities/guests/catalog";

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (GUEST_KINDS.includes(catalogId) || catalogId.startsWith("crew_")) {
    return {
      role: "npc",
      scale: GUEST_SCALE,
      movement: { poses: ["standing"], walkSpeed: GUEST_WALK_SPEED },
    };
  }
  return null;
}

/** What guests walk on and through: paths, queue lines (railed, but walked down the middle) and ride doors. */
const WALK_THROUGH = new Set(["path_walk", "path_queue", "ride_entrance", "ride_exit"]);

function objectById(catalogId: string): GameContextObjectEntry | null {
  if (BUILDABLES[catalogId] === undefined) return null;
  // No body: a guest walks onto a queue tile or under an entrance arch instead of stopping at it.
  return WALK_THROUGH.has(catalogId) ? { colliders: {} } : {};
}

export const content: GameContextContent = { entityById, objectById };
