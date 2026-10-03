import { expect, test } from "bun:test";
import { createEntityStore } from "./entityStore";
import { createObservableKeyedStore } from "../store/observableKeyedStore";

test("entity commit IDs/membership precede unchanged subscribers on every writer", () => {
  const changes: [string | undefined, boolean][] = [];
  let hooks = 0;
  let notices = 0;
  const store = createEntityStore({ onChange: (id, membership) => { changes.push([id, membership]); hooks++; } });
  store.subscribe(() => { notices++; expect(hooks).toBe(notices); });
  store.spawn("probe", { id: "a", position: [0, 0, 0] });
  const ids = store.ids();
  store.spawn("probe", { id: "a", onExisting: "keep" });
  expect(() => store.spawn("probe", { id: "a" })).toThrow();
  store.spawn("replacement", { id: "a", onExisting: "replace", position: [1, 0, 0] });
  const tuple = [2, 0, 0] as const;
  store.setPose("a", { position: tuple });
  expect(store.get("a")?.position).toBe(tuple);
  store.update("a", { position: [3, 0, 0] });
  store.resetToSpawn("a");
  expect(store.ids()).toBe(ids);
  const snapshot = store.snapshot();
  store.spawn("probe", { id: "b" });
  store.hydrate(snapshot);
  store.despawn("missing");
  store.despawn("a");
  store.despawn("a");
  expect(changes).toEqual([["a", true], ["a", false], ["a", false], ["a", false],
    ["a", false], ["b", true], ["b", true], ["a", false], ["a", true]]);
  expect(store.ids()).toEqual([]);
  store.spawn("probe", { id: "c" });
  store.clear();
  expect(changes.slice(-2)).toEqual([["c", true], ["c", true]]);
});

test("keyed hook sees committed membership before general and membership listeners", () => {
  const sequence: string[] = [];
  const keyViews: (readonly string[])[] = [];
  const store = createObservableKeyedStore<number>((a, b) => a === b, (id, membership) => {
    sequence.push(`hook:${id}:${membership}:${store.keysSnapshot().join(",")}`);
    keyViews.push(store.keysSnapshot());
  });
  store.subscribe(() => { sequence.push(`general:${store.keysSnapshot().join(",")}`); keyViews.push(store.keysSnapshot()); });
  store.subscribeMembership(() => { sequence.push("membership"); keyViews.push(store.keysSnapshot()); });
  store.set("a", 1); store.set("a", 1); store.set("a", 2); store.delete("absent");
  store.hydrate([["b", 3]]); store.delete("b");
  expect(sequence).toEqual(["hook:a:true:a", "general:a", "membership", "hook:a:false:a", "general:a",
    "hook:undefined:true:b", "general:b", "membership", "hook:b:true:", "general:", "membership"]);
  expect(keyViews[0]).toBe(keyViews[1]);
  expect(keyViews[1]).toBe(keyViews[2]);
  expect(keyViews[2]).toBe(keyViews[3]);
  expect(keyViews[5]).toBe(keyViews[6]);
  expect(keyViews[6]).toBe(keyViews[7]);
  expect(keyViews.at(-1)).toBe(store.keysSnapshot());
});
