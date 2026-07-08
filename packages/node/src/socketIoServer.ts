import { createHostRouter, type HostRouterOptions, type RewoundPosition } from "@jgengine/ws/hostRouter";

export type { RewoundPosition };

export type SocketIoLikeServerSocket = {
  on: (event: string, listener: (payload: string) => void) => unknown;
  send: (data: string) => unknown;
  disconnect: (close?: boolean) => unknown;
};

export type SocketIoLikeServer = {
  on: (event: "connection", listener: (socket: SocketIoLikeServerSocket) => void) => unknown;
};

export type GameSocketIoServerOptions = HostRouterOptions & { io: SocketIoLikeServer };

export type GameSocketIoServer = {
  rewind: (args: { serverId: string; atMs: number }) => RewoundPosition[];
  close: () => void;
};

export function attachGameSocketIoServer(options: GameSocketIoServerOptions): GameSocketIoServer {
  const router = createHostRouter(options);

  options.io.on("connection", (socket) => {
    const connection = router.connect({
      send: (data) => socket.send(data),
      close: () => socket.disconnect(true),
    });

    socket.on("message", (raw) => connection.handleRaw(raw));
    socket.on("disconnect", () => connection.close());
  });

  return {
    rewind: router.rewind,
    close: () => router.close(),
  };
}
