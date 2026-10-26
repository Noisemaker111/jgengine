import { describe, expect, test } from "bun:test";

import { createFastTravelNetwork, type TravelPointDef } from "./fastTravel";

const POINTS: readonly TravelPointDef[] = [
  { id: "home", name: "Home Camp", position: [0, 0], region: "Vale", initial: true },
  { id: "ridge", name: "Windy Ridge", position: [30, 40], region: "Highlands" }, // dist 50 from origin
  { id: "port", name: "Salt Port", position: [3, 4], region: "Coast" }, // dist 5 from origin
];

function net(onDiscover?: (v: unknown) => void) {
  let clock = 1000;
  return createFastTravelNetwork({ points: POINTS, now: () => (clock += 1), onDiscover: onDiscover as never });
}

describe("createFastTravelNetwork", () => {
  test("initial points start discovered; discover unlocks others once", () => {
    const seen: string[] = [];
    const n = net((v) => seen.push((v as { id: string }).id));
    expect(n.isDiscovered("home")).toBe(true); // initial
    expect(n.isDiscovered("port")).toBe(false);
    expect(n.discover("port")?.discovered).toBe(true);
    expect(n.discover("port")).toBeNull(); // already
    expect(n.discover("nope")).toBeNull(); // unknown
    expect(seen).toEqual(["port"]);
  });

  test("list/destinations sort by distance from an origin and carry distance", () => {
    const n = net();
    n.discover("port");
    n.discover("ridge");
    const sorted = n.list([0, 0]).map((v) => v.id);
    expect(sorted).toEqual(["home", "port", "ridge"]); // 0, 5, 50
    expect(n.list([0, 0])[1]!.distance).toBeCloseTo(5, 5);
    expect(n.destinations([0, 0]).every((v) => v.discovered)).toBe(true);
  });

  test("nearest discovered point, excluding the current one", () => {
    const n = net();
    n.discover("port");
    n.discover("ridge");
    expect(n.nearest([0, 0])!.id).toBe("home"); // distance 0
    expect(n.nearest([0, 0], { exclude: "home" })!.id).toBe("port");
  });

  test("canTravel gates on discovery", () => {
    const n = net();
    expect(n.canTravel("home")).toBe(true);
    expect(n.canTravel("ridge")).toBe(false);
    n.discover("ridge");
    expect(n.canTravel("ridge")).toBe(true);
  });

  test("snapshot/restore preserves discovery and re-seeds initial points", () => {
    const n = net();
    n.discover("port");
    const snap = JSON.parse(JSON.stringify(n.snapshot()));

    const n2 = net();
    n2.restore({ discovered: {} });
    expect(n2.isDiscovered("home")).toBe(true); // initial re-seeded even from empty
    expect(n2.isDiscovered("port")).toBe(false);
    n2.restore(snap);
    expect(n2.isDiscovered("port")).toBe(true);
  });

  test("subscribe fires on discover and stops after unsubscribe", () => {
    const n = net();
    let hits = 0;
    const off = n.subscribe(() => { hits += 1; });
    n.discover("port");
    off();
    n.discover("ridge");
    expect(hits).toBe(1);
  });
});
