import { describe, expect, test } from "bun:test";
import { createLaneGraph, type LaneEdgeConfig, type LaneGraph } from "@jgengine/core/nav/laneGraph";
import { createTraffic, type Traffic } from "@jgengine/core/nav/traffic";
import { gateTimingMs } from "../../../../scripts/timing-budget";
import { devtools } from "@jgengine/core/devtools/devtools";

const DT = 1 / 30;
const CAR_LENGTH = 4.4;

const CROSS_LANES: readonly LaneEdgeConfig[] = [
  { id: "east-in", points: [[80, 0, 0], [0, 0, 0]], speed: 12, entry: true },
  { id: "west-in", points: [[-80, 0, 0], [0, 0, 0]], speed: 12, entry: true },
  { id: "north-in", points: [[0, 0, -80], [0, 0, 0]], speed: 12, entry: true },
  { id: "south-in", points: [[0, 0, 80], [0, 0, 0]], speed: 12, entry: true },
  { id: "east-out", points: [[0, 0, 0], [80, 0, 0]], speed: 12, exit: true },
  { id: "west-out", points: [[0, 0, 0], [-80, 0, 0]], speed: 12, exit: true },
  { id: "north-out", points: [[0, 0, 0], [0, 0, -80]], speed: 12, exit: true },
  { id: "south-out", points: [[0, 0, 0], [0, 0, 80]], speed: 12, exit: true },
];

/** A street grid with signalled crossings; boundary lanes are the caller's entry and exit points. */
function gridGraph(size: number, spacing: number): LaneGraph {
  const lanes: LaneEdgeConfig[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      lanes.push({
        id: `h-${row}-${col}-f`,
        points: [[col * spacing, 0, row * spacing], [(col + 1) * spacing, 0, row * spacing]],
        speed: 14,
        entry: col === 0,
        exit: col === size - 2,
      });
      lanes.push({
        id: `h-${row}-${col}-r`,
        points: [[(col + 1) * spacing, 0, row * spacing], [col * spacing, 0, row * spacing]],
        speed: 14,
        entry: col === size - 2,
        exit: col === 0,
      });
    }
  }
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row < size - 1; row += 1) {
      lanes.push({
        id: `v-${col}-${row}-f`,
        points: [[col * spacing, 0, row * spacing], [col * spacing, 0, (row + 1) * spacing]],
        speed: 14,
        entry: row === 0,
        exit: row === size - 2,
      });
      lanes.push({
        id: `v-${col}-${row}-r`,
        points: [[col * spacing, 0, (row + 1) * spacing], [col * spacing, 0, row * spacing]],
        speed: 14,
        entry: row === size - 2,
        exit: row === 0,
      });
    }
  }
  const base = createLaneGraph({ lanes });
  const intersections = base.intersections().map((crossing) => ({
    node: crossing.node,
    signal: {
      greenSeconds: 9,
      yellowSeconds: 2,
      allRedSeconds: 1,
      phases: [
        crossing.inLanes.filter((lane) => lane.startsWith("h-")),
        crossing.inLanes.filter((lane) => lane.startsWith("v-")),
      ],
    },
  }));
  return createLaneGraph({ lanes, intersections });
}

/** Closest bumper-to-bumper gap between two cars sharing a lane — negative means overlap. */
function tightestGap(traffic: Traffic): number {
  const byLane = new Map<string, number[]>();
  for (const id of traffic.ids()) {
    const car = traffic.car(id)!;
    const list = byLane.get(car.laneId);
    if (list === undefined) byLane.set(car.laneId, [car.arc]);
    else list.push(car.arc);
  }
  let tightest = Number.POSITIVE_INFINITY;
  for (const list of byLane.values()) {
    list.sort((a, b) => a - b);
    for (let index = 1; index < list.length; index += 1) {
      tightest = Math.min(tightest, list[index]! - list[index - 1]! - CAR_LENGTH);
    }
  }
  return tightest;
}

