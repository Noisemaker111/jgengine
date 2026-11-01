import { describe, expect, test } from "bun:test";

import { devtools } from "@jgengine/core/devtools/devtools";
import { deriveBuildingLots } from "@jgengine/core/buildings/buildingLots";
import { rectClearsPolyline, rectsSeparated } from "@jgengine/core/world/polygon";
import {
  US_CITY_LAYOUT,
  cityLaneOffsets,
  cityLots,
  cityRoad,
  cityRoadSource,
  cityRoadWidth,
  createCityLayout,
  resolveCityLayout,
  tuneCityLayout,
  type CityLotRoad,
} from "./cityLayout";
import type { Vec2 } from "@jgengine/core/world/geometry";

const GRID: CityLotRoad[] = [
  { path: [[0, -120], [0, 120]], roadClass: "avenue" },
  { path: [[-120, 0], [120, 0]], roadClass: "street" },
  { path: [[-120, -80], [120, -80]], roadClass: "street" },
];

describe("city layout", () => {
  test("US defaults size roads from lanes, parking and lane width", () => {
    expect(cityRoadWidth(US_CITY_LAYOUT, "avenue")).toBeCloseTo(14);
    expect(cityRoadWidth(US_CITY_LAYOUT, "street")).toBeCloseTo(7 + 4.8);
    expect(cityLaneOffsets(US_CITY_LAYOUT, "avenue")).toEqual([-5.25, -1.75, 1.75, 5.25]);
  });

  test("a patch clamps to slider ranges and keeps floors ordered", () => {
    const layout = resolveCityLayout({ laneWidth: 99, streetLanes: 2.6, zones: { core: { minFloors: 30, maxFloors: 4 } } });
    expect(layout.laneWidth).toBe(4.5);
    expect(layout.streetLanes).toBe(3);
    expect(layout.zones.core.maxFloors).toBeGreaterThanOrEqual(layout.zones.core.minFloors);
    expect(layout.zones.residential).toEqual(US_CITY_LAYOUT.zones.residential);
  });

  test("cityRoad carries the layout's width, sidewalk and kerb", () => {
    const layout = resolveCityLayout({ sidewalkWidth: 3, kerbHeight: 0.18 });
    const street = cityRoad(layout, { path: [[0, 0], [0, 50]], roadClass: "street", sidewalk: { color: "#ccc" } });
    expect(street.width).toBeCloseTo(cityRoadWidth(layout, "street"));
    expect(street.sidewalk).toEqual({ width: 3, color: "#ccc", kerb: 0.18 });
  });

  test("the store notifies only on a real change, and snapshot/restore round-trips", () => {
    const store = createCityLayout({ sidewalkWidth: 3 });
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.set({ sidewalkWidth: 3 });
    expect(calls).toBe(0);
    store.set({ zones: { residential: { setback: 8 } } });
    expect(calls).toBe(1);
    const saved = store.snapshot();
    store.reset();
    expect(store.get().zones.residential.setback).toBe(6);
    store.restore(saved);
    expect(store.get().zones.residential.setback).toBe(8);
    expect(store.get().sidewalkWidth).toBe(3);
  });

  test("a road source rebuilds its roads when the layout moves", () => {
    const store = createCityLayout();
    const source = cityRoadSource(store, [{ path: [[0, 0], [0, 40]], roadClass: "avenue" }]);
    let heard = 0;
    source.subscribe(() => (heard += 1));
    expect(source.current()[0]!.width).toBeCloseTo(14);
    store.set({ laneWidth: 3 });
    expect(heard).toBe(1);
    expect(source.current()[0]!.width).toBeCloseTo(12);
    expect(source.current()).toBe(source.current());
  });
});

