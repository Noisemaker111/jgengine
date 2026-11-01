import type { FrameTimePercentiles } from "./frameTimeWindow";

/** One runtime-health event; `at` is the injected clock's ms. */
export type TelemetryEvent =
  | { kind: "session_start"; at: number; game: string; build: string; tier: string }
  | { kind: "load"; at: number; name: string; ms: number }
  | { kind: "tier_change"; at: number; from: string; to: string; reason: "auto" | "player" }
  | ({ kind: "frame_percentiles"; at: number; tier: string } & FrameTimePercentiles)
  | { kind: "crash"; at: number; id: string; phase: string };

/** The injected receiver. A game wires its own transport; the engine never sends anywhere itself. */
export interface TelemetrySink {
  send(batch: readonly TelemetryEvent[]): void | Promise<void>;
}

/** Tunables and injected dependencies for {@link createTelemetry}. */
export interface TelemetryOptions {
  /** Off when absent: every call is a no-op and nothing is queued. */
  sink?: TelemetrySink | undefined;
  /** Events per `send`; one async `send` is in flight at a time, so a slow sink backs events up to `maxQueued`. Default 20. */
  batchSize?: number;
  /** Most events held while unsent; the oldest are dropped past it. Default 200. */
  maxQueued?: number;
  now?: () => number;
}

/** Queue state for tests and devtools. */
export interface TelemetryState {
  enabled: boolean;
  queued: number;
  dropped: number;
  sent: number;
}

/** A batched, bounded event queue in front of the game's sink. */
export interface Telemetry {
  readonly enabled: boolean;
  sessionStart(game: string, build: string, tier: string): void;
  load(name: string, ms: number): void;
  tierChange(from: string, to: string, reason: "auto" | "player"): void;
  framePercentiles(tier: string, percentiles: FrameTimePercentiles): void;
  crash(id: string, phase: string): void;
  /** Send everything queued now, in batches. */
  flush(): void;
  snapshot(): TelemetryState;
  reset(): void;
}

/** Build the event queue; with no sink it is a set of no-ops, so telemetry stays off unless a game supplies one. */
export function createTelemetry(options: TelemetryOptions = {}): Telemetry {
  const sink = options.sink;
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 20));
  const maxQueued = Math.max(batchSize, Math.floor(options.maxQueued ?? 200));
  const now = options.now ?? (() => Date.now());
  const queue: TelemetryEvent[] = [];
  let dropped = 0;
  let sent = 0;
  let inFlight = false;

  function deliver(batch: TelemetryEvent[]): void {
    if (sink === undefined) return;
    sent += batch.length;
    try {
      const result = sink.send(batch);
      if (result instanceof Promise) {
        inFlight = true;
        const settle = () => {
          inFlight = false;
          if (queue.length >= batchSize) deliver(queue.splice(0, batchSize));
        };
        result.then(settle, settle);
      }
    } catch {
      /* a failing sink must not break play */
    }
  }

  function flush(): void {
    while (queue.length > 0) deliver(queue.splice(0, batchSize));
  }

  function push(event: TelemetryEvent): void {
    if (sink === undefined) return;
    if (queue.length >= maxQueued) {
      queue.shift();
      dropped += 1;
    }
    queue.push(event);
    if (queue.length >= batchSize && !inFlight) deliver(queue.splice(0, batchSize));
  }

  return {
    enabled: sink !== undefined,
    sessionStart: (game, build, tier) => push({ kind: "session_start", at: now(), game, build, tier }),
    load: (name, ms) => push({ kind: "load", at: now(), name, ms }),
    tierChange: (from, to, reason) => push({ kind: "tier_change", at: now(), from, to, reason }),
    framePercentiles: (tier, percentiles) => push({ kind: "frame_percentiles", at: now(), tier, ...percentiles }),
    crash: (id, phase) => push({ kind: "crash", at: now(), id, phase }),
    flush,
    snapshot: () => ({ enabled: sink !== undefined, queued: queue.length, dropped, sent }),
    reset() {
      queue.length = 0;
      dropped = 0;
      sent = 0;
    },
  };
}
