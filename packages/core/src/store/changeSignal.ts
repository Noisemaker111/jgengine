export interface ChangeSignal {
  subscribe(listener: () => void): () => void;
  notify(): void;
  version(): number;
}

export function createChangeSignal(): ChangeSignal {
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      version += 1;
      for (const listener of listeners) listener();
    },
    version() {
      return version;
    },
  };
}

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
