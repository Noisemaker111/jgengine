import type { GameDefinition } from "@jgengine/core/game/defineGame";
import { createWsBackend, type WsBackend } from "@jgengine/ws/createWsBackend";

export type ShellMultiplayer = {
  gameId: string;
  userId: string;
  backend: WsBackend;
  feedActions: string[];
};

function adapterKind(multiplayer: unknown): string | null {
  if (typeof multiplayer !== "object" || multiplayer === null) return null;
  const direct = (multiplayer as { kind?: unknown }).kind;
  if (typeof direct === "string") return direct;
  const nested = (multiplayer as { adapter?: { kind?: unknown } }).adapter?.kind;
  return typeof nested === "string" ? nested : null;
}

export function resolveShellMultiplayer(args: {
  game: GameDefinition;
  gameId: string;
  url?: string;
  userId?: string;
  force?: boolean;
  feedActions?: string[];
}): ShellMultiplayer | null {
  if (args.force !== true && adapterKind(args.game.multiplayer) !== "ws") return null;
  const userId = args.userId ?? `player-${Math.random().toString(36).slice(2, 10)}`;
  return {
    gameId: args.gameId,
    userId,
    backend: createWsBackend({ url: args.url ?? "ws://localhost:8080/ws", userId }),
    feedActions: args.feedActions ?? ["entity.died"],
  };
}
