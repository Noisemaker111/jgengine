/**
 * Measurement for elements drawn through Rune. Such an element is never laid out
 * by the browser, so `getBoundingClientRect`, `offsetWidth` and `ResizeObserver`
 * would all report nothing. Once installed, those answer from where Rune laid the
 * element out; every other element keeps the browser's own answer.
 */

import type { RuneScrollValues } from "../runeUi.view";

type Rect = readonly [number, number, number, number];

export interface RuneScrollDriver {
  scroll(element: Element, x: number, y: number, smooth: boolean): void;
}

interface ScrollInfo {
  left: number; top: number; width: number; height: number;
  contentWidth: number; contentHeight: number; known: boolean;
}

const rects = new WeakMap<Element, Rect>();
const layoutRects = new WeakMap<Element, Rect>();
const scrolls = new WeakMap<Element, ScrollInfo>();
const scrollEvents = new Set<Element>();
const reveals = new Map<Element, ScrollIntoViewOptions>();
let revealQueued = false;
let scrollDriver: RuneScrollDriver | null = null;
const watchers = new WeakMap<Element, Set<RuneResizeObserver>>();
let installed = false;
let NativeResizeObserver: typeof ResizeObserver | null = null;

function inRuneLayer(element: Element): boolean {
  return element.closest("[data-jg-rune-layer]") !== null;
}

/** Record painted bounds for hit testing and layout bounds for size/resize APIs (CSS pixels). */
export function setRuneRect(element: Element, rect: Rect, layout: Rect): void {
  const before = layoutRects.get(element);
  rects.set(element, rect);
  layoutRects.set(element, layout);
  queueReveals();
  if (before !== undefined && Math.abs(before[2] - layout[2]) < 0.01 && Math.abs(before[3] - layout[3]) < 0.01) return;
  const observing = watchers.get(element);
  if (observing !== undefined) for (const observer of observing) observer.queue(element);
}

export function runeRectOf(element: Element): Rect | undefined {
  return rects.get(element);
}

function notifyScroll(element: Element): void {
  if (scrollEvents.has(element)) return;
  scrollEvents.add(element);
  queueMicrotask(() => {
    scrollEvents.delete(element);
    element.dispatchEvent(new Event("scroll"));
  });
}

/** Native scroll position and extents; components read these without state updates. */
export function setRuneScroll(element: Element, values: RuneScrollValues): void {
  const [left, top, width, height, contentWidth, contentHeight] = values;
  const before = scrolls.get(element);
  scrolls.set(element, { left, top, width, height, contentWidth, contentHeight, known: true });
  if (before === undefined ? left !== 0 || top !== 0 : before.left !== left || before.top !== top) notifyScroll(element);
  queueReveals();
}

function moveScroll(element: Element, left: number, top: number, smooth: boolean): [number, number] {
  const rect = layoutRects.get(element);
  const info = scrolls.get(element) ?? { left: 0, top: 0, width: rect?.[2] ?? 0, height: rect?.[3] ?? 0, contentWidth: 0, contentHeight: 0, known: false };
  const finite = (value: number): number => Number.isFinite(Number(value)) ? Number(value) : 0;
  const x = Math.max(0, Math.min(finite(left), info.known ? Math.max(0, info.contentWidth - info.width) : Infinity));
  const y = Math.max(0, Math.min(finite(top), info.known ? Math.max(0, info.contentHeight - info.height) : Infinity));
  const delta: [number, number] = [x - info.left, y - info.top];
  if (info.known && delta[0] === 0 && delta[1] === 0) return delta;
  if (!smooth) {
    info.left = x; info.top = y;
    scrolls.set(element, info);
    if (delta[0] !== 0 || delta[1] !== 0) notifyScroll(element);
  }
  scrollDriver?.scroll(element, x, y, smooth);
  return delta;
}

function revealDelta(start: number, size: number, viewport: number, align: ScrollLogicalPosition): number {
  if (align === "start") return start;
  if (align === "end") return start + size - viewport;
  if (align === "center") return start + (size - viewport) / 2;
  if (start < 0 && start + size > viewport) return 0;
  return start < 0 ? start : Math.max(0, start + size - viewport);
}

function queueReveals(): void {
  if (reveals.size === 0 || revealQueued) return;
  revealQueued = true;
  queueMicrotask(() => {
    revealQueued = false;
    for (const [element, options] of reveals) {
      if (!element.isConnected) { reveals.delete(element); continue; }
      const rect = layoutRects.get(element);
      if (rect === undefined) continue;
      reveals.delete(element);
      let x = rect[0], y = rect[1];
      for (let parent = element.parentElement; parent !== null && inRuneLayer(parent); parent = parent.parentElement) {
        const info = scrolls.get(parent);
        const bounds = layoutRects.get(parent);
        if (info === undefined || bounds === undefined) continue;
        const dx = revealDelta(x - bounds[0], rect[2], info.width, options.inline ?? "nearest");
        const dy = revealDelta(y - bounds[1], rect[3], info.height, options.block ?? "start");
        const moved = moveScroll(parent, info.left + dx, info.top + dy, options.behavior === "smooth");
        x -= moved[0]; y -= moved[1];
      }
    }
  });
}

const pending = new Set<RuneResizeObserver>();
let flushQueued = false;

function flushObservers(): void {
  flushQueued = false;
  const batch = [...pending];
  pending.clear();
  for (const observer of batch) observer.deliver();
}

class RuneResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly native: ResizeObserver | null;
  private readonly mirrored = new Set<Element>();
  private readonly changed = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    this.native = NativeResizeObserver === null ? null : new NativeResizeObserver((entries, _observer) => callback(entries, this));
  }

  observe(target: Element, options?: ResizeObserverOptions): void {
    if (!inRuneLayer(target)) {
      this.native?.observe(target, options);
      return;
    }
    this.mirrored.add(target);
    let set = watchers.get(target);
    if (set === undefined) {
      set = new Set();
      watchers.set(target, set);
    }
    set.add(this);
    // A new observation always reports once, as the browser's does.
    this.queue(target);
  }

  unobserve(target: Element): void {
    this.native?.unobserve(target);
    this.mirrored.delete(target);
    this.changed.delete(target);
    watchers.get(target)?.delete(this);
  }

  disconnect(): void {
    this.native?.disconnect();
    for (const target of this.mirrored) watchers.get(target)?.delete(this);
    this.mirrored.clear();
    this.changed.clear();
  }

  queue(target: Element): void {
    this.changed.add(target);
    pending.add(this);
    if (flushQueued) return;
    flushQueued = true;
    requestAnimationFrame(flushObservers);
  }

  deliver(): void {
    if (this.changed.size === 0) return;
    const entries: ResizeObserverEntry[] = [];
    for (const target of this.changed) {
      if (!this.mirrored.has(target)) continue;
      const rect = layoutRects.get(target) ?? [0, 0, 0, 0];
      const size = [{ inlineSize: rect[2], blockSize: rect[3] }];
      entries.push({ target, contentRect: new DOMRect(0, 0, rect[2], rect[3]), borderBoxSize: size, contentBoxSize: size, devicePixelContentBoxSize: size });
    }
    this.changed.clear();
    if (entries.length > 0) this.callback(entries, this);
  }
}

function patchGetter(proto: object, name: string, read: (rect: Rect) => number): void {
  const descriptor = Object.getOwnPropertyDescriptor(proto, name);
  const original = descriptor?.get;
  if (descriptor === undefined || original === undefined) return;
  Object.defineProperty(proto, name, {
    ...descriptor,
    get(this: Element) {
      const scroll = scrolls.get(this);
      if (scroll?.known === true) {
        if (name === "scrollWidth") return Math.ceil(scroll.contentWidth);
        if (name === "scrollHeight") return Math.ceil(scroll.contentHeight);
        if (name === "clientWidth") return Math.round(scroll.width);
        if (name === "clientHeight") return Math.round(scroll.height);
      }
      const rect = layoutRects.get(this);
      return rect === undefined ? (original.call(this) as number) : read(rect);
    },
  });
}

/** Make measurement of Rune-drawn elements answer from Rune's layout. Safe to call again. */
export function installRuneMeasure(driver: RuneScrollDriver): void {
  scrollDriver = driver;
  if (installed || typeof Element === "undefined") return;
  installed = true;
  const originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element): DOMRect {
    const rect = rects.get(this);
    return rect === undefined ? originalRect.call(this) : new DOMRect(rect[0], rect[1], rect[2], rect[3]);
  };
  for (const name of ["offsetWidth", "clientWidth", "scrollWidth"]) {
    patchGetter(HTMLElement.prototype, name, (rect) => Math.round(rect[2]));
    if (name !== "offsetWidth") patchGetter(Element.prototype, name, (rect) => Math.round(rect[2]));
  }
  for (const name of ["offsetHeight", "clientHeight", "scrollHeight"]) {
    patchGetter(HTMLElement.prototype, name, (rect) => Math.round(rect[3]));
    if (name !== "offsetHeight") patchGetter(Element.prototype, name, (rect) => Math.round(rect[3]));
  }
  for (const name of ["scrollLeft", "scrollTop"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, name);
    if (descriptor === undefined) continue;
    Object.defineProperty(Element.prototype, name, {
      ...descriptor,
      get(this: Element) {
        const info = scrolls.get(this);
        return info === undefined ? descriptor.get?.call(this) ?? 0 : name === "scrollLeft" ? info.left : info.top;
      },
      set(this: Element, value: number) {
        if (!inRuneLayer(this)) { descriptor.set?.call(this, value); return; }
        const info = scrolls.get(this);
        moveScroll(this, name === "scrollLeft" ? value : info?.left ?? 0, name === "scrollTop" ? value : info?.top ?? 0, false);
      },
    });
  }
  for (const name of ["scrollTo", "scrollBy"] as const) {
    const original = Element.prototype[name];
    Element.prototype[name] = function scroll(this: Element, first?: ScrollToOptions | number, second?: number): void {
      if (!inRuneLayer(this)) {
        const run = original.bind(this);
        if (typeof first === "number") run(first, second ?? 0);
        else run(first);
        return;
      }
      const options = typeof first === "number" ? { left: first, top: second ?? 0 } : first ?? {};
      const info = scrolls.get(this);
      const relative = name === "scrollBy";
      moveScroll(this,
        relative ? (info?.left ?? 0) + (options.left ?? 0) : options.left ?? info?.left ?? 0,
        relative ? (info?.top ?? 0) + (options.top ?? 0) : options.top ?? info?.top ?? 0,
        options.behavior === "smooth");
    };
  }
  const originalReveal = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element, options?: boolean | ScrollIntoViewOptions): void {
    if (!inRuneLayer(this)) { originalReveal.call(this, options); return; }
    reveals.set(this, typeof options === "boolean" ? { block: options ? "start" : "end" } : options ?? {});
    queueReveals();
  };
  if (typeof ResizeObserver !== "undefined") {
    NativeResizeObserver = ResizeObserver;
    (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = RuneResizeObserver;
  }
}
