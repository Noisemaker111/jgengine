import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { CHASSIS } from "../cart/chassis";

/** The player's shopper; the cart they push is a chassis body drawn under them (see cart/chassis.ts). */
export const KART_PLAYER_ENTITY = "kart_player";
/** The closing shutter and the floor scrubber pushing its brush bar ahead of it. */
export const COMPACTOR_ENTITY = "compactor_wall";
/** Your best run on a timed event, driven again beside you. */
export const KART_GHOST_ENTITY = "kart_ghost";
/** The loading bay's tugger-train sections, rolling over the crossings on their timetable. */
export const FREIGHT_CAR_ENTITY = "freight_car";

/** The late shoppers who race you to the tills, and the security guard who tries to stop you. */
export const RIVAL_ENTITY_KINDS = ["kart_rival_grandma", "kart_rival_twins", "kart_rival_brick", "kart_rival_guard"] as const;

const rivalEntry: GameContextEntityEntry = { role: "vehicle" };

export const ENTITY_CATALOG: Record<string, GameContextEntityEntry> = {
  [KART_PLAYER_ENTITY]: { role: "player" },
  [COMPACTOR_ENTITY]: { role: "vehicle" },
  [KART_GHOST_ENTITY]: { role: "vehicle" },
  [FREIGHT_CAR_ENTITY]: { role: "vehicle" },
  ...Object.fromEntries(RIVAL_ENTITY_KINDS.map((kind) => [kind, rivalEntry])),
  ...Object.fromEntries(CHASSIS.map((entry) => [entry.entityKind, { role: "vehicle" } satisfies GameContextEntityEntry])),
};
