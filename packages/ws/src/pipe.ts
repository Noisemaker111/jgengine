/** One transport message: JSON text, or bytes from the binary codec. */
export type TransportData = string | Uint8Array<ArrayBuffer>;

export type TransportPipe = {
  send: (data: TransportData) => void;
  close: () => void;
};

export type TransportPipeHandlers = {
  onOpen: () => void;
  onMessage: (data: string | Uint8Array) => void;
  onClose: () => void;
};

export type TransportPipeFactory = (handlers: TransportPipeHandlers) => TransportPipe;

const OPEN = 1;

export function webSocketPipe(
  url: string,
  webSocketFactory: (url: string) => WebSocket = (target) => new WebSocket(target),
): TransportPipeFactory {
  return (handlers) => {
    const socket = webSocketFactory(url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => handlers.onOpen();
    socket.onmessage = (event) =>
      handlers.onMessage(
        typeof event.data === "string"
          ? event.data
          : event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : ArrayBuffer.isView(event.data)
              ? new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
              : String(event.data),
      );
    socket.onclose = () => handlers.onClose();
    return {
      send: (data) => {
        if (socket.readyState !== OPEN) return;
        socket.send(data);
      },
      close: () => socket.close(),
    };
  };
}
