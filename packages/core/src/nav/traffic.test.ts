import { describe, expect, test } from "bun:test";
import { createLaneGraph, type LaneEdgeConfig, type LaneGraph } from "@jgengine/core/nav/laneGraph";
import { createTraffic, type Traffic } from "@jgengine/core/nav/traffic";

const DT = 1 / 30;

const CROSS_LANES: readonly LaneEdgeConfig[] = [
  { id: "east-in", points: [[60, 0, 0], [0, 0, 0]], speed: 12, entry: true },
  { id: "west-in", points: [[-60, 0, 0], [0, 0, 0]], speed: 12, entry: true },
  { id: "north-in", points: [[0, 0, -60], [0, 0, 0]], speed: 12, entry: true },
  { id: "south-in", points: [[0, 0, 60], [0, 0, 0]], speed: 12, entry: true },
  { id: "east-out", points: [[0, 0, 0], [60, 0, 0]], speed: 12, exit: true },
  { id: "west-out", points: [[0, 0, 0], [-60, 0, 0]], speed: 12, exit: true },
  { id: "north-out", points: [[0, 0, 0], [0, 0, -60]], speed: 12, exit: true },
  { id: "south-out", points: [[0, 0, 0], [0, 0, 60]], speed: 12, exit: true },
];

function crossGraph(): LaneGraph {
  return createLaneGraph({ lanes: CROSS_LANES });
}

function run(traffic: Traffic, seconds: number, observe?: (tick: number) => void): void {
  const ticks = Math.round(seconds / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    traffic.tick(DT);
    observe?.(tick);
  }
}

/** Smallest bumper-to-bumper clearance seen between two cars on one lane. */
function pairGap(traffic: Traffic, aId: string, bId: string): number {
  const a = traffic.car(aId);
  const b = traffic.car(bId);
  if (a === null || b === null || a.laneId !== b.laneId) return Number.POSITIVE_INFINITY;
  return Math.abs(a.arc - b.arc) - 4.4;
}

