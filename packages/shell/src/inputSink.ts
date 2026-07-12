import { INPUT_COMMAND, type InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import type { LiveGameBackend } from "@jgengine/core/runtime/transport";

/** Where the local player's per-frame input goes: discarded in single-player, sent to the authoritative host under `authority: "server"`. */
export interface InputSink {
  send(frame: InputFrame): void;
}

/** Discards input — the single-player / client-authoritative default, where the client integrates movement itself. */
export function noopInputSink(): InputSink {
  return { send() {} };
}

/** Sends each frame's input to the authoritative host over the transport, reusing the `runCommand` path via {@link INPUT_COMMAND}. */
export function remoteInputSink(backend: Pick<LiveGameBackend, "transport">, serverId: string): InputSink {
  return {
    send(frame) {
      void backend.transport
        .runCommand({ serverId, command: INPUT_COMMAND, input: frame })
        .catch(() => undefined);
    },
  };
}

/** The sink a server-authoritative shell sends its per-frame input through: remote when `authority: "server"` and a server is joined, a no-op otherwise. */
export function resolveInputSink(opts: {
  serverAuthoritative: boolean;
  backend: Pick<LiveGameBackend, "transport"> | null;
  serverId: string | null;
}): InputSink {
  if (opts.serverAuthoritative && opts.backend !== null && opts.serverId !== null) {
    return remoteInputSink(opts.backend, opts.serverId);
  }
  return noopInputSink();
}

/** Whether two input frames carry identical intent — the shell skips resending unchanged frames so a still player floods the host with nothing. */
export function inputFramesEqual(a: InputFrame, b: InputFrame): boolean {
  if (a.held.length !== b.held.length) return false;
  for (let i = 0; i < a.held.length; i++) if (a.held[i] !== b.held[i]) return false;
  const pa = a.pointer;
  const pb = b.pointer;
  if (pa === null || pb === null) return pa === pb;
  return pa.x === pb.x && pa.y === pb.y && pa.active === pb.active;
}
