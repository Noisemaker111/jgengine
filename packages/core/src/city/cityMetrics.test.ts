import { describe, expect, test } from "bun:test";
import type { PlanPoint } from "../roads/streetMetrics";
import type { ResolvedCity } from "./cityKind";
import { cityMetrics, cityMetricsInput, type CityBuildingSample } from "./cityMetrics";

function square(cx: number, cz: number, half: number): PlanPoint[] {
  return [
    [cx - half, cz - half],
    [cx + half, cz - half],
    [cx + half, cz + half],
    [cx - half, cz + half],
  ];
}

function building(cx: number, cz: number, height: number, cls: string, template: string, landmark?: string): CityBuildingSample {
  return { x: cx, z: cz, floors: 3, height, footprint: [square(cx, cz, 5)], floorArea: 300, class: cls, template, ...(landmark === undefined ? {} : { landmark }) };
}

describe("cityMetrics", () => {
  test("a hand-built 1 ha district has the hand-counted coverage, FAR, pavement and variety", () => {
    const m = cityMetrics(
      {
        halfX: 50,
        halfZ: 50,
        streets: [{ points: [[-50, 0], [50, 0]], width: 10, sidewalk: true }],
        sidewalkWidth: 2,
        blocks: [
          { area: 4000, kind: "buildable" },
          { area: 1000, kind: "park" },
        ],
        buildings: [
          building(25, 25, 10, "house", "a"),
          building(-25, 25, 10, "house", "a"),
          building(25, -25, 10, "house", "b"),
          building(-25, -25, 10, "house", "c"),
          building(0, 0, 30, "tower", "t", "hall"),
        ],
        networkLength: 200,
      },
      { minClassSize: 2 },
    );
    expect(m.areaHa).toBe(1);
    expect(m.buildings).toBe(5);
    expect(m.coverage).toBeCloseTo(0.05, 9);
    expect(m.far).toBeCloseTo(0.15, 9);
    expect(m.pavementShare).toBeCloseTo(0.14, 9);
    expect(m.buildingsOnRoad).toBe(1);
    expect(m.landInBlocksShare).toBeCloseTo(0.5, 9);
    expect(m.openBlockShare).toBeCloseTo(0.2, 9);
    expect(m.heightDistanceRho).toBeCloseTo(-1, 9);
    expect(m.landmarks).toBe(1);
    expect(m.classMix).toEqual({ house: 4, tower: 1 });
    expect(m.templatesPerClass).toEqual({ house: 3, tower: 1 });
    expect(m.minTemplatesPerClass).toBe(3);
    expect(m.uniqueTemplates).toBe(4);
    expect(m.keptLengthShare).toBeCloseTo(0.5, 9);
    expect(m.floorsMax).toBe(3);
    expect(m.heightMaxM).toBe(30);
  });

  test("cityMetricsInput brings a moved, rotated district back to local coordinates", () => {
    // Centre (100, 50), yaw 90°: local (10, 0) sits at world (100, 40).
    const city = {
      center: [100, 0, 50],
      size: [80, 60],
      rotationY: Math.PI / 2,
      rules: { sidewalkWidth: 2 },
      streets: [{ points: [[100, 40], [100, 60]], width: 8, sidewalk: false }],
      blocks: [],
      lots: [
        {
          center: [100, 40],
          rotationY: 0,
          floors: 2,
          class: "house",
          pieces: [
            { shape: "box", role: "wall", offset: [0, 0, 0], size: [8, 6, 10], rotationY: 0 },
            { shape: "gable", role: "roof", offset: [0, 6, 0], size: [8, 3, 10], rotationY: 0 },
          ],
        },
      ],
      network: { edges: [{ points: [[0, 0], [0, 40]] }] },
    } as unknown as ResolvedCity;
    const input = cityMetricsInput(city);
    expect(input.halfX).toBe(40);
    expect(input.halfZ).toBe(30);
    expect(input.buildings[0]!.x).toBeCloseTo(10, 9);
    expect(input.buildings[0]!.z).toBeCloseTo(0, 9);
    expect(input.buildings[0]!.height).toBe(9);
    // Storey = 9 m / 2 floors = 4.5 m, so the 6 m wall counts one floor of 80 m².
    expect(input.buildings[0]!.floorArea).toBe(80);
    expect(input.buildings[0]!.template).toBe("box:wall,gable:roof");
    expect(input.networkLength).toBe(40);
    const street = input.streets[0]!.points;
    expect(street[0]![0]).toBeCloseTo(10, 9);
    expect(street[1]![0]).toBeCloseTo(-10, 9);
  });
});
