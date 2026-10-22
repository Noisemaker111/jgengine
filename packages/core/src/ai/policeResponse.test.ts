import { describe, expect, test } from "bun:test";

import { laneGraphFromDocument, type LaneGraph } from "../nav/laneGraph";
import { createPerception, type PerceptionPosition } from "../sensor/perception";
import {
  DEFAULT_POLICE_TUNING,
  createPoliceResponse,
  policeRoadsFromLaneGraph,
  type PoliceResponse,
  type PoliceResponseConfig,
  type PoliceStep,
} from "./policeResponse";

const SUSPECT = "suspect";
const AT_ORIGIN: PerceptionPosition = [0, 0, 0];

function position(x: number, z: number): PerceptionPosition {
  return [x, 0, z];
}

/** A perception service whose one observer sees anything inside 40 m, cone ignored. */
function eyes(memorySeconds = 5) {
  return createPerception({ sightRange: 40, sightConeDeg: 360, hearingRange: 0, memorySeconds });
}

function police(config: Partial<PoliceResponseConfig> & Pick<PoliceResponseConfig, "witness" | "observers">): PoliceResponse {
  return createPoliceResponse({ suspectId: SUSPECT, decayPerSecond: 10, ...config });
}

/** One tick with the suspect seen from the origin and `crime` reported just before it. */
function witnessedTick(
  service: PoliceResponse,
  perception: ReturnType<typeof eyes>,
  nowMs: number,
  crime = 0,
  suspectAt = AT_ORIGIN,
): PoliceStep {
  perception.observe({ id: "cop", position: AT_ORIGIN, yaw: 0 }, [{ id: SUSPECT, position: suspectAt }], nowMs);
  if (crime > 0) service.reportCrime(crime);
  return service.tick(1 / 60, { nowMs, activePursuers: 0, around: [suspectAt[0], suspectAt[2]] });
}

describe("policeResponse heat", () => {
  test("a crime with no witness raises no heat and leaves no search area", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });

    service.reportCrime(80);
    const step = service.tick(1 / 60, { nowMs: 0, activePursuers: 0, around: [0, 0] });

    expect(step.heat).toBe(0);
    expect(step.response).toBe("patrol");
    expect(step.tier).toBeNull();
    expect(step.searchArea).toBeNull();
    expect(step.pursuerBudget).toBe(0);
    expect(service.stats().witnessed).toBe(0);
    expect(service.stats().crimes).toBe(1);
  });

  test("a witnessed crime raises heat and anchors the search area at the sighting", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });

    const step = witnessedTick(service, perception, 0, 30, position(10, 0));

    expect(step.heat).toBe(30);
    expect(step.response).toBe("investigate");
    expect(step.tierChanged).toBe(true);
    expect(step.pursuerBudget).toBe(1);
    expect(step.wantPursuers).toBe(1);
    expect(step.searchArea).not.toBeNull();
    expect(step.searchArea!.center).toEqual([10, 0]);
    expect(step.searchArea!.radius).toBe(25);
    expect(step.searchArea!.lastSeenAt).toBe(0);
    expect(step.searchArea!.sourceId).toBe("cop");
    expect(step.searchArea!.sourceTick).toBe(1);
    expect(service.stats().witnessed).toBe(1);
  });

  test("a crime committed out of sight while hot adds nothing", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });
    witnessedTick(service, perception, 0, 80);

    // No observer sees the suspect on this pass, so the crime is unwitnessed.
    service.reportCrime(200);
    const step = service.tick(1 / 60, { nowMs: 5_000, activePursuers: 1, around: [0, 0] });

    expect(step.heat).toBe(80);
    expect(service.stats().witnessed).toBe(1);
    expect(service.stats().crimes).toBe(2);
  });

  test("the search area follows each new sighting and keeps whose eyes it was", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });
    witnessedTick(service, perception, 0, 80, position(10, 0));

    const step = witnessedTick(service, perception, 500, 0, position(30, 20));

    expect(step.searchArea!.center).toEqual([30, 20]);
    expect(step.searchArea!.lastSeenAt).toBe(500);
    expect(step.searchArea!.sourceTick).toBe(2);
    expect(service.stats().sightings).toBe(2);
  });
});

