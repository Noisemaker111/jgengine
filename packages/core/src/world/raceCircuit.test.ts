import { describe, expect, test } from "bun:test";

import { raceTrack } from "../game/race";
import { circuitKerbs, extractCircuitRoute, type CircuitRoute } from "./raceCircuit";
import { generateStreets, type StreetNetworkRules } from "./streetGenerator";

const CITY: Omit<StreetNetworkRules, "seed"> = {
  gridness: 0.9,
  loopiness: 0.3,
  connectivity: 0.85,
  branching: 0.4,
  deadEnds: 0.15,
  segmentLength: 90,
  aspect: 1.2,
  winding: 0.15,
  minCurveRadius: 20,
  minTurnAngle: 10,
  maxTurnAngle: 110,
  width: 9,
  boulevards: 0.3,
};

const CIRCUIT: Omit<StreetNetworkRules, "seed"> = {
  gridness: 0,
  loopiness: 1,
  connectivity: 0,
  branching: 0,
  deadEnds: 0,
  segmentLength: 80,
  aspect: 1,
  winding: 0.5,
  minCurveRadius: 24,
  minTurnAngle: 10,
  maxTurnAngle: 100,
  width: 10,
  boulevards: 0,
};

function cityRoute(seed = "race-a", rules: Partial<StreetNetworkRules> = {}): CircuitRoute {
  const network = generateStreets({ seed, ...CITY, ...rules }, 320, 320);
  const route = extractCircuitRoute(network, { seed });
  expect(route).not.toBeNull();
  return route as CircuitRoute;
}

