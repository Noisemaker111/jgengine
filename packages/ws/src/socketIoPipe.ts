import { createWsBackend, type WsBackend, type WsBackendOptions } from "./createWsBackend";
import type { TransportPipeFactory } from "./pipe";

export type SocketIoLikeSocket = {
  connected: boolean;
  on: (event: string, listener: (payload: string) => void) => unknown;
  off: (event: string, listener: (payload: string) => void) => unknown;
  send: (data: string) => unknown;
  disconnect: () => unknown;
};

export function socketIoPipe(socket: SocketIoLikeSocket): TransportPipeFactory {
  return (handlers) => {
    let closed = false;

    const onConnect = () => {
      if (closed) return;
      handlers.onOpen();
    };
    const onMessage = (payload: string) => {
      if (closed) return;
      handlers.onMessage(typeof payload === "string" ? payload : String(payload));
    };
    const onDisconnect = () => {
      if (closed) return;
      handlers.onClose();
    };

    socket.on("connect", onConnect);
    socket.on("message", onMessage);
    socket.on("disconnect", onDisconnect);

    if (socket.connected) {
      queueMicrotask(() => {
        if (!closed) handlers.onOpen();
      });
    }

    return {
      send: (data) => {
        if (!socket.connected) return;
        socket.send(data);
      },
      close: () => {
        if (closed) return;
        closed = true;
        socket.off("connect", onConnect);
        socket.off("message", onMessage);
        socket.off("disconnect", onDisconnect);
      },
    };
  };
}

export type SocketIoBackendOptions = Omit<WsBackendOptions, "url" | "pipe" | "webSocketFactory"> & {
  socket: SocketIoLikeSocket;
};

export function createSocketIoBackend(options: SocketIoBackendOptions): WsBackend {
  const { socket, ...rest } = options;
  return createWsBackend({ ...rest, pipe: socketIoPipe(socket) });
}
