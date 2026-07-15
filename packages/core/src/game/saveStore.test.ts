import { describe, expect, test } from "bun:test";
import {
  createSaveStore,
  localSaveBackend,
  memorySaveBackend,
  remoteSaveBackend,
  type SaveBackend,
  type SaveTimers,
} from "./saveStore";
import type { KeyValueStorage } from "./keyValueStore";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

function manualTimers(): SaveTimers & { runAll: () => void; pending: () => number } {
  const active = new Map<number, () => void>();
  let seq = 0;
  return {
    set: (handler) => {
      const id = seq;
      seq += 1;
      active.set(id, handler);
      return id;
    },
    clear: (handle) => {
      active.delete(handle as number);
    },
    runAll: () => {
      const snapshot = [...active.values()];
      active.clear();
      for (const fn of snapshot) fn();
    },
    pending: () => active.size,
  };
}

describe("createSaveStore", () => {
  test("starts from the initial value before loading", () => {
    const store = createSaveStore({ backend: memorySaveBackend(), initial: { level: 1 } });
    expect(store.value()).toEqual({ level: 1 });
    expect(store.status()).toBe("idle");
  });

  test("save then reload round-trips through the backend", async () => {
    const backend = memorySaveBackend();
    const store = createSaveStore({ backend, initial: { level: 1 } });
    store.set({ level: 7 });
    await store.save();
    expect(store.status()).toBe("saved");

    const reopened = createSaveStore({ backend, initial: { level: 1 } });
    expect(await reopened.load()).toEqual({ level: 7 });
    expect(reopened.value()).toEqual({ level: 7 });
  });

  test("patch read-modify-writes the value", () => {
    const store = createSaveStore({ backend: memorySaveBackend(), initial: { coins: 10 } });
    const next = store.patch((prev) => ({ coins: prev.coins + 5 }));
    expect(next).toEqual({ coins: 15 });
    expect(store.value()).toEqual({ coins: 15 });
  });

  test("localSaveBackend persists into the underlying KeyValueStorage", async () => {
    const storage = memoryStorage();
    const store = createSaveStore({ backend: localSaveBackend(storage), initial: 0, key: "credits" });
    store.set(42);
    await store.save();
    expect(storage.data["credits:default"]).toContain("42");
  });

  test("load falls back to initial on a corrupt payload", async () => {
    const storage = memoryStorage({ "save:default": "not-json{" });
    const store = createSaveStore({ backend: localSaveBackend(storage), initial: { hp: 100 } });
    expect(await store.load()).toEqual({ hp: 100 });
    expect(store.status()).toBe("idle");
  });

  test("autosave debounces edits and flushes on the timer", async () => {
    const timers = manualTimers();
    const backend = memorySaveBackend();
    const store = createSaveStore({ backend, initial: 0, autosave: { debounceMs: 100 }, timers });
    store.set(1);
    store.set(2);
    store.set(3);
    expect(timers.pending()).toBe(1);
    timers.runAll();
    await store.save();

    const reopened = createSaveStore({ backend, initial: 0 });
    expect(await reopened.load()).toBe(3);
  });

  test("autosave respects the maxWait ceiling under continuous edits", async () => {
    let time = 0;
    const timers = manualTimers();
    const backend = memorySaveBackend();
    const store = createSaveStore({
      backend,
      initial: 0,
      autosave: { debounceMs: 1000, maxWaitMs: 500 },
      timers,
      now: () => time,
    });
    store.set(1);
    time = 600;
    store.set(2);
    expect(timers.pending()).toBe(0);
    await store.save();

    const reopened = createSaveStore({ backend, initial: 0, now: () => time });
    expect(await reopened.load()).toBe(2);
  });

  test("migrates an older versioned payload", async () => {
    const backend = memorySaveBackend();
    const v1 = createSaveStore({ backend, initial: { hp: 1 }, version: 1 });
    v1.set({ hp: 5 });
    await v1.save();

    const v2 = createSaveStore<{ hp: number; mp: number }>({
      backend,
      initial: { hp: 1, mp: 1 },
      version: 2,
      migrate: (data, from) => {
        expect(from).toBe(1);
        const old = data as { hp: number };
        return { hp: old.hp, mp: 0 };
      },
    });
    expect(await v2.load()).toEqual({ hp: 5, mp: 0 });
  });

  test("migrates a legacy non-envelope payload at version 0", async () => {
    const storage = memoryStorage({ "save:default": JSON.stringify({ score: 9 }) });
    const store = createSaveStore<{ score: number }>({
      backend: localSaveBackend(storage),
      initial: { score: 0 },
      version: 2,
      migrate: (data, from) => {
        expect(from).toBe(0);
        return data as { score: number };
      },
    });
    expect(await store.load()).toEqual({ score: 9 });
  });

  test("clear deletes the slot and resets to initial", async () => {
    const backend = memorySaveBackend();
    const store = createSaveStore({ backend, initial: { level: 1 } });
    store.set({ level: 9 });
    await store.save();
    await store.clear();
    expect(store.value()).toEqual({ level: 1 });

    const reopened = createSaveStore({ backend, initial: { level: 1 } });
    expect(await reopened.load()).toEqual({ level: 1 });
  });

  test("slots enumerates written slots and switchSlot isolates state", async () => {
    const backend = memorySaveBackend();
    const store = createSaveStore({ backend, initial: 0 });
    store.set(11);
    await store.save();
    await store.switchSlot("b");
    store.set(22);
    await store.save();

    const list = await store.slots();
    expect(list.sort()).toEqual(["b", "default"]);
    expect(store.value()).toBe(22);
    expect(await store.switchSlot("default")).toBe(11);
  });

  test("surfaces backend write failure as error status", async () => {
    const backend: SaveBackend = {
      read: () => Promise.resolve(null),
      write: () => Promise.reject(new Error("offline")),
      remove: () => Promise.resolve(),
    };
    const errors: unknown[] = [];
    const store = createSaveStore({ backend: remoteSaveBackend(backend), initial: 0, onError: (e) => errors.push(e) });
    store.set(1);
    await store.save();
    expect(store.status()).toBe("error");
    expect(errors).toHaveLength(1);
  });

  test("subscribe fires and revision advances on change", () => {
    const store = createSaveStore({ backend: memorySaveBackend(), initial: 0 });
    let calls = 0;
    const unsub = store.subscribe(() => {
      calls += 1;
    });
    const before = store.revision();
    store.set(1);
    expect(calls).toBe(1);
    expect(store.revision()).toBeGreaterThan(before);
    unsub();
    store.set(2);
    expect(calls).toBe(1);
  });

  test("concurrent saves serialize and persist the latest value", async () => {
    const writes: string[] = [];
    let resolveFirst: (() => void) | null = null;
    const backend: SaveBackend = {
      read: () => Promise.resolve(null),
      write: (_key, value) => {
        writes.push(value);
        if (resolveFirst === null) {
          return new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve();
      },
      remove: () => Promise.resolve(),
    };
    const store = createSaveStore({ backend, initial: 0 });
    store.set(1);
    const first = store.save();
    store.set(2);
    const second = store.save();
    while (resolveFirst === null) await Promise.resolve();
    resolveFirst();
    await Promise.all([first, second]);
    expect(writes.some((w) => w.includes("2"))).toBe(true);
  });
});
