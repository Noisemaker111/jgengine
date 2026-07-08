import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

export const content: GameContextContent = {
  entityById: (id) => (id === "caravan" ? { role: "npc" } : undefined),
};
