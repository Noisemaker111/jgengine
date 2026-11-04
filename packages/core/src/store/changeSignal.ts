// @skill jgengine-gameplay
/** @internal */
export interface ChangeSignal {
  subscribe(listener: () => void): () => void;
  notify(): void;
  version(): number;
  /**
   * Run `work` with listeners held: each notify inside still bumps the version, and listeners fire
   * once when the outermost batch ends, if anything changed. Nested batches join the outer one.
   */
  batch<T>(work: () => T): T;
}

/** @internal */
export function createChangeSignal(): ChangeSignal {
  const listeners = new Set<() => void>();
  let version = 0;
  let depth = 0;
  let pending = false;
  const fire = () => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      version += 1;
      if (depth > 0) pending = true;
      else fire();
    },
    version() {
      return version;
    },
    batch(work) {
      depth += 1;
      try {
        return work();
      } finally {
        depth -= 1;
        if (depth === 0 && pending) {
          pending = false;
          fire();
        }
      }
    },
  };
}

/** @internal */
export function notifyAfter<T extends object, K extends keyof T>(
  target: T,
  methods: readonly K[],
  notify: () => void,
): T {
  const wrapped: T = { ...target };
  for (const method of methods) {
    const fn = target[method] as unknown as (...args: unknown[]) => unknown;
    wrapped[method] = ((...args: unknown[]) => {
      const result = fn(...args);
      notify();
      return result;
    }) as T[K];
  }
  return wrapped;
}
