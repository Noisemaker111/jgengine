import type { GameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContextContent, GameContextModels } from "@jgengine/core/runtime/gameContext";
import { createHostedWorldSession, type HostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";
import type { ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import { createWorldGameHost, type WorldGameHost } from "@jgengine/ws/worldHost";
import { memoryWorldPersistence, type WorldPersistence } from "./persistence";
import { createGameWsServer, type GameWsServer, type GameWsServerOptions } from "./wsServer";

/** A game the world server can host — its authoritative {@link GameDefinition} and the content lookup a `GameContext` reads. */
export interface HostedGameDefinition {
  game: GameDefinition<ModelAssetRef, unknown>;
  content: GameContextContent;
  /** Render-model lookup for collider auto-fit — pass the same lookup the shell derives (`contextModels(playable)`) so the authoritative host resolves the hitboxes clients see. */
  models?: GameContextModels;
}

/** Config for {@link createWorldGameServer}: how to resolve a game by id, the tick cadence, and the underlying ws-server/router options (minus `host`, which the server builds). */
export interface WorldGameServerOptions extends Omit<GameWsServerOptions, "host"> {
  /** Resolve a game to host by id — `null` for an unknown id, which rejects the join. */
  resolveGame(gameId: string): HostedGameDefinition | null;
  /** Ticks per second for the real-clock loop {@link WorldGameServer.start} drives; default 30. Tests call {@link WorldGameServer.tick} manually instead. */
  tickHz?: number;
  /** Where each hosted world's authoritative state persists; defaults to an isolated in-memory store per world (lost on exit). Inject a file/SQL/Convex-backed {@link WorldPersistence} to survive a redeploy or crash. */
  persistence?: WorldPersistence;
}

/** A runnable ws host for GameContext worlds: {@link createWorldGameHost} + {@link createGameWsServer} + a tick loop, with a manual `tick(dt)` seam so a fake clock can drive it in tests. */
export interface WorldGameServer {
  host: WorldGameHost;
  ws: GameWsServer;
  /** Advance every live world by `dtSeconds` — the manual/test drive point; {@link start} calls it on a real-clock interval. */
  tick(dtSeconds: number): void;
  /** Begin driving {@link tick} on a real-clock interval at `tickHz` (idempotent). */
  start(): void;
  /** Stop the tick interval (idempotent). */
  stop(): void;
  /** Force-persist every live world's current state via the injected {@link WorldPersistence} (idempotent — safe to call repeatedly). */
  flush(): void;
  /** Stop the tick loop, flush persistence, and tear down the ws server — the clean-shutdown path for a SIGINT/SIGTERM handler. */
  close(): Promise<void>;
  /** The bound ws port. */
  port(): number;
}

const DEFAULT_TICK_HZ = 30;

/** Build a {@link WorldGameServer} — one process hosting authoritative GameContext worlds over ws, ready for two-client play once {@link WorldGameServer.start} runs. */
export function createWorldGameServer(options: WorldGameServerOptions): WorldGameServer {
  const {
    resolveGame,
    tickHz = DEFAULT_TICK_HZ,
    persistence = memoryWorldPersistence(),
    ...serverOptions
  } = options;
  const clock = options.now ?? (() => Date.now());

  const liveSessions = new Map<string, HostedWorldSession>();

  const host = createWorldGameHost({
    now: clock,
    session: ({ gameId, serverId }) => {
      const resolved = resolveGame(gameId);
      if (resolved === null) return null;
      const session = createHostedWorldSession({
        definition: resolved.game,
        content: resolved.content,
        now: clock,
        store: persistence.store({ gameId, serverId }),
        ...(resolved.models === undefined ? {} : { models: resolved.models }),
      });
      liveSessions.set(serverId, session);
      return session;
    },
  });
  const ws = createGameWsServer({ ...serverOptions, host });

  let interval: ReturnType<typeof setInterval> | null = null;
  let last = clock();

  function tick(dtSeconds: number): void {
    host.tick(dtSeconds);
  }

  function stop(): void {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  }

  function flush(): void {
    for (const session of liveSessions.values()) session.save();
  }

  return {
    host,
    ws,
    tick,
    stop,
    flush,
    port: ws.port,
    start() {
      if (interval !== null) return;
      last = clock();
      interval = setInterval(() => {
        const current = clock();
        tick((current - last) / 1000);
        last = current;
      }, 1000 / tickHz);
    },
    async close() {
      stop();
      flush();
      await ws.close();
    },
  };
}
