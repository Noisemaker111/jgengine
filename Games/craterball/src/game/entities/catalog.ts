export const PLAYER_CYAN = "player_cyan";
export const BOMBER_MAGENTA = "bomber_magenta";
export const BALL = "ball";

export const PLAYER_WALK_SPEED = 7.4;
export const BOMBER_BASE_WALK_SPEED = 6.6;

export interface EntityCatalogEntry {
  id: string;
  label: string;
  movement?: { walkSpeed?: number };
  role?: "player" | "enemy" | "hostile" | "npc" | "vehicle";
}

export const entityCatalog: Readonly<Record<string, EntityCatalogEntry>> = {
  [PLAYER_CYAN]: {
    id: PLAYER_CYAN,
    label: "Cyan Bomber",
    movement: { walkSpeed: PLAYER_WALK_SPEED },
    role: "player",
  },
  [BOMBER_MAGENTA]: {
    id: BOMBER_MAGENTA,
    label: "Magenta Bomber",
    movement: { walkSpeed: BOMBER_BASE_WALK_SPEED },
    role: "enemy",
  },
  [BALL]: {
    id: BALL,
    label: "Craterball",
  },
};
