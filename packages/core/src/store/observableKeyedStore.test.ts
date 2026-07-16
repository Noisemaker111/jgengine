import { describe, expect, test } from "bun:test";
import { createObservableKeyedStore } from "@jgengine/core/store/observableKeyedStore";

describe("observable keyed store", () => {
  test("notifies subscribers on set and delete", () => {
    const store = createObservableKeyedStore<number>();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    store.set("a", 1);
    store.delete("a");
    unsubscribe();
    store.set("b", 2);

    expect(notified).toBe(2);
    expect(store.get("b")).toBe(2);
  });

  test("skips equal writes without notifying", () => {
    const store = createObservableKeyedStore<number>((previous, next) => previous === next);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.set("a", 1);
    store.set("a", 1);
    store.set("a", 2);

    expect(notified).toBe(2);
  });

  test("array snapshot is stable until data changes", () => {
    const store = createObservableKeyedStore<number>();
    const empty = store.arraySnapshot();
    expect(empty).toEqual([]);

    store.set("a", 1);
    const first = store.arraySnapshot();
    expect(store.arraySnapshot()).toBe(first);

    store.delete("a");
    expect(store.arraySnapshot()).toBe(empty);
  });

  test("array snapshot rebuild is lazy across multiple writes", () => {
    const store = createObservableKeyedStore<{ n: number }>();
    store.set("a", { n: 1 });
    const first = store.arraySnapshot();
    store.set("a", { n: 2 });
    store.set("b", { n: 3 });
    store.set("b", { n: 4 });
    const second = store.arraySnapshot();
    expect(second).not.toBe(first);
    expect(store.arraySnapshot()).toBe(second);
    expect(second).toEqual([{ n: 2 }, { n: 4 }]);
  });

  test("same-reference set notifies without requiring a new map entry", () => {
    const store = createObservableKeyedStore<{ n: number }>();
    const value = { n: 1 };
    store.set("a", value);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    value.n = 2;
    store.set("a", value);
    expect(notified).toBe(1);
    expect(store.get("a")).toBe(value);
    expect(store.get("a")?.n).toBe(2);
  });

  test("snapshot/hydrate roundtrips entries, clearing keys absent from the snapshot", () => {
    const source = createObservableKeyedStore<{ n: number }>();
    source.set("a", { n: 1 });
    source.set("b", { n: 2 });

    const target = createObservableKeyedStore<{ n: number }>();
    target.set("a", { n: 99 });
    target.set("stale", { n: 0 });
    let notified = 0;
    target.subscribe(() => {
      notified += 1;
    });
    target.hydrate(source.snapshot());

    expect(notified).toBe(1);
    expect(target.get("a")).toEqual({ n: 1 });
    expect(target.get("b")).toEqual({ n: 2 });
    expect(target.has("stale")).toBe(false);
    expect(new Map(target.snapshot())).toEqual(new Map(source.snapshot()));
  });

  test("membership fires only on add/delete/hydrate, never on updating an existing key", () => {
    const store = createObservableKeyedStore<{ n: number }>();
    let membership = 0;
    store.subscribeMembership(() => {
      membership += 1;
    });

    store.set("a", { n: 1 }); // add
    const value = { n: 2 };
    store.set("b", value); // add
    store.set("b", value); // same reference, still same key — no membership change
    store.set("b", { n: 3 }); // new value, existing key — no membership change
    expect(membership).toBe(2);

    store.delete("b"); // delete
    store.delete("missing"); // no-op
    expect(membership).toBe(3);

    store.hydrate([["x", { n: 9 }]]); // hydrate
    expect(membership).toBe(4);
  });

  test("keysSnapshot keeps a stable identity across value updates, changing only on membership", () => {
    const store = createObservableKeyedStore<{ n: number }>();
    expect(store.keysSnapshot()).toEqual([]);

    store.set("a", { n: 1 });
    const first = store.keysSnapshot();
    expect(first).toEqual(["a"]);

    store.set("a", { n: 2 }); // pose-style update
    store.set("a", { n: 3 });
    expect(store.keysSnapshot()).toBe(first); // identity unchanged — no churn

    store.set("b", { n: 4 }); // membership change
    const second = store.keysSnapshot();
    expect(second).not.toBe(first);
    expect(second).toEqual(["a", "b"]);

    store.delete("a");
    expect(store.keysSnapshot()).toEqual(["b"]);
  });

  test("mapSnapshot returns an owned copy that mutating it never reaches the store", () => {
    const store = createObservableKeyedStore<number>();
    store.set("a", 1);
    const snapshot = store.mapSnapshot();
    expect(snapshot.get("a")).toBe(1);

    (snapshot as Map<string, number>).set("a", 999);
    (snapshot as Map<string, number>).set("intruder", 1);

    expect(store.get("a")).toBe(1);
    expect(store.has("intruder")).toBe(false);
  });

  test("mapSnapshot is stable until the next write, like arraySnapshot", () => {
    const store = createObservableKeyedStore<number>();
    const empty = store.mapSnapshot();
    expect(store.mapSnapshot()).toBe(empty);

    store.set("a", 1);
    const first = store.mapSnapshot();
    expect(store.mapSnapshot()).toBe(first);
    expect(first.get("a")).toBe(1);

    store.set("a", 2);
    const second = store.mapSnapshot();
    expect(second).not.toBe(first);
    expect(second.get("a")).toBe(2);
  });

  test("membership listeners unsubscribe independently of value listeners", () => {
    const store = createObservableKeyedStore<number>();
    let membership = 0;
    let values = 0;
    const off = store.subscribeMembership(() => {
      membership += 1;
    });
    store.subscribe(() => {
      values += 1;
    });

    store.set("a", 1); // both fire
    off();
    store.set("b", 2); // only value listener
    store.set("b", 3); // only value listener

    expect(membership).toBe(1);
    expect(values).toBe(3);
  });
});
