import { createElement, useCallback, useLayoutEffect, useRef, useSyncExternalStore, type HTMLAttributes, type ReactElement } from "react";

/*
 * Live values. A HUD number, bar or dial that moves every frame or tick updates its own DOM node
 * from one shared animation-frame loop and never goes through React state: the component showing it
 * renders once, and each frame its binding reads the value and writes the node only when it changed.
 * A value that changes at a discrete moment (an item picked up, a panel opened) re-renders only the
 * smallest component showing it, through `useStore` / `useGameStore` with a selector. Nothing
 * re-renders a whole HUD because one number moved.
 */

type FrameSubscriber = () => void;

const subscribers = new Set<FrameSubscriber>();
let sharedRaf = 0;

function sharedTick(): void {
  sharedRaf = 0;
  for (const subscriber of subscribers) subscriber();
  if (subscribers.size > 0 && typeof requestAnimationFrame !== "undefined") sharedRaf = requestAnimationFrame(sharedTick);
}

/** Run `subscriber` once per animation frame, on the one loop every live binding shares. */
export function subscribeFrameBind(subscriber: FrameSubscriber): () => void {
  subscribers.add(subscriber);
  if (sharedRaf === 0 && typeof requestAnimationFrame !== "undefined") sharedRaf = requestAnimationFrame(sharedTick);
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && sharedRaf !== 0 && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(sharedRaf);
      sharedRaf = 0;
    }
  };
}

const LIVE = Symbol.for("jgengine.live");

/** A value read fresh every frame instead of passed once: make one with {@link live}. */
export interface LiveValue<T> {
  readonly [LIVE]: true;
  get(): T;
}

/** A prop that takes either a plain value or a {@link live} one. Engine UI parts take `Live<number>` for anything that can move every frame. */
export type Live<T> = T | LiveValue<T>;

/**
 * A value an engine UI part reads every frame and draws into its own node, never through a React
 * render: `<KitMeter value={live(() => fuel(ctx))} max={100} />`. The getter may close over props; the
 * part always calls the newest one.
 *
 * @capability live-prop hand an engine UI part a value that moves every frame (a meter, a distance, a countdown) so only its own node updates
 */
export function live<T>(get: () => T): LiveValue<T> {
  return { [LIVE]: true, get };
}

/** True for a value made with {@link live}. */
export function isLive(value: unknown): value is LiveValue<unknown> {
  return typeof value === "object" && value !== null && Reflect.get(value, LIVE) === true;
}

/** The value now: a plain value as is, a {@link live} one read once. */
export function readLive<T>(value: Live<T>): T {
  return isLive(value) ? (value as LiveValue<T>).get() : (value as T);
}

const noFrames = (): (() => void) => () => undefined;

/**
 * What a component draws from a value that may be {@link live}: `select` runs on the current value,
 * and for a live one again every frame, and the component re-renders only when its result changes
 * (`isEqual`, default `Object.is`). Use it for the discrete part of a moving value (a deadline's
 * urgency stage, a meter's lit segment count) and draw the moving part with {@link LiveText} or
 * {@link useFrameBind}.
 */
export function useLiveSelect<T, S>(value: Live<T>, select: (value: T) => S, isEqual: (previous: S, next: S) => boolean = Object.is): S {
  const valueRef = useRef(value);
  valueRef.current = value;
  const selectRef = useRef(select);
  selectRef.current = select;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const cache = useRef<{ value: S } | null>(null);
  const getSnapshot = useCallback((): S => {
    const next = selectRef.current(readLive(valueRef.current));
    const last = cache.current;
    if (last !== null && isEqualRef.current(last.value, next)) return last.value;
    cache.current = { value: next };
    return next;
  }, []);
  return useSyncExternalStore(isLive(value) ? subscribeFrameBind : noFrames, getSnapshot, getSnapshot);
}

/** Live bindings currently on the loop. @internal */
export function frameBindSubscriberCount(): number {
  return subscribers.size;
}

/** Run every live binding now, as one frame would: a test steps the HUD with it. @internal */
export function flushFrameBinds(): void {
  for (const subscriber of subscribers) subscriber();
}

/**
 * Bind a value that changes every frame or tick to a DOM node without re-rendering anything. `get`
 * is read once per frame; `apply` writes the node (its text, a style, an attribute) before the first
 * paint and then on every frame whose value differs from the last one written (`isEqual`, default
 * `Object.is`). `get`, `apply` and `isEqual` are read fresh each frame, so closures over props stay
 * current. Do not also set what `apply` writes from JSX: React would put its own value back.
 *
 * ```tsx
 * const bar = useRef<HTMLElement>(null);
 * useFrameBind(bar, () => Math.round(air(ctx) * 200) / 200, (fraction, el) => el.style.setProperty("--fill", `${fraction * 100}%`));
 * ```
 *
 * @capability live-value write a per-frame HUD value (text, bar, dial, colour) straight to its DOM node, never through React state
 */
export function useFrameBind<T, E extends Element = Element>(
  ref: { current: E | null },
  get: () => T,
  apply: (value: T, element: E) => void,
  isEqual: (previous: T, next: T) => boolean = Object.is,
): void {
  const getRef = useRef(get);
  getRef.current = get;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  useLayoutEffect(() => {
    let written: { value: T; element: E } | null = null;
    const run = () => {
      const element = ref.current;
      if (element === null) return;
      const value = getRef.current();
      if (written !== null && written.element === element && isEqualRef.current(written.value, value)) return;
      written = { value, element };
      applyRef.current(value, element);
    };
    run();
    return subscribeFrameBind(run);
  }, [ref]);
}

/** Inline and block elements a live text can be. */
export type LiveTextTag = "span" | "b" | "strong" | "small" | "em" | "i" | "div" | "p" | "dd" | "dt" | "td" | "output" | "text" | "tspan";

/**
 * A text leaf for a value that changes every frame or tick: a counter, a timer, a distance. It
 * renders the current text once, then writes only its own text node when the formatted text changes;
 * its parent never re-renders for it. `as` makes the leaf the element itself (`<LiveText as="b">`), so
 * no wrapper is added.
 *
 * ```tsx
 * <LiveText as="strong" get={() => viewStore.read(ctx).dive?.oxygen ?? 0} format={(air) => String(Math.ceil(air))} />
 * ```
 *
 * @capability live-text a HUD number or label that updates its own text node every tick without re-rendering its component
 */
export function LiveText<T>({ get, format, as = "span", ...attributes }: {
  get: () => T;
  format?: (value: T) => string;
  as?: LiveTextTag;
} & Omit<HTMLAttributes<HTMLElement>, "children">): ReactElement {
  const ref = useRef<Element>(null);
  const formatRef = useRef(format);
  formatRef.current = format;
  const text = (): string => {
    const value = get();
    const shown = formatRef.current;
    return shown === undefined ? String(value) : shown(value);
  };
  useFrameBind(ref, text, (value, element) => {
    element.textContent = value;
  });
  return createElement(as, { ...attributes, ref }, text());
}
