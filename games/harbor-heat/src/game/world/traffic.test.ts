import { describe, expect, test } from "bun:test";
import { createTraffic, type LaneGraph, type Traffic } from "@jgengine/core/world";

import { editorLayers } from "../../editorLayers";
import { cityLayout } from "./cityLayout";
import { fleetAtHour, laneGraph, layoutLanes } from "./traffic";

const graph: LaneGraph = laneGraph();

/** Put a fleet on the graph the way the game does: evenly spread along every authored lane span. */
function seed(traffic: Traffic, count: number): void {
  const lanes = graph.laneIds();
  let total = 0;
  for (const id of lanes) total += graph.lane(id)?.length ?? 0;
  const spacing = total / count;
  let cursor = spacing * 0.5;
  let placed = 0;
  for (const laneId of lanes) {
    const lane = graph.lane(laneId);
    if (lane === null) continue;
    while (cursor < lane.length && placed < count) {
      if (traffic.add(`traffic-${placed}`, { laneId, arc: cursor, speed: lane.speed * 0.55 })) placed += 1;
      cursor += spacing;
    }
    cursor -= lane.length;
  }
}

describe("Mainsail authored lane graph", () => {
  test("every authored lane span resolves into the graph", () => {
    expect(graph.laneIds()).toHaveLength(126);
    // 20 authored crossings plus the eight city-edge terminals where a street ends.
    expect(graph.nodeIds()).toHaveLength(28);
    expect(graph.nodeIds().filter((id) => id.startsWith("xi_"))).toHaveLength(20);
  });

  test("every crossing has approaches and departures on both streets", () => {
    for (const crossing of graph.intersections()) {
      if (!crossing.node.startsWith("xi_")) continue;
      expect(crossing.inLanes.length).toBeGreaterThanOrEqual(5);
      expect(crossing.inLanes.length).toBe(crossing.outLanes.length);
    }
  });

  test("every authored crossing runs a signal program in two phases", () => {
    const crossings = graph.intersections().filter((c) => c.node.startsWith("xi_"));
    for (const crossing of crossings) {
      expect(crossing.kind).toBe("signal");
      expect(crossing.signal?.greenSeconds).toBeGreaterThan(0);
      expect(crossing.signal?.yellowSeconds).toBeGreaterThan(0);
    }
    const traffic = createTraffic({ graph, seed: "signals" });
    try {
      // The signal clock advances with the tick, so read it after one step.
      traffic.tick(1 / 20);
      const state = traffic.signal("xi_av_cw_st_m");
      expect(state).not.toBeNull();
      expect(state?.lanes.length).toBeGreaterThan(0);
      // One full cycle shows green, yellow and red, and serves both crossing lanes in turn.
      const seen = new Set<string>();
      const phases = new Set<number>();
      for (let step = 0; step < 40 * 20; step += 1) {
        traffic.tick(1 / 20);
        const reading = traffic.signal("xi_av_cw_st_m");
        if (reading === null) continue;
        seen.add(reading.state);
        if (reading.state === "green") phases.add(reading.phase);
      }
      expect([...seen].sort()).toEqual(["green", "red", "yellow"]);
      expect(phases.size).toBe(2);
    } finally {
      traffic.dispose();
    }
  });

  test("the fleet enters at the city edge and the kerbside spots sit on the outer lanes", () => {
    expect(graph.entries().length).toBeGreaterThan(8);
    expect(graph.exits().length).toBeGreaterThan(8);
    const spots = graph.spots();
    expect(spots).toHaveLength(16);
    for (const spot of spots) {
      const lane = graph.lane(spot.lane);
      expect(lane).not.toBeNull();
      // A spot only ever lands on an avenue's outer lane, so a parked car leaves the inner lane free.
      expect(spot.lane).toMatch(/_out_\d+$/);
      expect(spot.arc).toBeGreaterThan(0);
      expect(spot.arc).toBeLessThan(lane!.length);
    }
  });

  test("lanes name the parallel lane a car may change into", () => {
    const inner = graph.lane("tl_av_w_nb_in_1");
    const outer = graph.lane("tl_av_w_nb_out_1");
    expect(inner?.right).toBe("tl_av_w_nb_out_1");
    expect(outer?.left).toBe("tl_av_w_nb_in_1");
  });
});

