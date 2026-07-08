import type { Server as HttpServer } from "node:http";

import { WebSocketServer } from "ws";

import { createHostRouter, type HostRouterOptions, type RewoundPosition } from "@jgengine/ws/hostRouter";

export type { RewoundPosition };

export type GameWsServerOptions = HostRouterOptions & {
  server?: HttpServer;
  port?: number;
  path?: string;
};

export type GameWsServer = {
  wss: WebSocketServer;
  port: () => number;
  rewind: (args: { serverId: string; atMs: number }) => RewoundPosition[];
  close: () => Promise<void>;
};

export function createGameWsServer(options: GameWsServerOptions): GameWsServer {
  const router = createHostRouter(options);

  const wss =
    options.server !== undefined
      ? new WebSocketServer({ server: options.server, path: options.path })
      : new WebSocketServer({ port: options.port ?? 0, path: options.path });

  wss.on("connection", (socket) => {
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