describe("policeResponse escape", () => {
  test("standing in view keeps heat and never starts the out-of-sight clock", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });
    witnessedTick(service, perception, 0, 80);

    let step: PoliceStep | null = null;
    for (let i = 1; i <= 60; i += 1) {
      step = witnessedTick(service, perception, i * 50, 0, position(30, 20));
      expect(step.outOfSightSeconds).toBe(0);
      expect(step.escaped).toBe(false);
      expect(step.heat).toBe(80);
    }
    expect(step!.searchArea!.center).toEqual([30, 20]);
  });

  test("leaving view for escapeSeconds starts the decay, and only then", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });
    witnessedTick(service, perception, 0, 80);

    const ctx = (nowMs: number) => ({ nowMs, activePursuers: 1, around: [0, 0] as [number, number] });
    let step = service.tick(0.1, ctx(100));
    for (let i = 2; i <= 20; i += 1) step = service.tick(0.1, ctx(i * 100));
    expect(step.escaped).toBe(false);
    expect(step.heat).toBe(80);

    for (let i = 21; i <= 100; i += 1) step = service.tick(0.1, ctx(i * 100));
    expect(step.escaped).toBe(true);
    expect(step.outOfSightSeconds).toBeGreaterThanOrEqual(DEFAULT_POLICE_TUNING.escapeSeconds);
    expect(step.heat).toBeLessThan(80);
    expect(service.stats().escapes).toBe(1);
  });

  test("the decay curve is linear at decayPerSecond, then the response stands down", () => {
    const perception = eyes();
    const service = police({
      witness: perception,
      observers: () => ["cop"],
      escapeSeconds: 1,
      decayPerSecond: 4,
      standDownSeconds: 2,
    });
    witnessedTick(service, perception, 0, 100, position(0, 0));
    const ctx = (nowMs: number) => ({ nowMs, activePursuers: 2, around: [0, 0] as [number, number] });

    const first = service.tick(1, ctx(1_000));
    expect(first.escaped).toBe(true);
    expect(first.heat).toBe(96);
    const second = service.tick(1, ctx(2_000));
    expect(second.heat).toBe(92);

    let step = second;
    for (let i = 3; i <= 25; i += 1) step = service.tick(1, ctx(i * 1_000));
    expect(step.heat).toBe(0);
    expect(step.response).toBe("patrol");
    expect(step.searchArea).toBeNull();

    for (let i = 26; i <= 30; i += 1) step = service.tick(1, ctx(i * 1_000));
    expect(step.standDown).toBe(true);
  });

  test("being seen again clears the escape and raises heat once more", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });
    witnessedTick(service, perception, 0, 80);
    const ctx = (nowMs: number) => ({ nowMs, activePursuers: 1, around: [0, 0] as [number, number] });
    let cold = service.tick(0.1, ctx(100));
    for (let i = 2; i <= 100; i += 1) cold = service.tick(0.1, ctx(i * 100));
    expect(cold.escaped).toBe(true);

    const step = witnessedTick(service, perception, 10_100, 30, position(12, 0));

    expect(step.escaped).toBe(false);
    expect(step.outOfSightSeconds).toBe(0);
    expect(step.heat).toBeGreaterThan(cold.heat);
  });
});

