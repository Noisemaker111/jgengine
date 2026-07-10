import type { GameContextContent, GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";

const objectEntries: Record<string, GameContextObjectEntry> = {
  building: {},
  plaza: {},
};

export const content: GameContextContent = {
  objectById: (id) => objectEntries[id] ?? null,
};
