import { describe, expect, test } from "bun:test";
import { TIERS } from "../difficulty/tiers";
import { ROADS } from "../roads/catalog";
import { VEHICLE_TYPES } from "./catalog";
import { activeVehiclesOnRoad, laneCapacity, laneVehicleX, pointHitByVehicle, roadOccupiesBand } from "./schedule";

const tier = TIERS.restless;
const road1 = ROADS[0]!;
const scooterLane = road1.lanes[0]!;

describe("vehicle scheduling", () => {
  test("laneVehicleX is a pure function of t", () => {
    const a = laneVehicleX(scooterLane, tier, 5.123);
    const b = laneVehicleX(scooterLane, tier, 5.123);
    expect(a).toBe(b);
  });

  test("vehicle moves in its declared direction at its declared speed", () => {
    const t0 = scooterLane.phaseOffset + 0.05;
    const t1 = t0 + 0.5;
    const x0 = laneVehicleX(scooterLane, tier, t0);
    const x1 = laneVehicleX(scooterLane, tier, t1);
    expect(x0).not.toBeNull();
    expect(x1).not.toBeNull();
    const speed = VEHICLE_TYPES[scooterLane.vehicle].speed * tier.speedMult;
    expect(x1! - x0!).toBeCloseTo(scooterLane.direction * speed * 0.5, 5);
  });

  test("vehicle is off-road (null) between spawns", () => {
    const period = scooterLane.period * tier.periodMult;
    const offRoadT = scooterLane.phaseOffset * tier.periodMult + period - 0.001;
    const x = laneVehicleX(scooterLane, tier, offRoadT);
    expect(x).toBeNull();
  });

  test("fixed-schedule tram only occupies the road during its listed windows", () => {
    const road5 = ROADS.find((road) => road.id === "road-5")!;
    const tramLane = road5.lanes.find((lane) => lane.vehicle === "tram")!;
    const duration = (20 * 2) / (VEHICLE_TYPES.tram.speed * tier.speedMult);
    const insideWindow = laneVehicleX(tramLane, tier, tramLane.fixedTimes![0]! * tier.periodMult + duration / 2);
    const gapBetweenWindows = laneVehicleX(tramLane, tier, tramLane.fixedTimes![0]! * tier.periodMult + duration + 0.5);
    expect(insideWindow).not.toBeNull();
    expect(gapBetweenWindows).toBeNull();
  });

  test("laneCapacity is at least 1 and scales with tier density", () => {
    const calmCapacity = laneCapacity(scooterLane, TIERS.calm);
    const feralCapacity = laneCapacity(scooterLane, TIERS.feral);
    expect(calmCapacity).toBeGreaterThanOrEqual(1);
    expect(feralCapacity).toBeGreaterThanOrEqual(calmCapacity);
  });

  test("activeVehiclesOnRoad reports every currently-active lane", () => {
    const active = activeVehiclesOnRoad(road1, tier, road1.lanes[0]!.phaseOffset + 0.1);
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(active[0]!.x)).toBe(true);
  });

  const singleLaneRoad = { id: "test-road", label: "Test Road", z: 0, halfDepth: 3, lanes: [scooterLane] };

  test("roadOccupiesBand is false the instant a vehicle spawns off the corridor edge", () => {
    const t = scooterLane.phaseOffset * tier.periodMult + 0.001;
    expect(roadOccupiesBand(singleLaneRoad, tier, t, 14)).toBe(false);
  });

  test("roadOccupiesBand is true once the vehicle reaches the corridor center", () => {
    const speed = VEHICLE_TYPES[scooterLane.vehicle].speed * tier.speedMult;
    const travelled = 20 / speed;
    const t = scooterLane.phaseOffset * tier.periodMult + travelled;
    expect(roadOccupiesBand(singleLaneRoad, tier, t, 14)).toBe(true);
  });

  test("pointHitByVehicle detects a creature standing on an active vehicle", () => {
    const t = road1.lanes[0]!.phaseOffset + 0.1;
    const active = activeVehiclesOnRoad(road1, tier, t)[0]!;
    const hit = pointHitByVehicle(road1, tier, t, active.x, active.z, 0.4);
    expect(hit).toBe(true);
  });

  test("pointHitByVehicle misses a creature far from any vehicle", () => {
    const t = road1.lanes[0]!.phaseOffset + 0.1;
    const hit = pointHitByVehicle(road1, tier, t, 9999, road1.z, 0.4);
    expect(hit).toBe(false);
  });
});
