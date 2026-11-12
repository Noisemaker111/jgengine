import { describe, expect, test } from "bun:test";

import { CITY_SCHEMA, resolveCityObject } from "../city/cityKind";
import { runGenerator } from "../generator/generator";
import { parseParams } from "../generator/paramSchema";
import { CIRCUIT_ROUTE_SCHEMA, RACE_CIRCUIT_GENERATOR, RACE_CIRCUIT_SCHEMA, extractCircuitRoute, extractStreetRaces, type CircuitRoute, type RaceCircuit } from "./raceCircuit";
import { endStreetRaceEvent, startStreetRaceEvent, streetRaceEventActive, subscribeStreetRaceEvents } from "./raceEvents";
import { OVERTAKE_STRAIGHT, SLOW_CORNER_RADIUS, arcProfile, radiusProfile, squareShare, straightRuns } from "./raceLapSearch";
import { streetNetworkFromPaths, type StreetPath } from "./streetNetworkFromPaths";
import type { StreetVec2 } from "./streetGenerator";

const SEEDS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"];
const STREET_RACE = RACE_CIRCUIT_SCHEMA.presets!.find((preset) => preset.id === "street-race")!.values;

/** The lap as a driver reads it: flat-out straights (gentle blips bridged), overtaking spots, grid. */
function lapReadout(route: CircuitRoute): { longestStraight: number; overtakes: number; gridInCorner: number; square: number } {
  const closed = route.closed;
  const radii = radiusProfile(route.centerline, 10, closed);
  const { at, total } = arcProfile(route.centerline, closed);
  const runs = straightRuns(radii, at, total, closed, true);
  let overtakes = 0;
  for (const run of runs) {
    if (run.length < OVERTAKE_STRAIGHT) continue;
    // A straight ≥ 250 m that ends in heavy braking: a slow corner within 80 m of its end.
    const end = run.start + run.length;
    if (route.centerline.some((_, i) => (((at[i]! - end) % total) + total) % total <= 80 && radii[i]! < SLOW_CORNER_RADIUS)) overtakes += 1;
  }
  let gridInCorner = 0;
  for (const slot of route.grid) {
    let nearest = 0;
    let best = Infinity;
    route.centerline.forEach((p, i) => {
      const d = (p[0] - slot.x) ** 2 + (p[1] - slot.z) ** 2;
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    if (radii[nearest]! < 150) gridInCorner += 1;
  }
  return { longestStraight: Math.max(0, ...runs.map((run) => run.length)), overtakes, gridInCorner, square: route.corners.filter((corner) => squareShare([corner]) === 1).length };
}

describe("street-race lap search quality", () => {
  test("2–4 km laps on a 1.2 km street-race district: a 250 m straight, an overtaking spot, a grid off the corners, mostly not right angles", () => {
    let square = 0;
    let corners = 0;
    for (const lapLength of [2000, 3200, 4000]) {
      for (const seed of SEEDS) {
        const race = runGenerator(RACE_CIRCUIT_GENERATOR, { ...STREET_RACE, halfX: 600, halfZ: 600, lapLength, seed }) as RaceCircuit;
        const route = race.route!;
        expect(route).not.toBeNull();
        const readout = lapReadout(route);
        expect(readout.longestStraight).toBeGreaterThanOrEqual(250);
        expect(readout.overtakes).toBeGreaterThanOrEqual(1);
        expect(readout.gridInCorner).toBe(0);
        expect(Math.abs(route.length - lapLength) / lapLength).toBeLessThan(0.2);
        // No single lap is a box of right angles…
        expect(readout.square / route.corners.length).toBeLessThanOrEqual(0.75);
        square += readout.square;
        corners += route.corners.length;
      }
    }
    // …and across the preset at most 60% of corners are ~90° (the old search: 96%).
    expect(square / corners).toBeLessThanOrEqual(0.6);
  }, 60_000);

  test("the default 400 m street-race district keeps its grid off the corners and most corners varied", () => {
    let square = 0;
    let corners = 0;
    for (const lapLength of [800, 1200]) {
      for (const seed of SEEDS) {
        const route = (runGenerator(RACE_CIRCUIT_GENERATOR, { ...STREET_RACE, lapLength, seed }) as RaceCircuit).route!;
        const readout = lapReadout(route);
        expect(readout.gridInCorner).toBe(0);
        square += readout.square;
        corners += route.corners.length;
      }
    }
    expect(square / corners).toBeLessThanOrEqual(0.65);
  }, 60_000);

  test("city street races: every preset finds a lap with its grid on a straight", () => {
    const volume = (meta: Record<string, unknown>) => ({ id: "race-city", kind: "city", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 200, y: 10, z: 200 }, meta });
    for (const id of ["manhattan", "metropolis", "losangeles"]) {
      const values = CITY_SCHEMA.presets!.find((preset) => preset.id === id)!.values;
      for (const seed of SEEDS) {
        const race = resolveCityObject(volume({ ...values, race: true, seed }))!.race!;
        expect(race).toBeDefined();
        const readout = lapReadout({ ...race, closed: true, centerline: [...race.centerline], grid: [...race.grid] } as unknown as CircuitRoute);
        expect(readout.gridInCorner).toBe(0);
        expect(readout.longestStraight).toBeGreaterThan(80);
      }
    }
  }, 60_000);

  test("chicanes stand on secondary straights, inside the road, and keep the main straight clean", () => {
    const race = runGenerator(RACE_CIRCUIT_GENERATOR, { ...STREET_RACE, halfX: 600, halfZ: 600, lapLength: 3200, seed: "r3" }) as RaceCircuit;
    const route = race.route!;
    expect(route.chicanes.length).toBeGreaterThan(0);
    for (const chicane of route.chicanes) {
      for (const barrier of chicane.barriers) {
        const at = route.centerline[chicane.entry]!;
        // A barrier run sits across the road it closes, a few meters from the line at most.
        expect(Math.hypot(barrier.x - at[0], barrier.z - at[1])).toBeLessThan(40);
        expect(barrier.width).toBeGreaterThan(0);
        expect(barrier.width).toBeLessThan(route.widths[chicane.entry]!);
      }
      // Never on the start straight the grid stands on.
      expect(Math.abs(chicane.entry - route.centerline.findIndex((p) => p[0] === route.start.x && p[1] === route.start.z))).toBeGreaterThan(8);
    }
    const off = extractCircuitRoute(race.network, parseParams(CIRCUIT_ROUTE_SCHEMA, { lapLength: 3200, chicanes: false }), { seed: "r3" })!;
    expect(off.chicanes).toHaveLength(0);
  }, 30_000);

  test("same network, params and seed give the identical lap", () => {
    const a = runGenerator(RACE_CIRCUIT_GENERATOR, { ...STREET_RACE, halfX: 600, halfZ: 600, lapLength: 2400, seed: "same" });
    const b = runGenerator(RACE_CIRCUIT_GENERATOR, { ...STREET_RACE, halfX: 600, halfZ: 600, lapLength: 2400, seed: "same" });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 30_000);
});

/** Harbor Heat's nine authored roads: four 14 m avenues crossed by five 9 m streets ending on the outer avenues. */
const AUTHORED_ROADS: StreetPath[] = [
  ...[-180, -60, 60, 180].map((x) => ({ points: [[x, -280], [x, 280]] as StreetVec2[], width: 14, level: "avenue" as const })),
  ...[-240, -120, 0, 120, 240].map((z) => ({ points: [[-180, z], [180, z]] as StreetVec2[], width: 9, level: "street" as const })),
];

/** Cyclic position of each node id in the lap's node order. */
function visitsInOrder(route: CircuitRoute, ids: readonly number[]): boolean {
  const order = ids.map((id) => route.nodes.indexOf(id));
  if (order.some((index) => index < 0)) return false;
  // Rotate so the first via is index 0, then the rest must increase.
  const n = route.nodes.length;
  const rotated = order.map((index) => (index - order[0]! + n) % n);
  return rotated.every((index, k) => k === 0 || index > rotated[k - 1]!);
}

describe("street races over authored roads", () => {
  const network = streetNetworkFromPaths(AUTHORED_ROADS);
  const nodeAt = (x: number, z: number): number => network.nodes.find((node) => Math.abs(node.x - x) < 1e-6 && Math.abs(node.z - z) < 1e-6)!.id;

  test("streetNetworkFromPaths splits crossings and T-junctions into a drivable graph", () => {
    // 20 junctions (12 four-way inside, 8 T on the outer avenues), 8 avenue dead ends.
    expect(network.junctions).toHaveLength(20);
    expect(network.deadEnds).toHaveLength(8);
    expect(network.nodes).toHaveLength(28);
    expect(network.edges).toHaveLength(4 * 6 + 5 * 3);
    expect(network.loops).toBe(12);
    expect(network.pathStreets).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const edge of network.edges) {
      const first = edge.points[0]!;
      const last = edge.points[edge.points.length - 1]!;
      const a = network.nodes[edge.a]!;
      const b = network.nodes[edge.b]!;
      expect([first[0], first[1]]).toEqual([a.x, a.z]);
      expect([last[0], last[1]]).toEqual([b.x, b.z]);
      for (let i = 1; i < edge.points.length; i += 1) expect(Math.hypot(edge.points[i]![0] - edge.points[i - 1]![0], edge.points[i]![1] - edge.points[i - 1]![1])).toBeLessThanOrEqual(12 + 1e-9);
    }
    // A path that stops just short of another road still joins it.
    const near = streetNetworkFromPaths([{ points: [[0, -50], [0, 50]] }, { points: [[1, 0], [80, 0]] }]);
    expect(near.junctions).toHaveLength(1);
    expect(near.deadEnds).toHaveLength(3);
  });

  test("a lap lifted through three given junctions passes every one, in order", () => {
    const via: StreetVec2[] = [[-60, -120], [180, -120], [60, 240]];
    const route = extractCircuitRoute(network, parseParams(CIRCUIT_ROUTE_SCHEMA, { lapLength: 1800 }), { seed: "via" }, { via })!;
    expect(route).not.toBeNull();
    expect(route.closed).toBe(true);
    expect(visitsInOrder(route, via.map(([x, z]) => nodeAt(x, z)))).toBe(true);
    // Every edge is an authored street, every lap node visited once.
    expect(new Set(route.nodes).size).toBe(route.nodes.length);
    for (const id of route.edges) expect(network.edges.some((edge) => edge.id === id)).toBe(true);
    expect(lapReadout(route).gridInCorner).toBe(0);
    // Node ids work as anchors too, and the reverse order runs the lap the other way round.
    const reversed = extractCircuitRoute(network, parseParams(CIRCUIT_ROUTE_SCHEMA, { lapLength: 1800 }), { seed: "via" }, { via: [...via].reverse().map(([x, z]) => nodeAt(x, z)) })!;
    expect(visitsInOrder(reversed, [...via].reverse().map(([x, z]) => nodeAt(x, z)))).toBe(true);
  });

  test("a via authored mid-block pins that block, and the start hint places the line beside it", () => {
    const start: StreetVec2 = [0, 120];
    const route = extractCircuitRoute(network, parseParams(CIRCUIT_ROUTE_SCHEMA, { lapLength: 720, gridSlots: 4 }), { seed: "mid" }, { start, via: [[60, 60], [-60, 60]] })!;
    expect(route).not.toBeNull();
    // Mid-block anchors: the lap drives the avenue blocks between z=0 and z=120 at x=±60.
    for (const [x, z] of [[60, 60], [-60, 60]] as const) expect(route.centerline.some((p) => Math.hypot(p[0] - x, p[1] - z) < 5)).toBe(true);
    expect(Math.hypot(route.start.x - start[0], route.start.z - start[1])).toBeLessThan(40);
    expect(lapReadout(route).gridInCorner).toBe(0);
  });

  test("a sprint runs point to point through its via, finishing at the far end", () => {
    const from: StreetVec2 = [-180, -240];
    const to: StreetVec2 = [180, 240];
    const route = extractCircuitRoute(network, parseParams(CIRCUIT_ROUTE_SCHEMA, { lapLength: 900, gridSlots: 4, checkpoints: 6 }), { seed: "sprint" }, { kind: "sprint", start: from, via: [[60, 0]], finish: to })!;
    expect(route).not.toBeNull();
    expect(route.closed).toBe(false);
    expect(route.laps).toBe(1);
    expect(route.nodes[0]).toBe(nodeAt(...from));
    expect(route.nodes[route.nodes.length - 1]).toBe(nodeAt(...to));
    expect(route.nodes).toContain(nodeAt(60, 0));
    const end = route.centerline[route.centerline.length - 1]!;
    expect(Math.hypot(end[0] - to[0], end[1] - to[1])).toBeLessThan(1);
    const finish = route.checkpoints[route.checkpoints.length - 1]!;
    expect(finish.id).toBe("finish");
    expect(Math.hypot(finish.center[0] - to[0], finish.center[2] - to[1])).toBeLessThan(1);
    expect(lapReadout(route).gridInCorner).toBe(0);
  });

  test("a city hosts several named races, each distinct", () => {
    const race = runGenerator(RACE_CIRCUIT_GENERATOR, { ...STREET_RACE, halfX: 600, halfZ: 600, seed: "calendar" }) as RaceCircuit;
    const races = extractStreetRaces(
      race.network,
      [
        { id: "grand-prix", label: "Grand Prix", params: { lapLength: 3200 } },
        { id: "night-loop", params: { lapLength: 2000 } },
        { id: "dash", kind: "sprint", params: { lapLength: 1500 } },
      ],
      parseParams(CIRCUIT_ROUTE_SCHEMA, {}),
      { seed: "calendar" },
    );
    expect(races.map((r) => [r.id, r.label])).toEqual([["grand-prix", "Grand Prix"], ["night-loop", "night-loop"], ["dash", "dash"]]);
    for (const r of races) expect(r.route).not.toBeNull();
    expect(races[2]!.route!.closed).toBe(false);
    const first = new Set(races[0]!.route!.edges);
    const shared = races[1]!.route!.edges.filter((edge) => first.has(edge)).length;
    expect(shared / races[1]!.route!.edges.length).toBeLessThan(0.5);
  }, 30_000);
});

describe("race events", () => {
  test("barriers stand only while the race runs", () => {
    const seen: boolean[] = [];
    const stop = subscribeStreetRaceEvents(() => seen.push(streetRaceEventActive("city-a")));
    expect(streetRaceEventActive("city-a")).toBe(false);
    startStreetRaceEvent("city-a");
    startStreetRaceEvent("city-a");
    expect(streetRaceEventActive("city-a")).toBe(true);
    endStreetRaceEvent("city-a");
    endStreetRaceEvent("city-a");
    stop();
    startStreetRaceEvent("city-a");
    endStreetRaceEvent("city-a");
    expect(seen).toEqual([true, false]);
  });
});
