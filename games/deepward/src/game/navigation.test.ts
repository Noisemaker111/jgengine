import { expect, test } from "bun:test";
import { groundDistance, PROPS, ROOMS, type Point } from "../world";
import { advanceRoute, createNavigator, findRoute, midLeap, traversable } from "./navigation";

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

test("a Wells print leaps the authored gap from the sump to the reservoir deck instead of walking the catwalks round", () => {
  const sump: Point = [-4, 0, 12.5], deck: Point = [6.5, 0, 12.5];
  expect(traversable(sump, deck, "wells")).toBe(false);
  const route = createNavigator();
  const crossings: string[] = [];
  let at = sump, highest = 0, walked = 0;
  for (let n = 0; n < 200 && groundDistance(at, deck) > 1e-6; n++) {
    const next = advanceRoute(route, at, deck, 0.25, "wells", (link, phase) => crossings.push(`${phase}:${link.id}:${link.kind}`));
    walked += groundDistance(at, next); highest = Math.max(highest, next[1]); at = next;
  }
  expect(at).toEqual(deck);
  expect(crossings).toEqual(["enter:wells-sump-leap:jump", "exit:wells-sump-leap:jump"]);
  // It arcs over the gap and lands back on the deck floor.
  expect(highest).toBeGreaterThan(0.8);
  expect(at[1]).toBe(0);
  // The catwalks round are three times the leap's length.
  expect(walked).toBeLessThan(14);
  // The leap runs both ways.
  expect(findRoute(deck, sump, "wells").length).toBeGreaterThan(0);
});

test("a print in mid-leap keeps leaping even when its target moves", () => {
  const route = createNavigator();
  let at: Point = [-2.2, 0, 12.5];
  for (let n = 0; n < 20 && !midLeap(route); n++) at = advanceRoute(route, at, [6.5, 0, 12.5], 0.3, "wells");
  expect(midLeap(route)).toBe(true);
  at = advanceRoute(route, at, [-6, 0, 16], 0.3, "wells");
  expect(midLeap(route)).toBe(true);
  expect(at[0]).toBeGreaterThan(-1.6);
});
