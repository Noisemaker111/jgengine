/** @jsxImportSource @jgengine/core/ui/jsx */
import { createElement, useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactElement, type ReactNode } from "@jgengine/core/ui/jsx";
import type { HTMLAttributes } from "@jgengine/core/ui/jsx/dom.view";
import { memoView } from "./memoView.view";
import { isLive, readLive, type Live } from "./liveValue";

/*
 * Live values. A HUD number, bar or dial that moves every frame or tick updates its own DOM node
 * from one shared animation-frame loop and never goes through UI state: the component showing it
 * renders once, and each frame its binding reads the value and writes the node only when it changed.
 * A value that changes at a discrete moment (an item picked up, a panel opened) re-renders only the
 * smallest component showing it, through `useStore` / `useGameStore` with a selector. Nothing
 * re-renders a whole HUD because one number moved.
 */

type FrameSubscriber = () => void;

const subscribers = new Set<FrameSubscriber>();
const boundElements = new WeakMap<Element, number>();

/** Whether a shared frame binding writes this element. Rune routes its live text through value slots. @internal */
export function isFrameBoundElement(element: Element): boolean {
  return boundElements.has(element);
}
let sharedRaf = 0;

/** The frame the shared loop is running now, or -1 outside it. */
let runningFrame = -1;
let frameCount = 0;

function sharedTick(): void {
  sharedRaf = 0;
  runningFrame = frameCount;
  frameCount += 1;
  for (const subscriber of subscribers) subscriber();
  runningFrame = -1;
  if (subscribers.size > 0 && typeof requestAnimationFrame !== "undefined") sharedRaf = requestAnimationFrame(sharedTick);
}

/**
 * Wrap a costly read that several live bindings share (a snapshot, a view of the race) so it runs once
 * per frame: inside the shared loop every caller in the same frame gets the same result; outside it
 * (a render) it reads fresh.
 *
 * ```tsx
 * const hud = useMemo(() => perFrame(() => raceHud(session.snapshot())), [session]);
 * <LiveText get={() => Math.round(hud().dash.kmh)} />
 * ```
 */
export function perFrame<T>(read: () => T): () => T {
  let cached: { frame: number; value: T } | null = null;
  return () => {
    if (runningFrame < 0) return read();
    if (cached === null || cached.frame !== runningFrame) cached = { frame: runningFrame, value: read() };
    return cached.value;
  };
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
 * current. JSX may set the starting value of what `apply` writes: the binding writes again after every render of its component.
 *
 * ```tsx
 * const bar = useRef<HTMLElement>(null);
 * useFrameBind(bar, () => Math.round(air(ctx) * 200) / 200, (fraction, el) => el.style.setProperty("--fill", `${fraction * 100}%`));
 * ```
 *
 * @capability live-value write a per-frame HUD value (text, bar, dial, colour) straight to its DOM node, never through UI state
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
  const written = useRef<{ value: T; element: E } | null>(null);
  const bound = useRef<E | null>(null);
  const unmark = (): void => {
    if (bound.current === null) return;
    const count = boundElements.get(bound.current) ?? 0;
    if (count <= 1) boundElements.delete(bound.current);
    else boundElements.set(bound.current, count - 1);
    bound.current = null;
  };
  const run = useRef(() => {
    const element = ref.current;
    if (bound.current !== element) {
      unmark();
      if (element !== null) {
        bound.current = element;
        boundElements.set(element, (boundElements.get(element) ?? 0) + 1);
      }
    }
    if (element === null) return;
    const value = getRef.current();
    const last = written.current;
    if (last !== null && last.element === element && isEqualRef.current(last.value, value)) return;
    written.current = { value, element };
    applyRef.current(value, element);
  });
  // After any render of the host, write again: JSX may have put a render-time value on the same property.
  useLayoutEffect(() => {
    written.current = null;
    run.current();
  });
  useLayoutEffect(() => {
    const stop = subscribeFrameBind(() => run.current());
    return () => {
      stop();
      unmark();
    };
  }, []);
}

/** Inline and block elements a live text can be. */
export type LiveTextTag = "span" | "b" | "strong" | "small" | "em" | "i" | "div" | "p" | "dd" | "dt" | "td" | "output" | "text" | "tspan";

/** Props for {@link LiveText}. */
export interface LiveTextProps<T> extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Read once per frame. */
  get: () => T;
  /** The text for a value. Default `String(value)`. */
  format?(value: T): string;
  as?: LiveTextTag;
}

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
export const LiveText: <T>(props: LiveTextProps<T>) => ReactNode = memoView("LiveText", function LiveText({ get, format, as = "span", ...attributes }: LiveTextProps<unknown>): ReactElement {
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
}, { readLater: ["get", "format"] });
