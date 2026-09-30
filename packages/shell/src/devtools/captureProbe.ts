import type { GameContext } from "@jgengine/core/runtime/gameContext";

type Sample = { t: number; metrics: Record<string, number> };
type Listener = (sample: Sample) => void;
type Subscribe = (listener: Listener, minimumSpacingMs?: number) => () => void;
type ProbeTarget = {
  __jgProbe?: () => Record<string, number>;
  __jgSubscribeProbe?: Subscribe;
  dispatchEvent?: (event: Event) => boolean;
};

const publishers = new WeakMap<GameContext, () => void>();

/** Expose declared probe metrics to capture hosts on actual state and native frame events. @internal */
export function installCaptureProbe(
  ctx: GameContext,
  probe: (ctx: GameContext) => Record<string, number>,
  target: ProbeTarget,
  now: () => number = () => performance.now(),
): () => void {
  const previousRead = target.__jgProbe;
  const previousSubscribe = target.__jgSubscribeProbe;
  const listeners = new Map<Listener, { last: number; spacing: number }>();
  const read = () => {
    const metrics: Record<string, number> = {};
    try {
      for (const [key, value] of Object.entries(probe(ctx))) {
        if (typeof value === "number" && Number.isFinite(value)) metrics[key] = value;
      }
    } catch {
      // A broken probe must not interrupt the game loop.
    }
    return metrics;
  };
  const publish = () => {
    if (listeners.size === 0) return;
    const t = now();
    let sample: Sample | undefined;
    for (const [listener, state] of listeners) {
      if (t - state.last < state.spacing) continue;
      state.last = t;
      sample ??= { t, metrics: read() };
      try { listener(sample); } catch { /* Capture consumers cannot interrupt gameplay. */ }
    }
  };
  const subscribe: Subscribe = (listener, minimumSpacingMs = 0) => {
    listeners.set(listener, {
      last: Number.NEGATIVE_INFINITY,
      spacing: Number.isFinite(minimumSpacingMs) ? Math.max(0, minimumSpacingMs) : 0,
    });
    publish();
    return () => { listeners.delete(listener); };
  };
  target.__jgProbe = read;
  target.__jgSubscribeProbe = subscribe;
  publishers.set(ctx, publish);
  const unsubscribe = ctx.subscribe(publish);
  target.dispatchEvent?.(new Event("jgengine:capture-probe-ready"));
  return () => {
    unsubscribe();
    listeners.clear();
    if (publishers.get(ctx) === publish) publishers.delete(ctx);
    if (target.__jgProbe === read) {
      if (previousRead === undefined) delete target.__jgProbe;
      else target.__jgProbe = previousRead;
    }
    if (target.__jgSubscribeProbe === subscribe) {
      if (previousSubscribe === undefined) delete target.__jgSubscribeProbe;
      else target.__jgSubscribeProbe = previousSubscribe;
    }
  };
}

/** Publish after a native simulation frame; idle when no capture listener is attached. @internal */
export function publishCaptureProbe(ctx: GameContext): void {
  publishers.get(ctx)?.();
}
