export interface SnapshotSlice<T = unknown> {
  capture(): T;
  restore(state: T): void;
}

export type Snapshot = Record<string, unknown>;

export interface SnapshotStore {
  register<T>(id: string, slice: SnapshotSlice<T>): void;
  unregister(id: string): void;
  capture(): Snapshot;
  restore(snapshot: Snapshot): void;
  push(): Snapshot;
  pop(): boolean;
  peek(): Snapshot | null;
  depth(): number;
  clear(): void;
}

/** @internal */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as unknown as T;
  if (value instanceof Map) {
    const clone = new Map();
    for (const [k, v] of value) clone.set(deepClone(k), deepClone(v));
    return clone as unknown as T;
  }
  if (value instanceof Set) {
    const clone = new Set();
    for (const item of value) clone.add(deepClone(item));
    return clone as unknown as T;
  }
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) clone[k] = deepClone(v);
  return clone as T;
}

/** @internal */
export function createSnapshotStore(): SnapshotStore {
  const slices = new Map<string, SnapshotSlice>();
  const stack: Snapshot[] = [];

  function capture(): Snapshot {
    const snapshot: Snapshot = {};
    for (const [id, slice] of slices) snapshot[id] = deepClone(slice.capture());
    return snapshot;
  }

  function restore(snapshot: Snapshot): void {
    for (const [id, slice] of slices) {
      if (id in snapshot) slice.restore(deepClone(snapshot[id]));
    }
  }

  return {
    register: (id, slice) => {
      slices.set(id, slice as SnapshotSlice);
    },
    unregister: (id) => {
      slices.delete(id);
    },
    capture,
    restore,
    push: () => {
      const snapshot = capture();
      stack.push(snapshot);
      return snapshot;
    },
    pop: () => {
      const snapshot = stack.pop();
      if (snapshot === undefined) return false;
      restore(snapshot);
      return true;
    },
    peek: () => (stack.length === 0 ? null : stack[stack.length - 1]!),
    depth: () => stack.length,
    clear: () => {
      stack.length = 0;
    },
  };
}
