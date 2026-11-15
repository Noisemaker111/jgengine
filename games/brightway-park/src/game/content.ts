import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";

import { BUILDABLES } from "./objects/catalog";
import { GUEST_KINDS, GUEST_SCALE, GUEST_WALK_SPEED } from "./entities/guests/catalog";
import { GHOST_BODIES } from "./ghostCatalog";

/** The exorcist's entity kind (kept here as a literal so content does not load the runtime threats module). */
const EXORCIST_BODY = "visitor_exorcist";

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (GUEST_KINDS.includes(catalogId) || GHOST_BODIES.includes(catalogId) || catalogId === EXORCIST_BODY || catalogId.startsWith("crew_")) {
    return {
      role: "npc",
      scale: GUEST_SCALE,
      movement: { poses: ["standing"], walkSpeed: GUEST_WALK_SPEED },
    };
  }
  return null;
}

/** What the living walk on and through: paths, queue lines (railed, but walked down the middle) and ride doors. */
const WALK_THROUGH = new Set(["path_walk", "path_queue", "ride_entrance", "ride_exit"]);

function objectById(catalogId: string): GameContextObjectEntry | null {
  if (BUILDABLES[catalogId] === undefined) return null;
  // No body: a visitor walks onto a queue tile or under an entrance arch instead of stopping at it.
  return WALK_THROUGH.has(catalogId) ? { colliders: {} } : {};
}

export const content: GameContextContent = { entityById, objectById };
