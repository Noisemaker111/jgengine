import { expect, test } from "bun:test";
import { PROPS, ROOMS, type Point } from "../world";
import { advanceRoute, createNavigator, findRoute, traversable } from "./navigation";

test("Fitter walks around authored machinery without crossing its footprint", () => {
  const machine = PROPS[0]!;
  const from: Point = [machine.x - machine.w / 2 - 0.7, 0, machine.z];
  const goal: Point = [machine.x + machine.w / 2 + 0.7, 0, machine.z];
  expect(traversable(from, goal, "vault")).toBe(false);
  const path = findRoute(from, goal, "vault");
  expect(path.length).toBeGreaterThan(1);
  let previous = from;
  for (const point of path) { expect(traversable(previous, point, "vault")).toBe(true); previous = point; }
  const route = createNavigator();
  let at = from;
  for (let n = 0; n < 120; n++) {
    const next = advanceRoute(route, at, goal, 0.1, "vault");
    expect(traversable(at, next, "vault")).toBe(true); at = next;
  }
  expect(at).toEqual(goal);
});

test("a route never jumps between disconnected home and vault floors", () => {
  const home = ROOMS.find(room => room.place === "home")!;
  const vault = ROOMS.find(room => room.place === "vault")!;
  expect(findRoute([home.x, 0, home.z], [vault.x, 0, vault.z], "vault")).toEqual([]);
});
