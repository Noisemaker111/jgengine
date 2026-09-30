import { INPUT_COMMAND, type InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import type { LiveGameBackend, TransportRunCommandResult } from "@jgengine/core/runtime/transport";

/** Where the local player's per-frame input goes: discarded in single-player, sent to the authoritative host under `authority: "server"`. */
export interface InputSink {
  send(frame: InputFrame, options?: { urgent?: boolean }): void;
}

/** Discards input — the single-player / client-authoritative default, where the client integrates movement itself.
 * @internal
 */
export function noopInputSink(): InputSink {
  return { send() {} };
}

interface RemoteInputSource {
  pending: InputFrame | null;
  inFlight: object | null;
  latest: InputFrame | null;
}

const remoteInputSources = new WeakMap<LiveGameBackend["transport"], Map<string, RemoteInputSource>>();
let lastInputSeq = 0;

function remoteInputSourceFor(backend: Pick<LiveGameBackend, "transport">, serverId: string): RemoteInputSource {
  let sources = remoteInputSources.get(backend.transport);
  if (sources === undefined) {
    sources = new Map();
    remoteInputSources.set(backend.transport, sources);
  }
  let source = sources.get(serverId);
  if (source === undefined) {
    source = { pending: null, inFlight: null, latest: null };
    sources.set(serverId, source);
  }
  return source;
}

function monotonicInputSeq(): number {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return lastInputSeq = Math.max(now, lastInputSeq + 0.001);
}

function pumpRemoteInput(
  backend: Pick<LiveGameBackend, "transport">,
  serverId: string,
  source: RemoteInputSource,
): void {
  if (source.inFlight !== null) return;
  const frame = source.pending;
  if (frame === null) {
    remoteInputSources.get(backend.transport)?.delete(serverId);
    return;
  }
  source.pending = null;
  const owner = {};
  source.inFlight = owner;
  const seq = monotonicInputSeq();
  void backend.transport
    .runCommand({ serverId, command: INPUT_COMMAND, input: { ...frame, seq } })
    .then((result: TransportRunCommandResult) => {
      if (!result.ok) console.warn(`[jgengine:input] frame seq=${seq} to server "${serverId}" rejected: ${result.reason}`);
    })
    .catch((error: unknown) => {
      console.warn(`[jgengine:input] frame seq=${seq} to server "${serverId}" failed to send`, error);
    })
    .finally(() => {
      // An urgent discrete intent supersedes this flight. Its old completion must not
      // release the replacement's ACK gate or replay the superseded pending frame.
      if (source.inFlight !== owner) return;
      source.inFlight = null;
      pumpRemoteInput(backend, serverId, source);
    });
}

/** Coalesces continuous frames. Discrete release/reset intents bypass a pending ACK;
 * the host's monotonic sequence admission rejects any older input arriving afterwards.
 * @internal
 */
export function remoteInputSink(backend: Pick<LiveGameBackend, "transport">, serverId: string): InputSink {
  return {
    send(frame, options) {
      const source = remoteInputSourceFor(backend, serverId);
      if (source.latest !== null && inputFramesEqual(source.latest, frame)) return;
      const snapshot: InputFrame = {
        ...frame, held: [...frame.held],
        pointer: frame.pointer === null ? null : { ...frame.pointer },
        ...(frame.analog === undefined ? {} : { analog: frame.analog === null ? null : { ...frame.analog } }),
      };
      source.latest = snapshot;
      source.pending = snapshot;
      if (options?.urgent) source.inFlight = null;
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