describe("Mainsail traffic", () => {
  test("the fleet target follows the in-game clock", () => {
    expect(fleetAtHour(4)).toBeLessThan(fleetAtHour(9));
    expect(fleetAtHour(9)).toBeLessThan(fleetAtHour(17));
    expect(fleetAtHour(17)).toBeGreaterThan(fleetAtHour(22));
    // Interpolated between whole hours, so a clock tick never steps the count.
    expect(fleetAtHour(7.5)).toBeGreaterThan(fleetAtHour(7));
    expect(fleetAtHour(7.5)).toBeLessThan(fleetAtHour(8));
  });

  test("ten simulated minutes at rush hour neither deadlocks nor stalls", () => {
    const traffic = createTraffic({
      graph,
      seed: "harbor-heat-traffic",
      idPrefix: "traffic",
      tuning: { spawnGap: 18, laneChangeCooldown: 3.5 },
    });
    try {
      const demand = 60;
      seed(traffic, demand);
      traffic.setDemand(demand);
      for (let step = 0; step < 600 * 20; step += 1) traffic.tick(1 / 20);
      const stats = traffic.stats();
      expect(stats.ticks).toBe(600 * 20);
      expect(stats.stalls).toBe(0);
      expect(stats.maxDeadlockSeconds).toBeLessThan(3);
      // The city keeps moving: cars cross junctions, change lanes and reach the far ends.
      expect(stats.meanSpeed).toBeGreaterThan(4);
      expect(stats.laneChanges).toBeGreaterThan(0);
      expect(stats.exited + stats.retired).toBeGreaterThanOrEqual(0);
      expect(stats.cars).toBeGreaterThanOrEqual(demand);
    } finally {
      traffic.dispose();
    }
  });

  test("a car takes an authored kerb space and gives it back", () => {
    const spot = graph.spots()[0]!;
    const lane = graph.lane(spot.lane)!;
    const traffic = createTraffic({ graph, seed: "parking" });
    try {
      expect(traffic.add("parker", { laneId: spot.lane, arc: 0, speed: 4 })).toBe(true);
      expect(traffic.park("parker", spot.id)).toBe(true);
      expect(traffic.spotOwner(spot.id)).toBe("parker");
      for (let step = 0; step < 40 * 20; step += 1) traffic.tick(1 / 20);
      expect(traffic.car("parker")?.state).toBe("parked");
      expect(traffic.car("parker")?.arc).toBeCloseTo(spot.arc, 1);
      expect(traffic.stats().parks).toBeGreaterThan(0);
      expect(traffic.releaseParking("parker")).toBe(true);
      traffic.tick(1 / 20);
      expect(traffic.car("parker")?.state).toBe("driving");
      expect(traffic.spotOwner(spot.id)).toBeNull();
      expect(lane.length).toBeGreaterThan(spot.arc);
    } finally {
      traffic.dispose();
    }
  });
});

describe("lanes follow the city layout", () => {
  const base = cityLayout.get();
  const lane = (doc: ReturnType<typeof layoutLanes>, id: string) => doc.paths.find((path) => path.id === id);

  test("a lane sits at its slot's centre for the layout's lane width", () => {
    const narrow = layoutLanes(editorLayers, { ...base, laneWidth: 3 });
    const wide = layoutLanes(editorLayers, { ...base, laneWidth: 4 });
    // Avenue W runs north-south at x = -180; its inside northbound lane is half a lane off the line.
    expect(Math.abs(lane(narrow, "tl_av_w_nb_in_0")!.points[0]!.x + 180)).toBeCloseTo(1.5, 5);
    expect(Math.abs(lane(wide, "tl_av_w_nb_in_0")!.points[0]!.x + 180)).toBeCloseTo(2, 5);
    expect(Math.abs(lane(wide, "tl_av_w_nb_out_0")!.points[0]!.x + 180)).toBeCloseTo(6, 5);
  });

  test("a two-lane avenue drops its outside lanes and the links to them", () => {
    const doc = layoutLanes(editorLayers, { ...base, avenueLanes: 2 });
    expect(lane(doc, "tl_av_w_nb_out_0")).toBeUndefined();
    expect(lane(doc, "tl_av_w_nb_in_0")!.meta?.right).toBeUndefined();
    expect(laneGraph({ ...base, avenueLanes: 2 }).laneIds().length).toBeLessThan(graph.laneIds().length);
  });

  test("kerb spots move out with a wider street", () => {
    const spot = (doc: ReturnType<typeof layoutLanes>) => doc.markers.find((marker) => marker.id === "park_av_w_nb_1")!;
    const before = Math.abs(spot(layoutLanes(editorLayers, base)).position.x + 180);
    const after = Math.abs(spot(layoutLanes(editorLayers, { ...base, laneWidth: 4.5 })).position.x + 180);
    // Four lanes a metre wider push each kerb out two metres.
    expect(after - before).toBeCloseTo(2, 5);
  });
});
