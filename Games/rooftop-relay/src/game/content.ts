import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { RUNNERS, RUNNER_WALK_SPEED } from "./runners/catalog";

const runnerEntries: Record<string, GameContextEntityEntry> = Object.fromEntries(
  RUNNERS.map((runner) => [
    runner.id,
    { role: "player", movement: { walkSpeed: RUNNER_WALK_SPEED } } satisfies GameContextEntityEntry,
  ]),
);

export const content: GameContextContent = {
  entityById(catalogId) {
    return runnerEntries[catalogId] ?? null;
  },
};
