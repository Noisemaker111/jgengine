import { createElement, useLayoutEffect, useRef, type HTMLAttributes, type ReactElement } from "react";

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
