/**
 * Which React components rendered, and how often: the evidence that a changing value re-renders
 * only its own leaf. It stands in for React DevTools' global hook, so it has to be installed before
 * React loads: a page gets it as a script ahead of its own (`bun run drive --renders`), and every
 * `bun test` gets it from the test preload, so a test can count renders of a real game HUD.
 */

/** One component's renders since the last reset. */
export interface ComponentRenders {
  name: string;
  renders: number;
  perSecond: number;
}

/** Every commit and component render since the counter was installed or reset. */
export interface RenderCounts {
  seconds: number;
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
  // The hook React looks up by this name when it loads.
  var __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown;
  var __jgRenders: RenderCounter | undefined;
}

/**
 * Install the counter as React's devtools hook on `scope`. A component fiber rendered in a commit
 * when it mounted or carries React's PerformedWork flag; a subtree whose child pointer did not change
 * bailed out whole and is not walked, the same test React DevTools uses. Returns null when another
 * devtools hook was there first. Self-contained, so a harness can ship its source to a page.
 */
export function installRenderCounter(scope: { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown; __jgRenders?: RenderCounter | undefined }): RenderCounter | null {
  if (scope.__jgRenders !== undefined) return scope.__jgRenders;
  if (scope.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined) return null;
  const counts = new Map<string, number>();
  let commits = 0;
  let since = performance.now();
  type Fiber = { tag: number; type: unknown; flags: number; alternate: Fiber | null; child: Fiber | null; sibling: Fiber | null };
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
  // Function, class, forwardRef, memo and simple memo components.
  const component = (tag: number) => tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15;
  const walk = (start: Fiber) => {
    const stack: Fiber[] = [start];
    for (let fiber = stack.pop(); fiber !== undefined; fiber = stack.pop()) {
      const previous = fiber.alternate;
      if (component(fiber.tag) && (previous === null || (fiber.flags & 1) === 1)) {
        const name = nameOf(fiber.type);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      if (previous !== null && fiber.child === previous.child) continue;
      for (let child = fiber.child; child !== null; child = child.sibling) stack.push(child);
    }
  };
  const renderers = new Map<number, unknown>();
  scope.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers,
    inject(renderer: unknown) {
      const id = renderers.size + 1;
      renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      commits += 1;
      try { walk(root.current); } catch { /* a fiber shape this does not know: count the commit only */ }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
  const counter: RenderCounter = {
    reset() {
      counts.clear();
      commits = 0;
      since = performance.now();
    },
    read() {
      const seconds = (performance.now() - since) / 1000;
      const components = [...counts].map(([name, renders]) => ({ name, renders, perSecond: Math.round((renders / Math.max(seconds, 0.001)) * 10) / 10 }));
      components.sort((a, b) => b.renders - a.renders);
      return { seconds: Math.round(seconds * 10) / 10, commits, renders: components.reduce((sum, entry) => sum + entry.renders, 0), components };
    },
    count: (name) => counts.get(name) ?? 0,
  };
  scope.__jgRenders = counter;
  return counter;
}

/** The counter the test preload or the page script installed, or null when React loaded first. */
export function renderCounter(): RenderCounter | null {
  return globalThis.__jgRenders ?? null;
}
