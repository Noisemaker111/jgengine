import type { Server as HttpServer } from "node:http";

import { WebSocketServer, type WebSocket } from "ws";

import { createHostRouter, type HostRouterOptions, type RewoundPosition } from "@jgengine/ws/hostRouter";

export type { RewoundPosition };

/** Default per-message payload cap (bytes) — `ws` closes the socket with 1009 past this. */
export const DEFAULT_MAX_PAYLOAD_BYTES = 1_048_576;
/** Default max concurrent sockets this server accepts before rejecting new ones. */
export const DEFAULT_MAX_CONNECTIONS = 10_000;
/** Default ping/pong interval; a socket that misses one round-trip is terminated. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

export type GameWsServerOptions = HostRouterOptions & {
  server?: HttpServer;
  port?: number;
  path?: string;
  /** Per-message payload cap in bytes. Defaults to {@link DEFAULT_MAX_PAYLOAD_BYTES}. */
  maxPayloadBytes?: number;
  /** Max concurrent sockets accepted; connections beyond this are closed immediately. Defaults to {@link DEFAULT_MAX_CONNECTIONS}. */
  maxConnections?: number;
  /** Ping/pong heartbeat interval in ms; a socket that misses a round-trip is terminated. Defaults to {@link DEFAULT_HEARTBEAT_INTERVAL_MS}. */
  heartbeatIntervalMs?: number;
};

export type GameWsServer = {
  wss: WebSocketServer;
  port: () => number;
  rewind: (args: { serverId: string; atMs: number }) => RewoundPosition[];
  close: () => Promise<void>;
};

type HeartbeatSocket = WebSocket & { isAlive?: boolean };

export function createGameWsServer(options: GameWsServerOptions): GameWsServer {
  const router = createHostRouter(options);
  const maxPayload = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

  const wss =
    options.server !== undefined
      ? new WebSocketServer({ server: options.server, path: options.path, maxPayload })
      : new WebSocketServer({ port: options.port ?? 0, path: options.path, maxPayload });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const socket = client as HeartbeatSocket;
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, heartbeatIntervalMs);
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (socket: HeartbeatSocket) => {
    if (wss.clients.size > maxConnections) {
      socket.close(1013, "Server at capacity");
      return;
    }

    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    const connection = router.connect({
      send: (data) => {
        if (socket.readyState !== socket.OPEN) return;
        socket.send(data);
      },
      close: () => socket.close(),
    });

    socket.on("message", (raw) => connection.handleRaw(raw.toString()));
    socket.on("close", () => connection.close());
  });

  return {
    wss,
    port: () => {
      const address = wss.address();
      if (address === null || typeof address === "string") {
        throw new Error("WebSocket server has no bound port");
      }
      return address.port;
    },
    rewind: router.rewind,
    close: () =>
      new Promise((resolve) => {
        clearInterval(heartbeat);
        router.close();
        for (const client of wss.clients) {
          client.terminate();
        }
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        wss.close(finish);
        setTimeout(finish, 500);
      }),
  };
}