describe("policeResponse tiers", () => {
  test("heat walks patrol → investigate → pursue → roadblock", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });

    const patrol = service.tick(1 / 60, { nowMs: 0, activePursuers: 0, around: [0, 0] });
    expect(patrol.response).toBe("patrol");

    const investigate = witnessedTick(service, perception, 100, 30, position(5, 5));
    expect(investigate.response).toBe("investigate");
    expect(investigate.pursuerBudget).toBe(1);

    const pursue = witnessedTick(service, perception, 200, 70, position(5, 5));
    expect(pursue.response).toBe("pursue");
    expect(pursue.pursuerBudget).toBe(3);
    expect(pursue.tierChanged).toBe(true);

    const cordon = witnessedTick(service, perception, 300, 60, position(5, 5));
    expect(cordon.heat).toBe(160);
    expect(cordon.response).toBe("roadblock");
    expect(cordon.pursuerBudget).toBe(5);
  });

  test("the search area grows while the trail is cold and stops at the cap", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"], searchRadiusMax: 60, decayPerSecond: 0.1 });
    witnessedTick(service, perception, 0, 30, position(10, 0));
    const ctx = (nowMs: number) => ({ nowMs, activePursuers: 1, around: [10, 0] as [number, number] });

    const fresh = service.tick(0.1, ctx(100));
    expect(fresh.searchArea!.radius).toBe(25);

    for (let i = 2; i <= 20; i += 1) service.tick(0.1, ctx(i * 100));
    const cold = service.tick(0.1, ctx(2_100));
    expect(cold.searchArea!.radius).toBeGreaterThan(fresh.searchArea!.radius);
    expect(cold.searchArea!.radius).toBeCloseTo(25 + cold.outOfSightSeconds * DEFAULT_POLICE_TUNING.searchGrowthPerSecond, 9);

    for (let i = 22; i <= 300; i += 1) service.tick(0.1, ctx(i * 100));
    expect(service.searchArea()!.radius).toBe(60);
  });

  test("roadblocks come from authored markers on the lane they block", () => {
    const markers = [
      { id: "block_west", kind: "traffic_roadblock", position: { x: -20, y: 0, z: 0 } },
      { id: "block_east", kind: "traffic_roadblock", position: { x: 20, y: 0, z: 0 } },
    ];
    const graph: LaneGraph = laneGraphFromDocument({
      paths: [{ id: "main", kind: "road", points: [{ x: -60, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }] }],
      markers,
    } as never);
    const roads = policeRoadsFromLaneGraph(graph, markers);

    const sites = roads.roadblockSites();
    expect(sites.map((site) => site.id)).toEqual(["block_east", "block_west"]);
    for (const site of sites) {
      expect(graph.lane(site.lane)).not.toBeNull();
      expect(site.at[1]).toBeCloseTo(0, 6);
      expect(site.at[0]).toBeCloseTo(site.id === "block_east" ? 20 : -20, 3);
      expect(site.heading).toBeCloseTo(graph.heading(site.lane, site.arc), 6);
    }

    const perception = eyes();
    const service = police({
      witness: perception,
      observers: () => ["cop"],
      roads,
      tiers: [
        { response: "pursue", threshold: 40, pursuers: 2, searchRadius: 60, roadblocks: 0 },
        { response: "roadblock", threshold: 100, pursuers: 4, searchRadius: 60, roadblocks: 2 },
      ],
    });
    const chased = witnessedTick(service, perception, 0, 80, position(0, 0));
    expect(chased.response).toBe("pursue");
    expect(chased.roadblocks).toHaveLength(0);

    const cordon = witnessedTick(service, perception, 100, 40, position(0, 0));
    expect(cordon.response).toBe("roadblock");
    expect(cordon.roadblocks.map((site) => site.id)).toEqual(["block_east", "block_west"]);
  });

  test("with no roadblock markers authored, intersections are the cordon sites", () => {
    const graph = laneGraphFromDocument({
      paths: [
        { id: "west", kind: "traffic_lane", points: [{ x: -40, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] },
        { id: "south", kind: "traffic_lane", points: [{ x: 0, y: 0, z: -40 }, { x: 0, y: 0, z: 0 }] },
        { id: "east", kind: "traffic_lane", points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] },
        { id: "north", kind: "traffic_lane", points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 40 }] },
      ],
      markers: [],
    } as never);
    const intersection = graph.intersections()[0]!;

    const sites = policeRoadsFromLaneGraph(graph).roadblockSites();

    expect(sites).toHaveLength(1);
    expect(sites[0]!.id).toBe(`node:${intersection.node}`);
    expect(sites[0]!.lane).toBe(intersection.outLanes[0]!);
    expect(sites[0]!.at).toEqual([0, 0]);
  });

  test("the search area lists the lanes inside it and nothing further out", () => {
    const graph = laneGraphFromDocument({
      paths: [
        { id: "near", kind: "traffic_lane", points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] },
        { id: "far", kind: "traffic_lane", points: [{ x: 400, y: 0, z: 0 }, { x: 430, y: 0, z: 0 }] },
      ],
      markers: [],
    } as never);
    const perception = eyes();
    const service = police({
      witness: perception,
      observers: () => ["cop"],
      roads: policeRoadsFromLaneGraph(graph),
    });

    const step = witnessedTick(service, perception, 0, 80, position(10, 0));

    expect(step.searchArea!.lanes).toContain("near");
    expect(step.searchArea!.lanes).not.toContain("far");
    expect(service.stats().lanesInArea).toBe(step.searchArea!.lanes.length);
  });

  test("retune changes the tier table and the curve without losing heat", () => {
    const perception = eyes();
    const service = police({ witness: perception, observers: () => ["cop"] });
    witnessedTick(service, perception, 0, 80);

    service.retune({
      tiers: [{ response: "pursue", threshold: 40, pursuers: 2, searchRadius: 30, roadblocks: 0 }],
      decayPerSecond: 1,
      escapeSeconds: 1,
    });
    const ctx = (nowMs: number) => ({ nowMs, activePursuers: 0, around: [0, 0] as [number, number] });
    const first = service.tick(0.1, ctx(100));
    expect(first.heat).toBe(80);
    expect(first.response).toBe("pursue");

    let step = first;
    for (let i = 2; i <= 30; i += 1) step = service.tick(0.1, ctx(i * 100));
    expect(step.escaped).toBe(true);
    expect(step.heat).toBeLessThan(80);
    expect(step.heat).toBeGreaterThan(70);
  });
});

