import { INPUT_COMMAND, type InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import type { LiveGameBackend, TransportRunCommandResult } from "@jgengine/core/runtime/transport";

/** Where the local player's per-frame input goes: discarded in single-player, sent to the authoritative host under `authority: "server"`. */
export interface InputSink {
  send(frame: InputFrame): void;
}

/** Discards input — the single-player / client-authoritative default, where the client integrates movement itself.
 * @internal
 */
export function noopInputSink(): InputSink {
  return { send() {} };
}

interface RemoteInputSource {
  pending: InputFrame | null;
  inFlight: boolean;
}

const remoteInputSources = new Map<string, RemoteInputSource>();

function remoteInputSourceFor(serverId: string): RemoteInputSource {
  let source = remoteInputSources.get(serverId);
  if (source === undefined) {
    source = { pending: null, inFlight: false };
    remoteInputSources.set(serverId, source);
  }
  return source;
}

function monotonicInputSeq(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function pumpRemoteInput(
  backend: Pick<LiveGameBackend, "transport">,
  serverId: string,
  source: RemoteInputSource,
): void {
  if (source.inFlight) return;
  const frame = source.pending;
  if (frame === null) {
    remoteInputSources.delete(serverId);
    return;
  }
  source.pending = null;
  source.inFlight = true;
  const seq = monotonicInputSeq();
  void backend.transport
    .runCommand({ serverId, command: INPUT_COMMAND, input: { ...frame, seq } })
    .then((result: TransportRunCommandResult) => {
      if (!result.ok) {
        console.warn(`[jgengine:input] frame seq=${seq} to server "${serverId}" rejected: ${result.reason}`);
      }
    })
    .catch((error: unknown) => {
      console.warn(`[jgengine:input] frame seq=${seq} to server "${serverId}" failed to send`, error);
    })
    .finally(() => {
      source.inFlight = false;
      pumpRemoteInput(backend, serverId, source);
    });
}

/**
 * Sends each frame's input to the authoritative host over the transport, reusing the `runCommand` path via
 * {@link INPUT_COMMAND}. Sends are sequenced one-in-flight-at-a-time per `serverId` and stamped with a monotonic
 * seq: a frame sent while one is already in flight replaces the pending frame rather than racing it, so the
 * latest intent always wins and a stale frame can never resolve after (and overwrite) a newer one.
 * @internal
 */
export function remoteInputSink(backend: Pick<LiveGameBackend, "transport">, serverId: string): InputSink {
  return {
    send(frame) {
      const source = remoteInputSourceFor(serverId);
      source.pending = frame;
      pumpRemoteInput(backend, serverId, source);
    },
  };
}

/** The sink a server-authoritative shell sends its per-frame input through: remote when `authority: "server"` and a server is joined, a no-op otherwise.
 * @internal
 */
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

/** Whether two input frames carry identical intent — the shell skips resending unchanged frames so a still player floods the host with nothing.
 * @internal
 */
export function inputFramesEqual(a: InputFrame, b: InputFrame): boolean {
  if (a.held.length !== b.held.length) return false;
  for (let i = 0; i < a.held.length; i++) if (a.held[i] !== b.held[i]) return false;
  const aa = a.analog ?? null;
  const ba = b.analog ?? null;
  if (aa === null || ba === null) {
    if (aa !== ba) return false;
  } else {
    const keys = Object.keys(aa);
    if (keys.length !== Object.keys(ba).length) return false;
    for (const key of keys) if (aa[key] !== ba[key]) return false;
  }
  const pa = a.pointer;
  const pb = b.pointer;
  if (pa === null || pb === null) return pa === pb;
  return pa.x === pb.x && pa.y === pb.y && pa.active === pb.active;
}
