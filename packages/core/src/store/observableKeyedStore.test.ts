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
});
