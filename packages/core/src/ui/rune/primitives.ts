import { live, readLive, type Live, type LiveValue } from "../liveValue";
import type { RuneColor, RuneFont, RuneStyle } from "./element";
import { createModalStack, type ModalStack } from "../../dialog/modalStack";
import { easeOutCubic } from "../../anim/easing";
import { suspendPlayControls } from "../../game/controlGate";
import type { GameContext } from "../../runtime/gameContext";

/** Game-owned tokens and variants. No widget or game vocabulary lives here. */
export interface RuneTheme {
  colors: Readonly<Record<string, RuneColor>>;
  text: Readonly<Record<string, RuneFont>>;
  variants: Readonly<Record<string, RuneStyle>>;
  motion: { duration: number; distance: number; bounce: number };
}

/** A subscribed collection; expose a bounded slice for large worlds or lists. */
export interface RuneSource<T> {
  read(): readonly T[];
  subscribe(change: () => void): () => void;
}

/** Bind any native visual property without scheduling a component render. */
export function bind<T>(read: () => T): LiveValue<T> { return live(read); }

/** Format a bound value at its leaf, including locale-aware game formatters. */
export function runeFormat<T>(value: Live<T>, format: (value: T) => string): LiveValue<string> {
  return live(() => format(readLive(value)));
}

/** A finite display tween. Reading changes the display value, never the source. */
export function runeTween(read: () => number, duration: number, now: () => number = () => performance.now()): LiveValue<number> {
  let target = read(), from = target, at = now();
  return live(() => {
    const time = now(), next = read();
    if (!Number.isFinite(next)) throw new Error("Rune tween needs a finite target");
    const shown = from + (target - from) * easeOutCubic(Math.min(1, Math.max(0, (time - at) / Math.max(1, duration))));
    if (next !== target) { from = shown; target = next; at = time; }
    return duration <= 0 ? target : shown;
  });
}

/** A value-change pulse that returns to zero; compose it into scale, opacity or offset. */
export function runePulse(read: () => unknown, duration: number, now: () => number = () => performance.now()): LiveValue<number> {
  let previous = read(), changed = -Infinity;
  return live(() => {
    const next = read(), time = now();
    if (!Object.is(next, previous)) { previous = next; changed = time; }
    return Math.max(0, 1 - (time - changed) / Math.max(1, duration));
  });
}

/** What a route owns while present; appearance is always the game's composition. */
export interface RuneRoute {
  layer: "screen" | "modal" | "overlay";
  pause: boolean;
  capture: boolean;
}

/** Observable flow over the shared modal-stack model, including save/restore. */
export interface RuneFlow {
  routes: Readonly<Record<string, RuneRoute>>;
  read(): readonly { id: string; kind: string; payload?: unknown }[];
  subscribe(change: () => void): () => void;
  push(kind: string, payload?: unknown): void;
  pop(): void;
  replace(kind: string, payload?: unknown): void;
  clear(): void;
  snapshot: ModalStack["snapshot"];
  restore: ModalStack["restore"];
}

/** Compose screen/modal/overlay policy on the existing serializable stack primitive. */
export function createRuneFlow(routes: RuneFlow["routes"]): RuneFlow {
  const model = createModalStack();
  let records = model.stack();
  const listeners = new Set<() => void>();
  model.subscribe(() => { records = model.stack(); for (const listener of listeners) listener(); });
  const push = (kind: string, payload?: unknown) => {
    if (routes[kind] === undefined) throw new Error(`Unknown Rune route: ${kind}`);
    model.push({ kind, ...(payload === undefined ? {} : { payload }) });
  };
  return { routes, read: () => records,
    subscribe(change) { listeners.add(change); return () => { listeners.delete(change); }; },
    push, pop: () => { model.pop(); }, replace(kind, payload) {
      if (routes[kind] === undefined) throw new Error(`Unknown Rune route: ${kind}`);
      model.replace({kind,...(payload === undefined ? {} : {payload})});
    },
    clear: () => model.clear(), snapshot: model.snapshot,
    restore(snapshot) {
      for (const entry of snapshot.entries) if (routes[entry.record.kind] === undefined) throw new Error(`Unknown Rune route: ${entry.record.kind}`);
      model.restore(snapshot);
    },
  };
}

const pauseOwners = new WeakMap<GameContext, { count: number; wasPaused: boolean }>();
/** Lease pause and control capture from a flow. Nested owners release only their own claims. */
export function ownRuneFlow(flow: RuneFlow, ctx: GameContext): () => void {
  let releaseCapture: (() => void) | undefined;
  let ownsPause = false;
  let disposed = false;
  const update = () => {
    const routes = flow.read().map(entry => flow.routes[entry.kind]);
    const capture = routes.some(route => route?.capture);
    const pause = routes.some(route => route?.pause);
    if (capture && releaseCapture === undefined) releaseCapture = suspendPlayControls(ctx);
    if (!capture) { releaseCapture?.(); releaseCapture = undefined; }
    if (pause && !ownsPause) {
      const owners = pauseOwners.get(ctx) ?? { count: 0, wasPaused: ctx.time.isPaused() };
      owners.count++; pauseOwners.set(ctx, owners); ctx.time.pause(); ownsPause = true;
    }
    if (!pause && ownsPause) {
      const owners = pauseOwners.get(ctx);
      if (owners !== undefined && --owners.count === 0) { if (!owners.wasPaused) ctx.time.play(); pauseOwners.delete(ctx); }
      ownsPause = false;
    }
  };
  const unsubscribe = flow.subscribe(update);
  update();
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe(); releaseCapture?.();
    if (ownsPause) {
      const owners = pauseOwners.get(ctx);
      if (owners !== undefined && --owners.count === 0) { if (!owners.wasPaused) ctx.time.play(); pauseOwners.delete(ctx); }
      ownsPause = false;
    }
  };
}

/** Named viewport classes for responsive native layout. */
export type RuneViewportClass = "phone" | "tablet" | "desktop";

/** Deterministic viewport classification; callers can retune both breakpoints. */
export function runeViewportClass(width: number, phone = 600, tablet = 1000): RuneViewportClass {
  return width < phone ? "phone" : width < tablet ? "tablet" : "desktop";
}
