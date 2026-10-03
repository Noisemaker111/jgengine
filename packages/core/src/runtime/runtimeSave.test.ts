import { describe, expect, test } from "bun:test";
import { memorySaveBackend, type SaveBackend, type SaveTimers } from "../game/saveStore";
import { createRuntimeSave, type RuntimeSaveTarget } from "./runtimeSave";
import type { WorldSnapshot } from "./worldSnapshot";

/** A stand-in for a live GameContext: a mutable world with snapshot/hydrate/subscribe. */
function fakeWorld(initial: WorldSnapshot = {}): RuntimeSaveTarget & {
  world: WorldSnapshot;
  bump: () => void;
} {
  let world: WorldSnapshot = { ...initial };
  const listeners = new Set<() => void>();
  return {
    get world() {
      return world;
    },
    snapshot: () => ({ ...world }),
    hydrate: (snapshot) => {
      world = { ...snapshot };
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bump: () => {
      for (const listener of listeners) listener();
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

describe("createRuntimeSave", () => {
  test("denied reads cannot restore a cached snapshot or report slot occupancy", async () => {
    const memory = memorySaveBackend();
    const error = new Error("read denied");
    let denied = false;
    const backend: SaveBackend = { ...memory, read: (key) => denied ? Promise.reject(error) : memory.read(key) };
    const host = fakeWorld({ store: { level: 3 } });
    const errors: unknown[] = [];
    const save = createRuntimeSave({ target: host, backend, mode: "manual", onError: (error) => errors.push(error) });
    await save.save();
    expect(await save.load()).toBe(true);
    host.hydrate({ store: { level: 9 } });
    denied = true;
    expect(await save.load()).toBe(false);
    expect(host.world).toEqual({ store: { level: 9 } });
    expect(await save.hasSave()).toBe(false);
    expect(host.world).toEqual({ store: { level: 9 } });
    expect(await save.switchSlot("other")).toBe(false);
    expect(host.world).toEqual({ store: { level: 9 } });
    expect(save.status()).toBe("error");
    expect(errors).toEqual([error, error, error]);
  });

  test.each(["read", "write"])("successful payload load restores even when its later index %s fails", async (operation) => {
    const memory = memorySaveBackend();
    await memory.write("runtime:default", JSON.stringify({ version: 1, savedAt: 0, value: { store: { level: 7 } } }));
    const error = new Error("index denied");
    const backend: SaveBackend = { ...memory, read: (key) => operation === "read" && key.endsWith(":__slots__") ? Promise.reject(error) : memory.read(key), write: (key, value) => operation === "write" && key.endsWith(":__slots__") ? Promise.reject(error) : memory.write(key, value) };
    for (const method of ["load", "hasSave", "switchSlot"] as const) {
      const target = fakeWorld({ store: { level: 1 } });
      const errors: unknown[] = [];
      const save = createRuntimeSave({ target, backend, mode: "manual", onError: (error) => errors.push(error) });
      expect(await (method === "switchSlot" ? save.switchSlot("default") : save[method]())).toBe(true);
      expect(target.world).toEqual({ store: { level: method === "hasSave" ? 1 : 7 } });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(save.status()).toBe("error");
      expect(errors).toEqual([error]);
    }
  });

  test("save captures the live world; load hydrates a fresh world", async () => {
    const backend = memorySaveBackend();
    const host = fakeWorld({ store: { level: 3 }, entities: [{ id: "p" }] });
    const save = createRuntimeSave({ target: host, backend, mode: "manual" });
    await save.save();

    const fresh = fakeWorld();
    const restore = createRuntimeSave({ target: fresh, backend, mode: "manual" });
    expect(await restore.load()).toBe(true);
    expect(fresh.world).toEqual({ store: { level: 3 }, entities: [{ id: "p" }] });
  });

  test("load on an empty slot returns false and leaves the world alone", async () => {
    const fresh = fakeWorld({ store: { level: 1 } });
    const save = createRuntimeSave({ target: fresh, backend: memorySaveBackend(), mode: "manual" });
    expect(await save.load()).toBe(false);
    expect(fresh.world).toEqual({ store: { level: 1 } });
  });

  test("autosave mode persists on a debounced world change", async () => {
    const backend = memorySaveBackend();
    const timers = manualTimers();
    const host = fakeWorld({ store: { coins: 0 } });
    const save = createRuntimeSave({ target: host, backend, mode: "autosave", timers });

    host.hydrate({ store: { coins: 50 } });
    host.bump();
    expect(timers.pending()).toBe(1);
    timers.runAll();
    await save.save();

    const reopened = createRuntimeSave({ target: fakeWorld(), backend, mode: "manual" });
    expect(await reopened.load()).toBe(true);
  });

  test("a never-idle world still autosaves: continuous change does not starve the timer", async () => {
    const backend = memorySaveBackend();
    const timers = manualTimers();
    const host = fakeWorld({ store: { coins: 0 } });
    const save = createRuntimeSave({ target: host, backend, mode: "autosave", timers });

    // A living world bumps every frame. A reset-on-change debounce would clear
    // and re-arm forever (timer never elapses); the trailing timer must survive.
    for (let frame = 0; frame < 120; frame += 1) {
      host.hydrate({ store: { coins: frame } });
      host.bump();
      expect(timers.pending()).toBe(1);
    }
    timers.runAll();
    await save.save();

    const reopened = createRuntimeSave({ target: fakeWorld(), backend, mode: "manual" });
    expect(await reopened.load()).toBe(true);
  });

  test("manual mode never schedules an autosave on world change", () => {
    const timers = manualTimers();
    const host = fakeWorld();
    createRuntimeSave({ target: host, backend: memorySaveBackend(), mode: "manual", timers });
    host.bump();
    expect(timers.pending()).toBe(0);
  });

  test("checkpoint is an explicit save", async () => {
    const backend = memorySaveBackend();
    const host = fakeWorld({ quest: "act2" });
    const save = createRuntimeSave({ target: host, backend, mode: "manual" });
    await save.checkpoint();
    const reopened = createRuntimeSave({ target: fakeWorld(), backend, mode: "manual" });
    expect(await reopened.load()).toBe(true);
  });

  test("named slots isolate saves; hasSave reports occupancy", async () => {
    const backend = memorySaveBackend();
    const host = fakeWorld({ store: { a: 1 } });
    const save = createRuntimeSave({ target: host, backend, mode: "manual" });
    await save.save();
    expect(await save.hasSave()).toBe(true);

    await save.switchSlot("slot-2");
    expect(await save.hasSave()).toBe(false);
    host.hydrate({ store: { a: 99 } });
    await save.save();

    expect((await save.slots()).sort()).toEqual(["default", "slot-2"]);
  });

  test("hydrating during load does not trigger a re-save loop", async () => {
    const backend = memorySaveBackend();
    const timers = manualTimers();
    const host = fakeWorld({ store: { seed: 1 } });
    const save = createRuntimeSave({ target: host, backend, mode: "autosave", timers });
    await save.save();

    const target = fakeWorld();
    const restore = createRuntimeSave({ target, backend, mode: "autosave", timers });
    // hydrate() inside load() bumps the world; restore's own subscription must not self-schedule.
    target.subscribe(() => undefined);
    await restore.load();
    expect(timers.pending()).toBe(0);
  });

  test("clear removes the slot's save", async () => {
    const backend = memorySaveBackend();
    const host = fakeWorld({ store: { a: 1 } });
    const save = createRuntimeSave({ target: host, backend, mode: "manual" });
    await save.save();
    await save.clear();
    const reopened = createRuntimeSave({ target: fakeWorld(), backend, mode: "manual" });
    expect(await reopened.load()).toBe(false);
  });
});
