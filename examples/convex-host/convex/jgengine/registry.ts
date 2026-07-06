import type { GameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import type { CommandDef } from "@jgengine/core/runtime/commandRunner";
import { createEmptyServerRow, type GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";

const builtinCommands: Record<string, CommandDef> = {
  "engine.ping": {
    validate: (_snapshot: GameRuntimeSnapshot) => null,
    apply: (snapshot: GameRuntimeSnapshot) => snapshot,
  },
};

const registry = new Map<string, GameRuntime>();

export function registerGameRuntime(runtime: GameRuntime): void {
  registry.set(runtime.gameId, runtime);
}

export function getGameRuntime(gameId: string): GameRuntime {
  const existing = registry.get(gameId);
  if (existing) return existing;

  const fallback = createGameRuntime({
    gameId,
    save: "none",
    commands: builtinCommands,
  });
  registry.set(gameId, fallback);
  return fallback;
}

export function defaultServerStateForGame(gameId: string) {
  void gameId;
  return createEmptyServerRow();
}