describe("traffic", () => {
  test("a following car brakes behind a car that stops, without overlapping it", () => {
    const graph = createLaneGraph({
      lanes: [{ id: "street", points: [[0, 0, 0], [240, 0, 0]], speed: 14, entry: true, exit: true, parking: [120] }],
    });
    const traffic = createTraffic({ graph, seed: "car-following" });
    traffic.add("leader", { laneId: "street", arc: 30, speed: 8 });
    traffic.add("follower", { laneId: "street", arc: 0, speed: 10 });
    expect(traffic.park("leader")).toBe(true);

    let smallest = Number.POSITIVE_INFINITY;
    run(traffic, 40, () => {
      smallest = Math.min(smallest, pairGap(traffic, "leader", "follower"));
    });

    const leader = traffic.car("leader")!;
    const follower = traffic.car("follower")!;
    expect(leader.state).toBe("parked");
    expect(leader.arc).toBeCloseTo(120, 1);
    expect(follower.state).toBe("driving");
    expect(follower.speed).toBeLessThan(0.2);
    expect(follower.arc).toBeLessThan(leader.arc);
    expect(smallest).toBeGreaterThan(-0.05);
    expect(follower.arc - leader.arc).toBeLessThan(-4.4 + 0.05);
  });

  test("a car holds at the stop line while its signal is red and crosses on green", () => {
    const graph = createLaneGraph({
      lanes: CROSS_LANES,
      intersections: [
        { node: "@0.0,0.0", signal: { greenSeconds: 8, yellowSeconds: 2, allRedSeconds: 1, phases: [["west-in"], ["east-in"]] } },
      ],
    });
    const traffic = createTraffic({ graph, seed: "signals" });
    traffic.add("car", { laneId: "east-in", arc: 40, speed: 10 });

    const seenStates = new Set<string>();
    const seenPhases = new Set<number>();
    let crossedAt: { phase: number; state: string } | null = null;
    let heldOnRed = 0;
    let previousLane = "east-in";

    run(traffic, 120, () => {
      const signal = traffic.signal("@0.0,0.0")!;
      seenStates.add(signal.state);
      seenPhases.add(signal.phase);
      const car = traffic.car("car");
      if (car === null) return;
      if (car.laneId === "east-in" && car.arc > 55 && signal.state !== "green") heldOnRed += 1;
      if (previousLane === "east-in" && car.laneId !== "east-in" && crossedAt === null) {
        crossedAt = { phase: signal.phase, state: signal.state };
      }
      previousLane = car.laneId;
    });

    expect([...seenStates].sort()).toEqual(["green", "red", "yellow"]);
    expect([...seenPhases].sort()).toEqual([0, 1]);
    expect(crossedAt).not.toBeNull();
    expect(heldOnRed).toBe(0);
    // Least turn from east-in is straight through to the far side.
    expect(traffic.car("car")).toBeNull();
    expect(traffic.stats().exited).toBe(1);
  });

  test("two cars reaching a four-way together resolve it first-come, one in the box at a time", () => {
    const graph = crossGraph();
    const traffic = createTraffic({ graph, seed: "priority", tuning: { boxClearance: 4 } });
    traffic.add("east", { laneId: "east-in", arc: 52, speed: 8 });
    traffic.add("north", { laneId: "north-in", arc: 52, speed: 8 });

    let mostBoxed = 0;
    const crossingOrder: string[] = [];
    let previousLane = new Map<string, string>();
    run(traffic, 30, () => {
      mostBoxed = Math.max(mostBoxed, traffic.stats().boxed);
      for (const id of ["east", "north"]) {
        const car = traffic.car(id);
        const before = previousLane.get(id);
        if (car !== null && before !== undefined && before.endsWith("-in") && car.laneId !== before) crossingOrder.push(id);
        if (car !== null) previousLane.set(id, car.laneId);
      }
    });

    expect(mostBoxed).toBe(1);
    expect(crossingOrder).toEqual(["east", "north"]);
    expect(traffic.stats().stalls).toBe(0);
  });

  test("a blocked car changes into a free neighbour lane, and stays put when it is occupied", () => {
    const lanes: readonly LaneEdgeConfig[] = [
      { id: "a", points: [[0, 0, 0], [240, 0, 0]], speed: 14, entry: true, exit: true, left: "b", parking: [90] },
      { id: "b", points: [[0, 0, 4], [240, 0, 4]], speed: 14, entry: true, exit: true, right: "a", parking: [75] },
    ];
    const free = createTraffic({ graph: createLaneGraph({ lanes }), seed: "lane-change" });
    free.add("stopper", { laneId: "a", arc: 20, speed: 8 });
    free.add("mover", { laneId: "a", arc: 0, speed: 10 });
    expect(free.park("stopper")).toBe(true);
    run(free, 12);
    expect(free.car("mover")?.laneId).toBe("b");
    expect(free.stats().laneChanges).toBeGreaterThan(0);

    const blocked = createTraffic({ graph: createLaneGraph({ lanes }), seed: "lane-change" });
    blocked.add("stopper", { laneId: "a", arc: 20, speed: 8 });
    blocked.add("mover", { laneId: "a", arc: 0, speed: 10 });
    blocked.add("neighbour", { laneId: "b", arc: 73, speed: 2 });
    expect(blocked.park("stopper")).toBe(true);
    expect(blocked.park("neighbour", "b:parking:0")).toBe(true);
    run(blocked, 12);
    expect(blocked.car("neighbour")?.state).toBe("parked");
    expect(blocked.car("mover")?.laneId).toBe("a");
    expect(blocked.stats().laneChanges).toBe(0);
  });

  test("parking is a state with an occupancy check, and a parked car can rejoin the lane", () => {
    const graph = createLaneGraph({
      lanes: [
        { id: "north", points: [[0, 0, 0], [200, 0, 0]], speed: 12, entry: true, exit: true, parking: [60] },
        { id: "south", points: [[0, 0, 6], [200, 0, 6]], speed: 12, entry: true, exit: true, parking: [60] },
      ],
    });
    const traffic = createTraffic({ graph, seed: "parking" });
    traffic.add("one", { laneId: "north", arc: 10, speed: 8 });
    traffic.add("two", { laneId: "south", arc: 10, speed: 8 });
    traffic.add("three", { laneId: "north", arc: 0, speed: 0 });

    expect(traffic.park("one")).toBe(true);
    expect(traffic.park("two")).toBe(true);
    expect(traffic.park("three", "north:parking:0")).toBe(false);
    expect(traffic.park("three", "south:parking:0")).toBe(false);
    expect(traffic.spotOwner("north:parking:0")).toBe("one");
    expect(traffic.spotOwner("south:parking:0")).toBe("two");

    run(traffic, 40);
    expect(traffic.car("one")?.state).toBe("parked");
    expect(traffic.car("two")?.state).toBe("parked");
    expect(traffic.stats().parks).toBe(2);
    expect(traffic.car("one")?.arc).toBeCloseTo(60, 3);

    expect(traffic.releaseParking("one")).toBe(true);
    expect(traffic.spotOwner("north:parking:0")).toBeNull();
    run(traffic, 2);
    expect(traffic.car("one")?.state).toBe("driving");
    expect(traffic.car("one")?.speed).toBeGreaterThan(0.5);
    expect(traffic.park("three", "north:parking:0")).toBe(true);
    run(traffic, 40);
    expect(traffic.car("three")?.state).toBe("parked");
    expect(traffic.stats().parks).toBe(3);
  });

  test("demand is the caller's fleet count, not a built-in curve", () => {
    const traffic = createTraffic({ graph: crossGraph(), seed: "demand", tuning: { fleetPerTick: 8 } });
    const timeOfDayDensity = (secondsOfDay: number): number =>
      secondsOfDay < 6 * 3600 ? 2 : secondsOfDay < 9 * 3600 ? 10 : 5;

    traffic.setDemand(timeOfDayDensity(7 * 3600));
    run(traffic, 20);
    expect(traffic.demand()).toBe(10);
    expect(traffic.count()).toBe(10);

    traffic.setDemand(timeOfDayDensity(23 * 3600));
    run(traffic, 2);
    expect(traffic.count()).toBeLessThanOrEqual(5);
    expect(traffic.count()).toBeGreaterThanOrEqual(3);
    expect(traffic.stats().retired).toBeGreaterThan(0);
  });

  test("state round-trips: a restored run matches the run that never saved", () => {
    const build = (): Traffic =>
      createTraffic({ graph: crossGraph(), seed: "round-trip", demand: 12, tuning: { fleetPerTick: 8 } });
    const live = build();
    run(live, 30);
    const snapshot = live.snapshot();

    const resumed = build();
    resumed.restore(snapshot);

    run(live, 15);
    run(resumed, 15);

    const sum = (traffic: Traffic) =>
      traffic
        .ids()
        .sort()
        .map((id) => {
          const car = traffic.car(id)!;
          return `${id}:${car.laneId}:${car.arc.toFixed(6)}:${car.speed.toFixed(6)}:${car.state}`;
        });
    expect(sum(resumed)).toEqual(sum(live));
    expect(resumed.stats().exited).toBe(live.stats().exited);
  });

  test("same seed, same fleet, tick for tick", () => {
    const build = (): Traffic => createTraffic({ graph: crossGraph(), seed: "determinism", demand: 16, tuning: { fleetPerTick: 8 } });
    const one = build();
    const two = build();
    run(one, 60);
    run(two, 60);
    const project = (traffic: Traffic) =>
      traffic
        .ids()
        .sort()
        .map((id) => {
          const car = traffic.car(id)!;
          return [id, car.laneId, Number(car.arc.toFixed(6)), Number(car.speed.toFixed(6))];
        });
    expect(project(two)).toEqual(project(one));
    const withoutTiming = (traffic: Traffic): Record<string, number> => {
      const { slowestTickMs, maxStillSeconds, maxDeadlockSeconds, ...counters } = traffic.stats();
      void slowestTickMs;
      void maxStillSeconds;
      void maxDeadlockSeconds;
      return counters;
    };
    expect(withoutTiming(two)).toEqual(withoutTiming(one));
  });

  test("flowing traffic never stops with clear road ahead", () => {
    const traffic = createTraffic({ graph: crossGraph(), seed: "flow", demand: 12, tuning: { fleetPerTick: 4 } });
    run(traffic, 300);
    const stats = traffic.stats();
    expect(stats.stalls).toBe(0);
    expect(stats.exited).toBeGreaterThan(40);
    expect(stats.spawned).toBeGreaterThan(40);
    expect(stats.meanSpeed).toBeGreaterThan(3);
    expect(traffic.ids().length).toBeLessThanOrEqual(12);
    for (const id of traffic.ids()) {
      const car = traffic.car(id)!;
      expect(Number.isFinite(car.arc)).toBe(true);
      expect(Number.isFinite(car.position[0])).toBe(true);
    }
  });
});