describe("policeResponse determinism and budget", () => {
  test("the same seed rolls the same spawn ring", () => {
    const seeded = (seed: number) => {
      const perception = eyes();
      return {
        perception,
        service: police({
          witness: perception,
          observers: () => ["cop"],
          spawnRingRadius: [40, 60],
          seed,
          tiers: [{ response: "pursue", threshold: 10, pursuers: 3, searchRadius: 30, roadblocks: 0 }],
        }),
      };
    };
    const first = seeded(7);
    const second = seeded(7);
    const other = seeded(8);

    const a = witnessedTick(first.service, first.perception, 0, 50, position(5, 5));
    const b = witnessedTick(second.service, second.perception, 0, 50, position(5, 5));
    const c = witnessedTick(other.service, other.perception, 0, 50, position(5, 5));

    expect(a.spawnPoints).toHaveLength(3);
    expect(b.spawnPoints).toEqual(a.spawnPoints);
    expect(c.spawnPoints).not.toEqual(a.spawnPoints);
    for (const [x, z] of a.spawnPoints) {
      const distance = Math.hypot(x - 5, z - 5);
      expect(distance).toBeGreaterThanOrEqual(40);
      expect(distance).toBeLessThanOrEqual(60);
    }
  });

  test("a restored state carries on exactly like a run that never saved", () => {
    const perception = eyes();
    const continuous = police({ witness: perception, observers: () => ["cop"], spawnRingRadius: [30, 50] });
    const resumed = police({ witness: perception, observers: () => ["cop"], spawnRingRadius: [30, 50] });

    witnessedTick(continuous, perception, 0, 90, position(10, 0));
    resumed.restore(continuous.state());

    const ctx = (nowMs: number) => ({ nowMs, activePursuers: 1, around: [10, 0] as [number, number] });
    let a = continuous.tick(0.1, ctx(100));
    let b = resumed.tick(0.1, ctx(100));
    expect(b).toEqual(a);
    for (let i = 2; i <= 40; i += 1) {
      a = continuous.tick(0.1, ctx(i * 100));
      b = resumed.tick(0.1, ctx(i * 100));
      expect(b).toEqual(a);
    }
    expect(a.escaped).toBe(b.escaped);
    expect(continuous.state().heat).toEqual(resumed.state().heat);
    // `slowestTickMs` is wall-clock, so it is the one counter a restore cannot reproduce.
    expect({ ...resumed.state().counters, slowestTickMs: 0 }).toEqual({ ...continuous.state().counters, slowestTickMs: 0 });
  });

  test("per-tick work stays bounded by the roster, the lane limit and the sites", () => {
    const graph: LaneGraph = laneGraphFromDocument({
      paths: Array.from({ length: 40 }, (_, i) => ({
        id: `lane_${i}`,
        kind: "traffic_lane",
        points: [{ x: i * 20, y: 0, z: 0 }, { x: i * 20 + 15, y: 0, z: 0 }],
      })),
      markers: Array.from({ length: 12 }, (_, i) => ({
        id: `block_${i}`,
        kind: "traffic_roadblock",
        position: { x: i * 20 + 7, y: 0, z: 0 },
      })),
    } as never);
    const perception = eyes();
    const observers = Array.from({ length: 40 }, (_, i) => `cop_${i}`);
    const service = police({
      witness: perception,
      observers: () => observers,
      roads: policeRoadsFromLaneGraph(graph),
      searchLaneLimit: 5,
      roadblockLimit: 3,
      tiers: [{ response: "roadblock", threshold: 10, pursuers: 2, searchRadius: 40, roadblocks: 12 }],
    });

    for (let i = 0; i <= 400; i += 1) {
      for (const id of observers) {
        perception.observe({ id, position: AT_ORIGIN, yaw: 0 }, [{ id: SUSPECT, position: position(20, 0) }], i * 50);
      }
      if (i === 0) service.reportCrime(60);
      service.tick(0.05, { nowMs: i * 50, activePursuers: 2, around: [20, 0] });
    }

    const stats = service.stats();
    expect(stats.sightingsChecked).toBe(observers.length);
    expect(stats.lanesInArea).toBeLessThanOrEqual(5);
    expect(stats.roadblockSites).toBeLessThanOrEqual(12);
    expect(service.roadblocks().length).toBeLessThanOrEqual(3);
    expect(stats.ticks).toBe(401);
    expect(Number.isFinite(stats.slowestTickMs)).toBe(true);
  });
});