describe("extractCircuitRoute", () => {
  test("lifts a closed lap out of a city street network", () => {
    const route = cityRoute();
    expect(route.centerline.length).toBeGreaterThan(20);
    expect(route.edges.length).toBe(route.nodes.length);
    expect(route.length).toBeGreaterThan(200);
    // Implicitly closed: the last centerline point is one step from the first, not a duplicate.
    const first = route.centerline[0]!;
    const last = route.centerline[route.centerline.length - 1]!;
    expect(Math.hypot(last[0] - first[0], last[1] - first[1])).toBeGreaterThan(0);
    expect(Math.hypot(last[0] - first[0], last[1] - first[1])).toBeLessThan(60);
  });

  test("the lap runs on streets the city already has — every edge is a network edge", () => {
    const network = generateStreets({ seed: "race-shared", ...CITY }, 320, 320);
    const route = extractCircuitRoute(network, { seed: "race-shared" });
    expect(route).not.toBeNull();
    const byId = new Map(network.edges.map((edge) => [edge.id, edge]));
    for (const id of route!.edges) expect(byId.has(id)).toBe(true);
    // Widths are inherited from those streets, never invented.
    const widths = route!.edges.map((id) => byId.get(id)!.width);
    const narrowest = Math.min(...widths);
    const widest = Math.max(...widths);
    for (const width of route!.widths) {
      expect(width).toBeGreaterThanOrEqual(narrowest - 1e-9);
      expect(width).toBeLessThanOrEqual(widest + 1e-9);
    }
  });

  test("seals every street that leaves the lap and is not part of it", () => {
    const network = generateStreets({ seed: "race-seal", ...CITY }, 320, 320);
    const route = extractCircuitRoute(network, { seed: "race-seal" });
    expect(route).not.toBeNull();
    const onRoute = new Set(route!.edges);
    const routeNodes = new Set(route!.nodes);
    let expected = 0;
    for (const edge of network.edges) {
      if (onRoute.has(edge.id)) continue;
      if (routeNodes.has(edge.a)) expected += 1;
      if (routeNodes.has(edge.b)) expected += 1;
    }
    expect(route!.seals.length).toBe(expected);
    expect(route!.seals.length).toBeGreaterThan(0);
    for (const seal of route!.seals) {
      expect(routeNodes.has(seal.node)).toBe(true);
      expect(seal.width).toBeGreaterThan(0);
      expect(seal.kind).toBe("barrier");
    }
  });

  test("seals stand clear of the racing surface", () => {
    const route = cityRoute("race-clear");
    for (const seal of route.seals) {
      let nearest = Infinity;
      for (let i = 0; i < route.centerline.length; i += 1) {
        const point = route.centerline[i]!;
        const gap = Math.hypot(point[0] - seal.x, point[1] - seal.z) - (route.widths[i] ?? 9) * 0.5;
        if (gap < nearest) nearest = gap;
      }
      expect(nearest).toBeGreaterThan(0);
    }
  });

  test("checkpoints feed raceTrack directly, finish line last", () => {
    const route = cityRoute("race-gates", {});
    expect(route.checkpoints.length).toBe(12);
    expect(route.checkpoints[route.checkpoints.length - 1]!.id).toBe("finish");
    const track = raceTrack({ checkpoints: route.checkpoints, laps: route.laps });
    expect(track.checkpoints.length).toBe(12);
    expect(track.laps).toBe(3);
    for (const gate of route.checkpoints) {
      expect(gate.half[0]).toBeGreaterThan(0);
      expect(gate.half[1]).toBeGreaterThan(0);
      expect(gate.half[2]).toBeGreaterThan(0);
    }
  });

  test("checkpoints are spaced around the lap, not bunched", () => {
    const route = cityRoute("race-spacing");
    const spacing = route.length / route.checkpoints.length;
    for (let i = 1; i < route.checkpoints.length; i += 1) {
      const a = route.checkpoints[i - 1]!.center;
      const b = route.checkpoints[i]!.center;
      // Straight-line gap is at most the arc spacing, and a real fraction of it.
      const gap = Math.hypot(b[0] - a[0], b[2] - a[2]);
      expect(gap).toBeLessThanOrEqual(spacing * 1.05);
      expect(gap).toBeGreaterThan(spacing * 0.15);
    }
  });

  test("grid slots stagger behind the start line facing the way cars travel", () => {
    const route = cityRoute("race-grid");
    expect(route.grid.length).toBe(12);
    // Every slot sits behind the line, and rows march further back in pairs.
    const back = route.grid.map((slot) => Math.hypot(slot.x - route.start.x, slot.z - route.start.z));
    expect(Math.min(...back)).toBeGreaterThan(0);
    expect(back[back.length - 1]).toBeGreaterThan(back[0]!);
    // Columns straddle the centerline: consecutive pairs sit on opposite sides.
    const lateral = route.start.heading + Math.PI / 2;
    const sides = route.grid.map((slot) => {
      const dx = slot.x - route.start.x;
      const dz = slot.z - route.start.z;
      return Math.sign(dx * Math.sin(lateral) + dz * Math.cos(lateral));
    });
    expect(new Set(sides).size).toBeGreaterThan(1);
  });

  test("the start line spans the road it sits on", () => {
    const route = cityRoute("race-line");
    const [left, right] = route.start.line;
    const span = Math.hypot(right[0] - left[0], right[1] - left[1]);
    expect(span).toBeCloseTo(route.start.width, 5);
  });

  test("sectors partition the lap", () => {
    const route = cityRoute("race-sectors");
    expect(route.sectors.length).toBe(3);
    expect(route.sectors[0]).toBe(0);
    for (let i = 1; i < route.sectors.length; i += 1) {
      expect(route.sectors[i]!).toBeGreaterThan(route.sectors[i - 1]!);
      expect(route.sectors[i]!).toBeLessThan(1);
    }
  });

  test("deterministic — same network and rules give the identical lap", () => {
    const a = cityRoute("race-determinism");
    const b = cityRoute("race-determinism");
    expect(b.edges).toEqual(a.edges);
    expect(b.length).toBeCloseTo(a.length, 9);
    expect(b.start.x).toBeCloseTo(a.start.x, 9);
  });

  test("a longer requested lap picks a longer cycle", () => {
    const network = generateStreets({ seed: "race-length", ...CITY }, 420, 420);
    const short = extractCircuitRoute(network, { seed: "race-length", lapLength: 700 });
    const long = extractCircuitRoute(network, { seed: "race-length", lapLength: 3200 });
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    expect(long!.length).toBeGreaterThan(short!.length);
  });

  test("arterial bias keeps the lap on the wide roads", () => {
    const network = generateStreets({ seed: "race-arterial", ...CITY, boulevards: 0.5 }, 380, 380);
    const any = extractCircuitRoute(network, { seed: "race-arterial", arterialBias: 0 });
    const wide = extractCircuitRoute(network, { seed: "race-arterial", arterialBias: 1 });
    expect(any).not.toBeNull();
    expect(wide).not.toBeNull();
    expect(wide!.arterialShare).toBeGreaterThanOrEqual(any!.arterialShare);
  });

  test("the generator's own circuit mode returns its whole loop as the lap", () => {
    const network = generateStreets({ seed: "loop-mode", ...CIRCUIT }, 300, 300);
    expect(network.mode).toBe("circuit");
    const route = extractCircuitRoute(network, { seed: "loop-mode" });
    expect(route).not.toBeNull();
    const loopEdges = network.edges.filter((edge) => edge.loop).length;
    expect(route!.edges.length).toBe(loopEdges);
    // A bare circuit has no side streets to close, unless a pit lane forks off it.
    expect(route!.seals.length).toBe(0);
  });

  test("returns null for a network with no drivable cycle", () => {
    const network = generateStreets(
      { seed: "tree", ...CITY, loopiness: 0, connectivity: 0, deadEnds: 1, branching: 0.8 },
      160,
      160,
    );
    if (network.loops === 0) expect(extractCircuitRoute(network, { seed: "tree" })).toBeNull();
  });

  test("carries road elevation through when the network has it", () => {
    const network = generateStreets({ seed: "race-hills", ...CITY, elevation: 0.8 }, 320, 320);
    const route = extractCircuitRoute(network, { seed: "race-hills" });
    expect(route).not.toBeNull();
    expect(route!.heights).toBeDefined();
    expect(route!.heights!.length).toBe(route!.centerline.length);
    const spread = Math.max(...route!.heights!) - Math.min(...route!.heights!);
    expect(spread).toBeGreaterThan(0);
    // Gates ride the road, not the origin plane.
    const gateHeights = route!.checkpoints.map((gate) => gate.center[1]);
    expect(Math.max(...gateHeights)).toBeGreaterThan(Math.min(...gateHeights));
  });

  test("corners are found and kerbed on both sides", () => {
    const route = cityRoute("race-corners", { winding: 0.6, gridness: 0.2 });
    expect(route.corners.length).toBeGreaterThan(0);
    for (const corner of route.corners) {
      expect(corner.radius).toBeGreaterThan(0);
      expect(Math.abs(corner.direction)).toBe(1);
      expect(corner.apex).toBeGreaterThanOrEqual(0);
      expect(corner.apex).toBeLessThan(route.centerline.length);
    }
    const kerbs = circuitKerbs(route);
    expect(kerbs.length).toBe(route.corners.length * 2);
    for (const kerb of kerbs) {
      expect(kerb.points.length).toBeGreaterThanOrEqual(2);
      expect(kerb.width).toBeGreaterThan(0);
      expect(Math.abs(kerb.side)).toBe(1);
    }
  });

  test("kerbs hug the road edge of the corner they belong to", () => {
    const route = cityRoute("race-kerb-offset", { winding: 0.6, gridness: 0.2 });
    const kerbs = circuitKerbs(route);
    expect(kerbs.length).toBeGreaterThan(0);
    const n = route.centerline.length;
    for (const kerb of kerbs) {
      const corner = route.corners[kerb.corner]!;
      // Measure against this corner's own span: at a hairpin the lap legitimately doubles back, so a
      // global nearest-point search finds the other leg rather than the edge this kerb paves.
      const span: number[] = [];
      for (let cursor = corner.entry, guard = 0; guard < n; guard += 1) {
        span.push(cursor);
        if (cursor === corner.exit) break;
        cursor = (cursor + 1) % n;
      }
      // Width varies where a corner crosses from one street onto another, so bound against the span.
      const halves = span.map((index) => (route.widths[index] ?? 9) * 0.5);
      const narrowest = Math.min(...halves);
      const widest = Math.max(...halves);
      for (const point of kerb.points) {
        let nearest = Infinity;
        for (const index of span) {
          const centre = route.centerline[index]!;
          const gap = Math.hypot(centre[0] - point[0], centre[1] - point[1]);
          if (gap < nearest) nearest = gap;
        }
        expect(nearest).toBeGreaterThan(narrowest * 0.5);
        expect(nearest).toBeLessThan(widest * 1.05);
      }
    }
  });
});