describe("traffic soak", () => {
  test("ten minutes at a four-way leaves no permanent stop, signalled or first-come", () => {
    const signalised = createLaneGraph({
      lanes: CROSS_LANES,
      intersections: [{ node: "@0.0,0.0", signal: { greenSeconds: 8, yellowSeconds: 2, allRedSeconds: 1 } }],
    });
    for (const [label, graph] of [
      ["signal", signalised],
      ["priority", createLaneGraph({ lanes: CROSS_LANES })],
    ] as const) {
      const traffic = createTraffic({ graph, seed: `four-way-${label}`, demand: 20, tuning: { fleetPerTick: 10 } });
      const ticks = Math.round((10 * 60) / DT);
      let tightest = Number.POSITIVE_INFINITY;
      let windowsWithoutExit = 0;
      let previousExits = 0;
      for (let tick = 0; tick < ticks; tick += 1) {
        traffic.tick(DT);
        if (tick % 30 === 0) tightest = Math.min(tightest, tightestGap(traffic));
        if (tick % 300 === 0) {
          const exits = traffic.stats().exited;
          if (exits === previousExits) windowsWithoutExit += 1;
          else windowsWithoutExit = 0;
          previousExits = exits;
        }
        expect(windowsWithoutExit).toBeLessThan(10);
      }
      const stats = traffic.stats();
      expect(stats.ticks).toBe(ticks);
      expect(stats.stalls).toBe(0);
      expect(stats.maxDeadlockSeconds).toBeLessThan(1);
      expect(stats.exited).toBeGreaterThan(100);
      expect(stats.meanSpeed).toBeGreaterThan(1);
      expect(tightest).toBeGreaterThan(-0.05);
      for (const id of traffic.ids()) {
        const car = traffic.car(id)!;
        expect(Number.isFinite(car.arc)).toBe(true);
        expect(Number.isFinite(car.position[0]) && Number.isFinite(car.position[2])).toBe(true);
      }
      console.log(
        `four-way ${label}: ${stats.exited} cars crossed in 10 min, ${stats.stalls} stalls, ` +
          `worst stop ${stats.maxStillSeconds.toFixed(1)} s (at a signal), tightest gap ${tightest.toFixed(2)} m`,
      );
    }
  }, 300_000);

  test("200 cars cross a 10x10 city for ten minutes under 1.5 ms per tick", () => {
    const graph = gridGraph(10, 60);
    const traffic = createTraffic({
      graph,
      seed: "city-200",
      demand: 200,
      tuning: { fleetPerTick: 20 },
      devtoolsName: "traffic.city",
    });
    const ticks = Math.round((10 * 60) / DT);
    const samples: number[] = [];
    let tightest = Number.POSITIVE_INFINITY;
    let speedSum = 0;
    let speedSamples = 0;
    for (let tick = 0; tick < ticks; tick += 1) {
      const started = performance.now();
      traffic.tick(DT);
      samples.push(performance.now() - started);
      if (tick % 60 === 0) {
        tightest = Math.min(tightest, tightestGap(traffic));
        speedSum += traffic.stats().meanSpeed;
        speedSamples += 1;
      }
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
    const stats = traffic.stats();
    console.log(
      `city 200 cars: p50 ${p50.toFixed(3)} ms, p90 ${p90.toFixed(3)} ms per tick, ${stats.exited} trips, ` +
        `mean speed ${(speedSum / speedSamples).toFixed(1)} m/s, ${stats.stalls} stalls, worst stop ${stats.maxStillSeconds.toFixed(1)} s, ` +
        `tightest gap ${tightest.toFixed(2)} m`,
    );
    // 200 cars cost this machine about a fifteenth of the budget; the gate catches a real regression.
    gateTimingMs("traffic tick, 200 cars on an 81-junction grid", samples, 1.5, `p50 ${p50.toFixed(3)} ms, p90 ${p90.toFixed(3)} ms`);
    expect(p50).toBeLessThan(1.5);
    expect(p90).toBeLessThan(1.5);
    expect(stats.cars).toBe(200);
    expect(stats.stalls).toBe(0);
    expect(stats.maxDeadlockSeconds).toBeLessThan(1);
    expect(stats.exited).toBeGreaterThan(200);
    expect(tightest).toBeGreaterThan(-0.05);
    for (const id of traffic.ids()) {
      const car = traffic.car(id)!;
      expect(Number.isFinite(car.arc) && Number.isFinite(car.speed)).toBe(true);
    }
    const probe = (devtools.probes.read() as Record<string, unknown>)["traffic.city"];
    expect(String(probe)).toContain("200 cars");
    expect(String(probe)).toContain("stalls");
    traffic.dispose();
    expect((devtools.probes.read() as Record<string, unknown>)["traffic.city"]).toBeUndefined();
  }, 300_000);

  test("density by time of day is the caller's policy and lands on the target", () => {
    const traffic = createTraffic({ graph: gridGraph(4, 50), seed: "time-of-day", tuning: { fleetPerTick: 20 } });
    const density = (secondsOfDay: number): number => {
      const hour = secondsOfDay / 3600;
      if (hour < 6) return 5;
      if (hour < 9) return 40;
      if (hour < 17) return 20;
      return 30;
    };
    const samples: { hour: number; target: number; actual: number }[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      traffic.setDemand(density(hour * 3600));
      for (let tick = 0; tick < 30 * 40; tick += 1) traffic.tick(DT);
      samples.push({ hour, target: traffic.demand(), actual: traffic.count() });
    }
    for (const sample of samples) expect(sample.actual).toBeLessThanOrEqual(sample.target);
    const morning = samples.find((sample) => sample.hour === 8)!;
    const night = samples.find((sample) => sample.hour === 2)!;
    expect(morning.actual).toBeGreaterThan(night.actual);
    expect(traffic.stats().retired).toBeGreaterThan(0);
    expect(traffic.stats().spawned).toBeGreaterThan(morning.target);
  }, 120_000);
});
