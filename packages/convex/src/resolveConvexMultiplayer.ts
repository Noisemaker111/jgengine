import { ConvexReactClient } from "convex/react";
import type { GameDefinition } from "@jgengine/core/game/defineGame";
import { multiplayerAdapterKind } from "@jgengine/core/runtime/adapter";
import type { MultiplayerSession } from "@jgengine/core/runtime/transport";
import type { PoseSyncTuning } from "@jgengine/core/multiplayer/poseSyncGate";
import { createConvexBackend } from "./createConvexBackend";
import type { ConvexGameApi } from "./createConvexGameTransport";

export function randomConvexPlayerId(): string {
  return `player-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveConvexMultiplayer(args: {
  game: GameDefinition;
  gameId: string;
  url?: string;
  client?: ConvexReactClient;
  api?: ConvexGameApi;
  userId?: string;
  force?: boolean;
  feedActions?: string[];
  poseTuning?: PoseSyncTuning;
}): MultiplayerSession | null {
  if (args.force !== true && multiplayerAdapterKind(args.game.multiplayer) !== "convex") return null;
  const client = args.client ?? (args.url === undefined ? null : new ConvexReactClient(args.url));
  if (client === null) return null;
  const userId = args.userId ?? randomConvexPlayerId();
  return {
    gameId: args.gameId,
    userId,
    backend: createConvexBackend({
      client,
      gameId: args.gameId,
      userId,
      api: args.api,
      poseTuning: args.poseTuning,
    }),
    feedActions: args.feedActions ?? ["entity.died"],
  };
}
