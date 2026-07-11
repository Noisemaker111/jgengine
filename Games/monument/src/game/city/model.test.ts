import { describe, expect, test } from "bun:test";

import { CELL, HALF, initialBuildings, lots, TYPOLOGIES } from "../catalog";
import { buildingBodies, lotAt, occupiedLotKeys, programOccupancy, NEUTRAL_SIGNALS, solarModel } from "./model";

describe("monument starter district", () => {
  const buildings = initialBuildings();

  test("seeds a full named district", () => {
    expect(buildings.length).toBe(11);
    expect(new Set(buildings.map((b) => b.name)).size).toBe(11);
    expect(new Set(buildings.map((b) => b.typology)).size).toBe(Object.keys(TYPOLOGIES).length);
  });

  test("every building sits on the parcel grid", () => {
    for (const b of buildings) {
      expect(Math.abs(b.x) % CELL).toBe(0);
      expect(Math.abs(b.z) % CELL).toBe(0);
      expect(Math.abs(b.x / CELL)).toBeLessThanOrEqual(HALF);
      expect(Math.abs(b.z / CELL)).toBeLessThanOrEqual(HALF);
    }
  });

  test("every non-ring building composes a populated massing", () => {
    for (const b of buildings) {
      const bodies = buildingBodies(b);
      if (b.composition === "ring") {
        expect(bodies.length).toBe(0);
      } else {
        expect(bodies.length).toBeGreaterThan(0);
        for (const body of bodies) {
          expect(Number.isFinite(body.x + body.y + body.z)).toBe(true);
          expect(body.w).toBeGreaterThan(0);
          expect(body.h).toBeGreaterThan(0);
          expect(body.d).toBeGreaterThan(0);
        }
      }
    }
  });

  test("massing is deterministic per building", () => {
    for (const b of buildings) {
      expect(buildingBodies(b)).toEqual(buildingBodies(b));
    }
  });

  test("starter district claims lots and blocks re-placement", () => {
    const occupied = occupiedLotKeys(buildings, []);
    expect(occupied.size).toBeGreaterThanOrEqual(11);
    expect(occupied.has("0,0")).toBe(true);
    const free = lots.filter((lot) => !occupied.has(`${lot.gx},${lot.gz}`));
    expect(free.length).toBeGreaterThan(0);
  });
});

describe("site grid", () => {
  test("lotAt snaps to cells and rejects off-site points", () => {
    expect(lotAt(3, -5)).toEqual({ gx: 0, gz: 0, x: 0, z: 0 });
    expect(lotAt(2.4 * CELL, 0)).toEqual({ gx: 2, gz: 0, x: 2 * CELL, z: 0 });
    expect(lotAt((HALF + 1) * CELL, 0)).toBeNull();
    expect(lotAt(0, -(HALF + 1) * CELL)).toBeNull();
  });
});

describe("solar model", () => {
  test("noon is day, midnight is night", () => {
    expect(solarModel(13).daylight).toBeGreaterThan(0.9);
    expect(solarModel(13).night).toBe(false);
    expect(solarModel(0).daylight).toBeLessThan(0.05);
    expect(solarModel(0).night).toBe(true);
  });

  test("sun direction is normalized", () => {
    for (const hour of [0, 6.5, 12, 19.5, 23]) {
      const [x, y, z] = solarModel(hour).direction;
      expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 5);
    }
  });
});

describe("program occupancy", () => {
  const buildings = initialBuildings();
  const housing = buildings.find((b) => b.program === "housing");
  const work = buildings.find((b) => b.program === "work");

  test("stays within bounds", () => {
    for (const b of buildings) {
      for (const hour of [0, 6, 9, 13, 18, 22]) {
        const use = programOccupancy(b, hour, NEUTRAL_SIGNALS);
        expect(use).toBeGreaterThanOrEqual(0.04);
        expect(use).toBeLessThanOrEqual(1);
      }
    }
  });

  test("homes light up at night, studios by day", () => {
    if (housing === undefined || work === undefined) throw new Error("starter district lost a program");
    expect(programOccupancy(housing, 21, NEUTRAL_SIGNALS)).toBeGreaterThan(programOccupancy(housing, 12, NEUTRAL_SIGNALS));
    expect(programOccupancy(work, 12, NEUTRAL_SIGNALS)).toBeGreaterThan(programOccupancy(work, 23, NEUTRAL_SIGNALS));
  });
});
