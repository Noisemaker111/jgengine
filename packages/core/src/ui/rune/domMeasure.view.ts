/**
 * Measurement for elements drawn through Rune. Such an element is never laid out
 * by the browser, so `getBoundingClientRect`, `offsetWidth` and `ResizeObserver`
 * would all report nothing. Once installed, those answer from where Rune laid the
 * element out; every other element keeps the browser's own answer.
 */

type Rect = readonly [number, number, number, number];

const rects = new WeakMap<Element, Rect>();
const watchers = new WeakMap<Element, Set<RuneResizeObserver>>();
let installed = false;
let NativeResizeObserver: typeof ResizeObserver | null = null;

function inRuneLayer(element: Element): boolean {
  return element.closest("[data-jg-rune-layer]") !== null;
}

/** Record where Rune laid `element` out (CSS pixels); observers of it hear a size change. */
export function setRuneRect(element: Element, rect: Rect): void {
  const before = rects.get(element);
  rects.set(element, rect);
  if (before !== undefined && Math.abs(before[2] - rect[2]) < 0.01 && Math.abs(before[3] - rect[3]) < 0.01) return;
  const observing = watchers.get(element);
  if (observing !== undefined) for (const observer of observing) observer.queue(element);
}

export function runeRectOf(element: Element): Rect | undefined {
  return rects.get(element);
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
      const rect = rects.get(target) ?? [0, 0, 0, 0];
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
      const rect = rects.get(this);
      return rect === undefined ? (original.call(this) as number) : read(rect);
    },
  });
}

/** Make measurement of Rune-drawn elements answer from Rune's layout. Safe to call again. */
export function installRuneMeasure(): void {
  if (installed || typeof Element === "undefined") return;
  installed = true;
  const originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element): DOMRect {
    const rect = rects.get(this);
    return rect === undefined ? originalRect.call(this) : new DOMRect(rect[0], rect[1], rect[2], rect[3]);
  };
  for (const name of ["offsetWidth", "clientWidth", "scrollWidth"]) patchGetter(name === "offsetWidth" ? HTMLElement.prototype : Element.prototype, name, (rect) => Math.round(rect[2]));
  for (const name of ["offsetHeight", "clientHeight", "scrollHeight"]) patchGetter(name === "offsetHeight" ? HTMLElement.prototype : Element.prototype, name, (rect) => Math.round(rect[3]));
  if (typeof ResizeObserver !== "undefined") {
    NativeResizeObserver = ResizeObserver;
    (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = RuneResizeObserver;
  }
}
