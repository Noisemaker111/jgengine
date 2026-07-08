import { describe, expect, test } from "bun:test";

import { createGameStateStore } from "./gameState";

function counting() {
  let fired = 0;
  return {
    notify: () => {
      fired += 1;
    },
    count: () => fired,
  };
}

describe("createGameStateStore", () => {
  test("define seeds a value and returns a working handle", () => {
    const signal = counting();
    const store = createGameStateStore(signal.notify);
    const handle = store.define("score", 0);
    expect(handle.get()).toBe(0);
    handle.set(5);
    expect(handle.get()).toBe(5);
    expect(signal.count()).toBe(1);
    handle.update((current) => current + 1);
    expect(handle.get()).toBe(6);
    expect(signal.count()).toBe(2);
  });

  test("define is idempotent-safe and does not overwrite an existing value", () => {
    const signal = counting();
    const store = createGameStateStore(signal.notify);
    store.define("score", 10);
    store.set("score", 42);
    const handle = store.define("score", 10);
    expect(handle.get()).toBe(42);
    expect(signal.count()).toBe(1);
  });

  test("get/set/update on the store proxy to the same underlying value", () => {
    const signal = counting();
    const store = createGameStateStore(signal.notify);
    store.define("hp", 100);
    expect(store.get("hp")).toBe(100);
    store.set("hp", 80);
    expect(store.get("hp")).toBe(80);
    store.update("hp", (current: number) => current - 5);
    expect(store.get("hp")).toBe(75);
    expect(signal.count()).toBe(2);
  });

  test("get on an unknown id returns undefined", () => {
    const store = createGameStateStore(() => {});
    expect(store.get("missing")).toBeUndefined();
    expect(store.handle("missing")).toBeNull();
  });

  test("set on an unknown id throws a clear error", () => {
    const store = createGameStateStore(() => {});
    expect(() => store.set("missing", 1)).toThrow(/unknown state id "missing"/);
  });

  test("update on an unknown id throws a clear error", () => {
    const store = createGameStateStore(() => {});
    expect(() => store.update("missing", (current: number) => current + 1)).toThrow(
      /unknown state id "missing"/,
    );
  });

  test("attach forwards notifications from an external source and records the id", () => {
    const signal = counting();
    const store = createGameStateStore(signal.notify);
    const listeners = new Set<() => void>();
    const external = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const detach = store.attach("external", external);
    expect(store.ids()).toContain("external");
    for (const listener of listeners) listener();
    expect(signal.count()).toBe(1);
    detach();
    expect(store.ids()).not.toContain("external");
  });

  test("invalidate notifies without changing any value", () => {
    const signal = counting();
    const store = createGameStateStore(signal.notify);
    store.define("hp", 100);
    store.invalidate();
    expect(signal.count()).toBe(1);
    expect(store.get("hp")).toBe(100);
  });

  test("ids lists defined and attached state", () => {
    const store = createGameStateStore(() => {});
    store.define("a", 1);
    store.define("b", 2);
    store.attach("c", { subscribe: () => () => {} });
    expect([...store.ids()].sort()).toEqual(["a", "b", "c"]);
  });
});
