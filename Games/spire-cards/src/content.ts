import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { ENEMY_CATALOG_ID, HERO_CATALOG_ID } from "./enemy";

const HERO: GameContextEntityEntry = {
  role: "player",
  stats: {
    health: { max: 72, min: 0 },
    block: { max: 999, min: 0, current: 0 },
    strength: { max: 99, min: 0, current: 0 },
  },
  receive: {
    strike: { order: ["block", "health"] },
  },
};

const ENEMY: GameContextEntityEntry = {
  role: "enemy",
  stats: {
    health: { max: 48, min: 0 },
    block: { max: 999, min: 0, current: 0 },
    strength: { max: 99, min: 0, current: 0 },
  },
  receive: {
    strike: { order: ["block", "health"] },
  },
};

const ENTITIES: Record<string, GameContextEntityEntry> = {
  [HERO_CATALOG_ID]: HERO,
  [ENEMY_CATALOG_ID]: ENEMY,
};

export const content: GameContextContent = {
  entityById: (catalogId) => ENTITIES[catalogId] ?? null,
};
