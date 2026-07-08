export type TransportPipe = {
  send: (data: string) => void;
  close: () => void;
};

export type TransportPipeHandlers = {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: () => void;
};

export type TransportPipeFactory = (handlers: TransportPipeHandlers) => TransportPipe;

export function webSocketPipe(
  url: string,
  webSocketFactory: (url: string) => WebSocket = (target) => new WebSocket(target),
): TransportPipeFactory {
  return (handlers) => {
    const socket = webSocketFactory(url);
    socket.onopen = () => handlers.onOpen();
    socket.onmessage = (event) =>
      handlers.onMessage(typeof event.data === "string" ? event.data : String(event.data));
    socket.onclose = () => handlers.onClose();
    return {
      send: (data) => {
        if (socket.readyState !== 1) return;
        socket.send(data);
      },
      close: () => socket.close(),
    };
  };
}
