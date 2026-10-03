import type { GameDefinition } from "@jgengine/core/game/defineGame";
import { adapterOf, isServerAuthoritative, type MultiplayerAdapterConfig } from "@jgengine/core/runtime/adapter";
import type { MultiplayerSession } from "@jgengine/core/runtime/transport";
import { createHostedWorldSession, createHostedWorldSessionAsync, type HostedWorldStore } from "@jgengine/core/runtime/hostedWorldSession";
import { createWorldGameHost } from "@jgengine/ws/worldHost";
import type { PlayableGame } from "./registry";
import { createWsBackend } from "@jgengine/ws/createWsBackend";
import {
  announcePeerHost,
  broadcastChannelSignaling,
  createPeerGuest,
  createPeerHost,
  joinPeerSession,
  type PeerHost,
  type PeerHostOptions,
  type PeerGuest,
  type PeerGuestOptions,
  type PeerSignaling,
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
  if (adapter === null || adapter.kind === "offline") return null;

  if (adapter.kind === "ws") {
    const url = args.url ?? adapter.url;
    if (url === undefined && isServerAuthoritative(args.game.multiplayer)) {
      console.warn(
        `[jgengine:multiplayer] ${args.gameId}: ws({ authority: "server" }) has no url; falling back to single-player. ` +
          `Pass a url (or set adapter.url) so the shell can reach the host.`,
      );
      return null;
    }
    return build(url ?? DEFAULT_WS_URL);
  }
  if (adapter.kind === "lan") return build(args.url ?? lanUrl(adapter));

  console.warn(
    `[jgengine:multiplayer] ${args.gameId}: multiplayer adapter "${adapter.kind}" needs its own session bootstrap ` +
      `(e.g. resolvePeerShellMultiplayer for p2p()); resolveShellMultiplayer cannot build a ws backend for it, ` +
      `so the game shipped single-player. Wire up the ${adapter.kind} transport or switch to ws()/lan().`,
  );
  return null;
}

/** Alternate peer factories for hosts that provide their own WebRTC implementation or transport pipe. */
export interface PeerShellFactories {
  host(options: PeerHostOptions): PeerHost;
  guest(options: PeerGuestOptions): PeerGuest;
}

/** Peer bootstrap options; passing a playable hosts its authoritative GameContext world. */
export interface ResolvePeerShellMultiplayerArgs {
  gameId: string;
  role: "host" | "join";
  room?: string;
  userId?: string;
  feedActions?: string[];
  /** Requires an adapter with `authority: "server"`; joiners mount the same playable. */
  playable?: PlayableGame;
  /** Maximum active players in the authoritative world, including the host player. */
  slotsPerServer?: number;
  /** Authoritative tick interval in milliseconds; defaults to 1000 / 30. */
  tickMs?: number;
  /** Minimum automatic save interval; joins, commands and close still save immediately. Defaults to 1000 ms. */
  saveIntervalMs?: number;
  /** Persistence for the authoritative host world; defaults to an in-memory store. */
  store?: HostedWorldStore;
  /** Signaling ownership transfers to the returned session, which closes it on teardown. */
  signaling?: PeerSignaling;
  peers?: PeerShellFactories;
  /** Inject host scheduling; the returned cancellation is called before transport teardown. */
  scheduleTicks?: (tick: () => void, intervalMs: number) => () => void;
}

/**
 * Opens a peer session. With `playable`, one host runs the game loop and guests mirror its shared world.
 * Await `close()` to finish authoritative persistence. Same-origin rooms use BroadcastChannel signaling.
 * @capability multiplayer-p2p bootstrap a playable authoritative world for browser peer co-op
 */
