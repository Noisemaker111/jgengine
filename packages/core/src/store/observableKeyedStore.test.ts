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
});
