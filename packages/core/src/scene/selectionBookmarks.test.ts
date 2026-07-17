import { describe, expect, test } from "bun:test";
import {
  createSelectionBookmarks,
  recallSelectionBookmark,
} from "@jgengine/core/scene/selectionBookmarks";
import { createSelectionSet } from "@jgengine/core/scene/selection";

describe("selection bookmarks store", () => {
  test("bind saves an ordered, deduplicated set under a key", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["a", "b", "a", "c"]);
    expect(store.recall("1")).toEqual(["a", "b", "c"]);
    expect(store.size("1")).toBe(3);
    expect(store.has("1")).toBe(true);
  });

  test("bind replaces the prior set; empty bind removes the key", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["a", "b"]);
    store.bind("1", ["x"]);
    expect(store.recall("1")).toEqual(["x"]);
    store.bind("1", []);
    expect(store.has("1")).toBe(false);
    expect(store.keys()).toEqual([]);
  });

  test("append unions in stable order, remove deletes and prunes empty keys", () => {
    const store = createSelectionBookmarks();
    store.append("home", ["a"]);
    store.append("home", ["a", "b", "c"]);
    expect(store.recall("home")).toEqual(["a", "b", "c"]);
    store.remove("home", ["b"]);
    expect(store.recall("home")).toEqual(["a", "c"]);
    store.remove("home", ["a", "c"]);
    expect(store.has("home")).toBe(false);
  });

  test("recall returns a fresh copy that cannot mutate the store", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["a", "b"]);
    const ids = store.recall("1");
    ids.push("z");
    expect(store.recall("1")).toEqual(["a", "b"]);
  });

  test("keys enumerate in insertion order; clear and clearAll drop them", () => {
    const store = createSelectionBookmarks();
    store.bind("2", ["b"]);
    store.bind("1", ["a"]);
    store.bind("home", ["h"]);
    expect(store.keys()).toEqual(["2", "1", "home"]);
    expect(store.clear("1")).toBe(true);
    expect(store.clear("missing")).toBe(false);
    store.clearAll();
    expect(store.keys()).toEqual([]);
  });

  test("prune drops dead refs via the predicate and reports removals", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["alive", "dead", "alive2"]);
    store.bind("2", ["gone"]);
    store.bind("home", ["alive"]);
    const alive = new Set(["alive", "alive2"]);
    const result = store.prune((id) => alive.has(id));
    expect(store.recall("1")).toEqual(["alive", "alive2"]);
    expect(store.has("2")).toBe(false); // emptied → key cleared
    expect(store.recall("home")).toEqual(["alive"]);
    expect(result.removedIds.sort()).toEqual(["dead", "gone"]);
    expect(result.clearedKeys).toEqual(["2"]);
  });

  test("serialize round-trips through createSelectionBookmarks", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["a", "b"]);
    store.bind("home", ["h1", "h2"]);
    const snapshot = store.serialize();
    expect(snapshot).toEqual({ bookmarks: { "1": ["a", "b"], home: ["h1", "h2"] } });

    const restored = createSelectionBookmarks(snapshot);
    expect(restored.serialize()).toEqual(snapshot);
    expect(restored.recall("home")).toEqual(["h1", "h2"]);
  });

  test("restoring a snapshot re-dedupes and drops empty sets", () => {
    const restored = createSelectionBookmarks({ bookmarks: { "1": ["a", "a", "b"], "2": [] } });
    expect(restored.recall("1")).toEqual(["a", "b"]);
    expect(restored.has("2")).toBe(false);
  });
});

describe("recallSelectionBookmark composition", () => {
  test("replace mode swaps the active selection and fires the focus hook", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["a", "b"]);
    const selection = createSelectionSet(["old"]);
    const focused: string[][] = [];
    const applied = recallSelectionBookmark(store, "1", selection, {
      onFocus: (ids) => focused.push([...ids]),
    });
    expect(applied).toEqual(["a", "b"]);
    expect(selection.list()).toEqual(["a", "b"]);
    expect(focused).toEqual([["a", "b"]]);
  });

  test("merge mode unions the bookmark into the current selection", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["b", "c"]);
    const selection = createSelectionSet(["a"]);
    recallSelectionBookmark(store, "1", selection, { mode: "merge" });
    expect(selection.list()).toEqual(["a", "b", "c"]);
  });

  test("recall prunes stale refs from the stored bookmark before applying", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["alive", "dead"]);
    const selection = createSelectionSet();
    const alive = new Set(["alive"]);
    const applied = recallSelectionBookmark(store, "1", selection, { isValid: (id) => alive.has(id) });
    expect(applied).toEqual(["alive"]);
    expect(selection.list()).toEqual(["alive"]);
    expect(store.recall("1")).toEqual(["alive"]); // dead ref pruned from the store, not just the recall
  });

  test("recall of an empty or fully-dead bookmark clears selection and skips focus", () => {
    const store = createSelectionBookmarks();
    store.bind("1", ["dead"]);
    const selection = createSelectionSet(["keep-until-replaced"]);
    let focusCalls = 0;
    const applied = recallSelectionBookmark(store, "1", selection, {
      isValid: () => false,
      onFocus: () => (focusCalls += 1),
    });
    expect(applied).toEqual([]);
    expect(selection.size()).toBe(0); // replace mode still clears
    expect(focusCalls).toBe(0);
    expect(store.has("1")).toBe(false);
  });
});