export async function resolvePeerShellMultiplayer(
  args: ResolvePeerShellMultiplayerArgs,
): Promise<ShellMultiplayer & { close: () => Promise<void> }> {
  if (args.playable !== undefined && !isServerAuthoritative(args.playable.game.multiplayer)) {
    throw new Error("playable peer worlds require authority: server");
  }
  const tickMs = args.tickMs ?? 1000 / 30;
  if (!Number.isFinite(tickMs) || tickMs <= 0 || tickMs > 1000) throw new Error("tickMs must be greater than zero and at most 1000");
  const saveIntervalMs = args.saveIntervalMs ?? 1000;
  if (!Number.isFinite(saveIntervalMs) || saveIntervalMs < 0) throw new Error("saveIntervalMs must be nonnegative and finite");
  const userId = args.userId ?? randomPlayerId();
  const feedActions = args.feedActions ?? DEFAULT_FEED_ACTIONS;
  const signaling = args.signaling ?? broadcastChannelSignaling(args.room ?? `jg-p2p-${args.gameId}`);
  const peers = args.peers ?? { host: createPeerHost, guest: createPeerGuest };

  if (args.role === "host") {
    let closed = false;
    let activeSession: Awaited<ReturnType<typeof createHostedWorldSession>> | null = null;
    let host: ReturnType<typeof createWorldGameHost> | undefined;
    let cancelTicks = () => {};
    let stopAnnouncing = () => {};
    let peerHost: PeerHost | undefined;
    let closing: Promise<void> | null = null;
    try {
      if (args.playable !== undefined) {
        const playable = args.playable;
        let loading: Promise<Awaited<ReturnType<typeof createHostedWorldSession>>> | null = null;
        host = createWorldGameHost({
          slotsPerServer: args.slotsPerServer,
          session({ gameId, serverId }) {
            if (closed || gameId !== args.gameId || serverId !== args.gameId) return null;
            if (loading === null) {
              const attempt = args.store === undefined
                ? Promise.resolve(createHostedWorldSession({ definition: playable.game, content: playable.content, host: { userId, isNew: true }, saveIntervalMs }))
                : createHostedWorldSessionAsync({ definition: playable.game, content: playable.content, host: { userId, isNew: true }, store: args.store, saveIntervalMs });
              loading = attempt;
              void attempt.catch(() => { if (loading === attempt) loading = null; });
            }
            return loading.then(session => { activeSession = session; return session; });
          },
        });
      }
      peerHost = peers.host({ userId, ...(host === undefined ? {} : { host }) });
      stopAnnouncing = announcePeerHost(peerHost, signaling);
      if (host !== undefined) {
        const worldHost = host;
        const tick = () => { if (!closed && activeSession !== null && activeSession.members().length > 0) worldHost.tick(tickMs / 1000); };
        cancelTicks = args.scheduleTicks?.(tick, tickMs) ?? (() => {
          const timer = setInterval(tick, tickMs);
          return () => clearInterval(timer);
        })();
      }
      const resolvedPeerHost = peerHost;
      return {
        gameId: args.gameId, userId, backend: resolvedPeerHost.backend, feedActions,
        close() {
          if (closing !== null) return closing;
          closed = true;
          cancelTicks();
          stopAnnouncing();
          signaling.close();
          resolvedPeerHost.close();
          closing = resolvedPeerHost.router.drain().then(async () => {
            if (host !== undefined) await host.stop();
          });
          return closing;
        },
      };
    } catch (error) {
      closed = true;
      cancelTicks();
      stopAnnouncing();
      signaling.close();
      peerHost?.close();
      await peerHost?.router.drain();
      if (host !== undefined) await host.stop();
      throw error;
    }
  }

  let guest: PeerGuest | undefined;
  try {
    guest = peers.guest({ userId });
    const backend = await joinPeerSession(guest, signaling);
    const resolvedGuest = guest;
    let closed = false;
    return {
      gameId: args.gameId, userId, backend, feedActions,
      async close() {
        if (closed) return;
        closed = true;
        signaling.close();
        resolvedGuest.close();
      },
    };
  } catch (error) {
    signaling.close();
    guest?.close();
    throw error;
  }
}
