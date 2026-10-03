import { expect, test } from "bun:test";
import { createEntityStore, type EntityPosition } from "./entityStore";

test("hidden frozen occupancy survives a fresh entity-store JSON hydration", () => {
  const source = createEntityStore(), target = createEntityStore();
  source.spawn("rider", { id: "remote", hidden: true, movement: { frozen: true, walkSpeed: 3 } });
  target.hydrate(JSON.parse(JSON.stringify(source.snapshot())));
  expect(target.get("remote")).toMatchObject({ hidden: true, movement: { frozen: true, walkSpeed: 3 }, velocity: [0, 0, 0] });
});

test("explicit velocity copies its tuple and participates in snapshot/hydration notifications", () => {
  const store = createEntityStore(), target = createEntityStore();
  store.spawn("rider", { id: "pilot" });
  let changes = 0; store.subscribe(() => changes++);
  const velocity: [number, number, number] = [2, -1, 5];
  expect(store.setVelocity("pilot", velocity)).toBe(true);
  velocity[0] = 99;
  expect(store.get("pilot")?.velocity).toEqual([2, -1, 5]);
  expect(changes).toBe(1);
  target.hydrate(JSON.parse(JSON.stringify(store.snapshot())));
  expect(target.get("pilot")?.velocity).toEqual([2, -1, 5]);
  expect(store.setVelocity("pilot", [0, 0, 0])).toBe(true);
  expect(store.get("pilot")?.velocity).toEqual([0, 0, 0]);
});

test("invalid velocity and unknown entities leave pose, velocity and notifications untouched", () => {
  const store = createEntityStore(); store.spawn("rider", { id: "pilot", position: [7, 8, 9] });
  store.setPose("pilot", { position: [8, 9, 10], dt: 0.5 });
  const before = structuredClone(store.snapshot()); let changes = 0; store.subscribe(() => changes++);
  for (const value of [[1, 2], [1, 2, 3, 4], [NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity], [1, "2", 3], null]) {
    expect(store.setVelocity("pilot", value as unknown as EntityPosition)).toBe(false);
    expect(store.snapshot()).toEqual(before);
  }
  expect(store.setVelocity("missing", [1, 2, 3])).toBe(false);
  expect(changes).toBe(0);
});
