/**
 * Which components rendered, and how often: the evidence that a changing value re-renders only its
 * own leaf. The engine's UI runtime reports every component render and every commit to the counter
 * installed on the page (`bun run drive --renders`) or by the test preload, so a test can count
 * renders of a real game HUD. It can be installed before or after the runtime loads.
 */

/** One component's renders since the last reset. */
export interface ComponentRenders {
  name: string;
  renders: number;
  perSecond: number;
  perFrame: number;
}

/** Every commit and component render since the counter was installed or reset. */
export interface RenderCounts {
  seconds: number;
  /** Animation frames the page ran over the same span: a page that renders slowly is judged per frame, not per second. */
  frames: number;
  commits: number;
  renders: number;
  components: ComponentRenders[];
}

/** The installed counter, at `globalThis.__jgRenders`. */
export interface RenderCounter {
  reset(): void;
  read(): RenderCounts;
  /** Renders of components with this name since the last reset. */
  count(name: string): number;
}

declare global {
  var __jgRenders: RenderCounter | undefined;
  var __jgRenderSink: { render(type: unknown): void; commit(): void } | undefined;
}

/**
 * Install the counter on `scope`: the UI runtime calls its sink once per component render (a
 * component that bailed out is never called) and once per commit. Self-contained, so a harness can
 * ship its source to a page.
 */
export function installRenderCounter(scope: { __jgRenders?: RenderCounter | undefined; __jgRenderSink?: { render(type: unknown): void; commit(): void } | undefined }): RenderCounter {
  if (scope.__jgRenders !== undefined) return scope.__jgRenders;
  const counts = new Map<string, number>();
  let commits = 0;
  let frames = 0;
  let since = performance.now();
  if (typeof requestAnimationFrame === "function") {
    const frame = () => {
      frames += 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  const nameOf = (type: unknown): string => {
    if (typeof type === "function") return String(Reflect.get(type, "displayName") ?? "") || type.name || "Anonymous";
    if (typeof type === "object" && type !== null) {
      const own = Reflect.get(type, "displayName");
      if (typeof own === "string" && own !== "") return own;
      const inner: unknown = Reflect.get(type, "render") ?? Reflect.get(type, "type");
      return inner === undefined ? "Anonymous" : nameOf(inner);
    }
    return "Anonymous";
  };
  scope.__jgRenderSink = {
    render(type) {
      const name = nameOf(type);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    },
    commit() {
      commits += 1;
    },
  };
  const counter: RenderCounter = {
    reset() {
      counts.clear();
      commits = 0;
      frames = 0;
      since = performance.now();
    },
    read() {
      const seconds = (performance.now() - since) / 1000;
      const components = [...counts].map(([name, renders]) => ({
        name,
        renders,
        perSecond: Math.round((renders / Math.max(seconds, 0.001)) * 10) / 10,
        perFrame: Math.round((renders / Math.max(frames, 1)) * 100) / 100,
      }));
      components.sort((a, b) => b.renders - a.renders);
      return { seconds: Math.round(seconds * 10) / 10, frames, commits, renders: components.reduce((sum, entry) => sum + entry.renders, 0), components };
    },
    count: (name) => counts.get(name) ?? 0,
  };
  scope.__jgRenders = counter;
  return counter;
}

/** The counter the test preload or the page script installed, or null when there is none. */
export function renderCounter(): RenderCounter | null {
  return globalThis.__jgRenders ?? null;
}
