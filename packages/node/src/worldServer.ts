import type { GameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import { createHostedWorldSession } from "@jgengine/core/runtime/hostedWorldSession";
import type { ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import { createWorldGameHost, type WorldGameHost } from "@jgengine/ws/worldHost";
import { createGameWsServer, type GameWsServer, type GameWsServerOptions } from "./wsServer";

/** A game the world server can host — its authoritative {@link GameDefinition} and the content lookup a `GameContext` reads. */
export interface HostedGameDefinition {
  game: GameDefinition<ModelAssetRef, unknown>;
  content: GameContextContent;
}

/** Config for {@link createWorldGameServer}: how to resolve a game by id, the tick cadence, and the underlying ws-server/router options (minus `host`, which the server builds). */
export interface WorldGameServerOptions extends Omit<GameWsServerOptions, "host"> {
  /** Resolve a game to host by id — `null` for an unknown id, which rejects the join. */
  resolveGame(gameId: string): HostedGameDefinition | null;
  /** Ticks per second for the real-clock loop {@link WorldGameServer.start} drives; default 30. Tests call {@link WorldGameServer.tick} manually instead. */
  tickHz?: number;
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
  /** Stop the tick loop and tear down the ws server. */
  close(): Promise<void>;
  /** The bound ws port. */
  port(): number;
}

const DEFAULT_TICK_HZ = 30;

/** Build a {@link WorldGameServer} — one process hosting authoritative GameContext worlds over ws, ready for two-client play once {@link WorldGameServer.start} runs. */
export function createWorldGameServer(options: WorldGameServerOptions): WorldGameServer {
  const { resolveGame, tickHz = DEFAULT_TICK_HZ, ...serverOptions } = options;
  const clock = options.now ?? (() => Date.now());

  const host = createWorldGameHost({
    now: clock,
    session: ({ gameId }) => {
      const resolved = resolveGame(gameId);
      if (resolved === null) return null;
      return createHostedWorldSession({ definition: resolved.game, content: resolved.content, now: clock });
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

  return {
    host,
    ws,
    tick,
    stop,
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
      await ws.close();
    },
  };
}