describe("city lots", () => {
  const zoneAt = (x: number, z: number) => (x > 0 ? (z < 0 ? "core" : "commercial") : "residential") as const;

  test("lots never overlap each other or any road with its sidewalk", () => {
    const layout = US_CITY_LAYOUT;
    const lots = cityLots(layout, { roads: GRID, zoneAt, seed: "t" });
    expect(lots.length).toBeGreaterThan(10);
    const rects = lots.map((lot) => ({ x: lot.center[0], z: lot.center[1], hw: lot.footprint.w / 2, hd: lot.footprint.d / 2, angle: lot.rotationY }));
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) expect(rectsSeparated(rects[a]!, rects[b]!)).toBe(true);
      for (const road of GRID) {
        const half = cityRoadWidth(layout, road.roadClass) / 2 + layout.sidewalkWidth - 0.05;
        expect(rectClearsPolyline(rects[a]!, road.path as readonly Vec2[], half)).toBe(true);
      }
    }
  });

  test("each zone sets its own setback past the sidewalk", () => {
    const layout = US_CITY_LAYOUT;
    const lots = cityLots(layout, { roads: GRID, zoneAt, seed: "t" });
    for (const lot of lots) {
      const width = cityRoadWidth(layout, GRID[lot.road]!.roadClass);
      expect(lot.frontDistance).toBeCloseTo(width / 2 + layout.sidewalkWidth + layout.zones[lot.zone].setback);
      expect(zoneAt(lot.center[0], lot.center[1])).toBe(lot.zone);
    }
    expect(new Set(lots.map((lot) => lot.zone))).toEqual(new Set(["core", "commercial", "residential"]));
  });

  test("residential lots get driveways and floors stay in range", () => {
    const lots = cityLots(US_CITY_LAYOUT, { roads: GRID, zoneAt, seed: "t" });
    for (const lot of lots) {
      const zone = US_CITY_LAYOUT.zones[lot.zone];
      expect(lot.floors).toBeGreaterThanOrEqual(zone.minFloors);
      expect(lot.floors).toBeLessThanOrEqual(zone.maxFloors);
      expect(lot.height).toBeCloseTo(lot.floors * US_CITY_LAYOUT.storyHeight);
      expect(lot.driveway !== undefined).toBe(zone.driveways);
    }
  });

  test("a wider corner clearance keeps corner lots further from the crossing road", () => {
    const tight = cityLots(resolveCityLayout({ cornerClearance: 0 }), { roads: GRID, zoneAt, seed: "t" });
    const open = cityLots(resolveCityLayout({ cornerClearance: 12 }), { roads: GRID, zoneAt, seed: "t" });
    expect(open.length).toBeLessThan(tight.length);
  });

  test("same inputs, same lots", () => {
    const a = cityLots(US_CITY_LAYOUT, { roads: GRID, zoneAt, seed: "t" });
    const b = cityLots(US_CITY_LAYOUT, { roads: GRID, zoneAt, seed: "t" });
    expect(a).toEqual(b);
  });
});

describe("deriveBuildingLots crossClearance", () => {
  test("keeps lots off crossing roads by the clearance but not off their own road", () => {
    const roads = [
      { path: [[0, -60], [0, 60]] as Vec2[], width: 10 },
      { path: [[-60, 0], [60, 0]] as Vec2[], width: 10 },
    ];
    const lots = deriveBuildingLots({ roads, footprint: { w: 10, d: 10 }, spacing: 1, setback: 2, crossClearance: 6 });
    expect(lots.length).toBeGreaterThan(0);
    for (const lot of lots) {
      const rect = { x: lot.center[0], z: lot.center[1], hw: 5, hd: 5, angle: lot.rotationY };
      const other = roads[1 - lot.road]!;
      expect(rectClearsPolyline(rect, other.path, other.width / 2 + 6 - 0.05)).toBe(true);
      expect(lot.frontDistance).toBeCloseTo(7);
    }
  });
});

describe("tuneCityLayout", () => {
  test("every layout number becomes a slider that sets the store", () => {
    const store = createCityLayout();
    tuneCityLayout(store, { group: "test-city" });
    const names = devtools.controls.list().filter((control) => control.name.startsWith("test-city/")).map((control) => control.name);
    expect(names).toContain("test-city/laneWidth");
    expect(names).toContain("test-city/residential.setback");
    expect(names).toContain("test-city/core.maxFloors");
    expect(names).toContain("test-city/industrial.driveways");
    devtools.controls.get("test-city/sidewalkWidth")!.write(4);
    expect(store.get().sidewalkWidth).toBe(4);
    devtools.controls.get("test-city/commercial.setback")!.write(5);
    expect(store.get().zones.commercial.setback).toBe(5);
  });
});
