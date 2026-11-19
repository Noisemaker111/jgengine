import type { GameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContextContent, GameContextModels } from "@jgengine/core/runtime/gameContext";
import { DEFAULT_HOST_SAVE_INTERVAL_MS } from "@jgengine/core/runtime/hostPolicy";
import { createHostedWorldSessionAsync } from "@jgengine/core/runtime/hostedWorldSession";
import type { ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import { createWorldGameHost, type WorldGameHost } from "@jgengine/ws/worldHost";
import { memoryWorldPersistence, type WorldPersistence } from "./persistence";
import { createGameWsServer, type GameWsServer, type GameWsServerOptions } from "./wsServer";

export interface HostedGameDefinition {
  game: GameDefinition<ModelAssetRef, unknown>;
  content: GameContextContent;
  /** Render-model lookup for collider auto-fit — pass the same lookup the shell derives (`contextModels(playable)`) so the authoritative host resolves the hitboxes clients see. */
  models?: GameContextModels;
}

export interface WorldGameServerOptions extends Omit<GameWsServerOptions, "host"> {
  resolveGame(gameId: string): HostedGameDefinition | null;
  /** Ticks per second for the real-clock loop {@link WorldGameServer.start} drives; default 30. Tests call {@link WorldGameServer.tick} manually instead. */
  tickHz?: number;
  /** Minimum ms between automatic saves of a changed world; default 1000. `0` saves after every changed tick. */
  saveIntervalMs?: number;
  /** Where each hosted world's authoritative state persists; defaults to an isolated in-memory store per world (lost on exit). Inject a file/SQL/Convex-backed {@link WorldPersistence} to survive a redeploy or crash. */
  persistence?: WorldPersistence;
}

/** A runnable ws host for GameContext worlds: {@link createWorldGameHost} + {@link createGameWsServer} + a tick loop, with a manual `tick(dt)` seam so a fake clock can drive it in tests. */
export interface WorldGameServer {
  host: WorldGameHost;
  ws: GameWsServer;
  tick(dtSeconds: number): void;
  /** Begin driving {@link tick} on a real-clock interval at `tickHz` (idempotent). */
  start(): void;
  /** Stop the tick interval (idempotent); `start()` can resume it until the server closes. */
  stop(): void;
  /** Force-persist every live world's current state via the injected {@link WorldPersistence} (idempotent — safe to call repeatedly). */
  flush(): Promise<void>;
  close(): Promise<void>;
  port(): number;
}

const DEFAULT_TICK_HZ = 30;

export function createWorldGameServer(options: WorldGameServerOptions): WorldGameServer {
  const {
    resolveGame,
    tickHz = DEFAULT_TICK_HZ,
    saveIntervalMs = DEFAULT_HOST_SAVE_INTERVAL_MS,
    persistence = memoryWorldPersistence(),
    ...serverOptions
  } = options;
  const clock = options.now ?? (() => Date.now());

  const host = createWorldGameHost({
    now: clock,
    session: async ({ gameId, serverId }) => {
      const resolved = resolveGame(gameId);
      if (resolved === null) return null;
      const session = await createHostedWorldSessionAsync({
        definition: resolved.game,
        content: resolved.content,
        now: clock,
        saveIntervalMs,
        store: persistence.store({ gameId, serverId }),
        ...(resolved.models === undefined ? {} : { models: resolved.models }),
      });
      return session;
    },
  });
  const ws = createGameWsServer({ ...serverOptions, host });

  let interval: ReturnType<typeof setInterval> | null = null;
  let closing: Promise<void> | null = null;
  let last = clock();

  function tick(dtSeconds: number): void {
    if (closing !== null) return;
    host.tick(dtSeconds);
  }

  function stop(): void {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  }

  async function flush(): Promise<void> {
    await host.flushAll();
  }

  return {
    host,
    ws,
    tick,
    stop,
    flush,
    port: ws.port,
    start() {
      if (closing !== null || interval !== null) return;
      last = clock();
      interval = setInterval(() => {
        const current = clock();
        tick((current - last) / 1000);
        last = current;
      }, 1000 / tickHz);
    },
    close() {
      if (closing !== null) return closing;
      stop();
      closing = (async () => {
        try { await ws.close(); }
        finally { await host.stop(); }
      })();
      return closing;
    },
  };
}
