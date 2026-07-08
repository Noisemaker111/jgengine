import type { GameDefinition } from "@jgengine/core/game/defineGame";
import { adapterOf, type MultiplayerAdapterConfig } from "@jgengine/core/runtime/adapter";
import type { MultiplayerSession } from "@jgengine/core/runtime/transport";
import { createWsBackend } from "@jgengine/ws/createWsBackend";
import {
  announcePeerHost,
  broadcastChannelSignaling,
  createPeerGuest,
  createPeerHost,
  joinPeerSession,
} from "@jgengine/ws/peer";

export type ShellMultiplayer = MultiplayerSession;

export const DEFAULT_FEED_ACTIONS = ["entity.died"];

const DEFAULT_WS_URL = "ws://localhost:8080/ws";

export function randomPlayerId(): string {
  return `player-${Math.random().toString(36).slice(2, 10)}`;
}

function lanUrl(adapter: Extract<MultiplayerAdapterConfig, { kind: "lan" }>): string {
  const hasWindow = typeof window !== "undefined";
  const scheme = hasWindow && window.location.protocol === "https:" ? "wss" : "ws";
  const hostname = hasWindow ? window.location.hostname : "localhost";
  const port = adapter.port ?? 8080;
  const path = adapter.path ?? "/ws";
  return `${scheme}://${hostname}:${port}${path}`;
}

function buildWsMultiplayer(args: {
  gameId: string;
  userId: string;
  feedActions: string[];
  url: string;
}): ShellMultiplayer {
  return {
    gameId: args.gameId,
    userId: args.userId,
    backend: createWsBackend({ url: args.url, userId: args.userId }),
    feedActions: args.feedActions,
  };
}

export type ResolveShellMultiplayerArgs = {
  game: GameDefinition;
  gameId: string;
  url?: string;
  userId?: string;
  force?: boolean;
  feedActions?: string[];
};

export function resolveShellMultiplayer(args: ResolveShellMultiplayerArgs): ShellMultiplayer | null {
  const userId = args.userId ?? randomPlayerId();
  const feedActions = args.feedActions ?? DEFAULT_FEED_ACTIONS;
  const build = (url: string) =>
    buildWsMultiplayer({ gameId: args.gameId, userId, feedActions, url });

  if (args.force === true) return build(args.url ?? DEFAULT_WS_URL);

  const adapter = adapterOf(args.game.multiplayer);
  if (adapter === null) return null;

  if (adapter.kind === "ws") return build(args.url ?? adapter.url ?? DEFAULT_WS_URL);
  if (adapter.kind === "lan") return build(args.url ?? lanUrl(adapter));

  return null;
}

export async function resolvePeerShellMultiplayer(args: {
  gameId: string;
  role: "host" | "join";
  room?: string;
  userId?: string;
  feedActions?: string[];
}): Promise<ShellMultiplayer & { close: () => void }> {
  const userId = args.userId ?? randomPlayerId();
  const feedActions = args.feedActions ?? DEFAULT_FEED_ACTIONS;
  const signaling = broadcastChannelSignaling(args.room ?? `jg-p2p-${args.gameId}`);

  if (args.role === "host") {
    const peerHost = createPeerHost({ userId });
    const stopAnnouncing = announcePeerHost(peerHost, signaling);
    return {
      gameId: args.gameId,
      userId,
      backend: peerHost.backend,
      feedActions,
      close: () => {
        stopAnnouncing();
        signaling.close();
        peerHost.close();
      },
    };
  }

  const guest = createPeerGuest({ userId });
  const backend = await joinPeerSession(guest, signaling);
  return {
    gameId: args.gameId,
    userId,
    backend,
    feedActions,
    close: () => {
      signaling.close();
      guest.close();
    },
  };
}
