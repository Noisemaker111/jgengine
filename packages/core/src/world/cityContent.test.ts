import { describe, expect, test } from "bun:test";

import { seededStreams } from "../random/rng";
import {
  buildLandmarkPieces,
  buildLotPieces,
  landmarkFloors,
  pickClass,
  pickSpecies,
  rollClassPlacement,
  zoneBand,
  zoneMetric,
  CITY_LANDMARK_CLASSES,
  CITY_LOT_CLASSES,
  type CityLotClass,
} from "./cityContent";

describe("zoneMetric", () => {
  test("is 0 at the center and 1 at the rim, shaped to the rectangle", () => {
    expect(zoneMetric(0, 0, 200, 100)).toBe(0);
    expect(zoneMetric(200, 0, 200, 100)).toBe(1);
    expect(zoneMetric(0, 100, 200, 100)).toBe(1);
    // Chebyshev: halfway out along the short axis reads the same as halfway along the long axis.
    expect(zoneMetric(100, 0, 200, 100)).toBeCloseTo(0.5);
    expect(zoneMetric(0, 50, 200, 100)).toBeCloseTo(0.5);
  });
});

describe("zoneBand", () => {
  test("core-out maps center → core, rim → edge", () => {
    expect(zoneBand(0.1, "core-out", 0.35, 0.7, 0.5)).toBe("core");
    expect(zoneBand(0.5, "core-out", 0.35, 0.7, 0.5)).toBe("mid");
    expect(zoneBand(0.9, "core-out", 0.35, 0.7, 0.5)).toBe("edge");
  });

  test("inverted flips the gradient — wealthier rings land at the rim", () => {
    expect(zoneBand(0.9, "inverted", 0.35, 0.7, 0.5)).toBe("core");
    expect(zoneBand(0.1, "inverted", 0.35, 0.7, 0.5)).toBe("edge");
  });

  test("uniform ignores position and distributes by extent weight", () => {
    expect(zoneBand(0.05, "uniform", 0.35, 0.7, 0.95)).toBe("edge");
    expect(zoneBand(0.95, "uniform", 0.35, 0.7, 0.05)).toBe("core");
  });

  test("degenerate extents never crash and stay in-band", () => {
    for (const roll of [0, 0.5, 0.999]) {
      expect(["core", "mid", "edge"]).toContain(zoneBand(0.5, "uniform", 0.9, 0.1, roll));
    }
  });
});

describe("pickClass / pickSpecies", () => {
  test("all weight on one item always picks it", () => {
    expect(pickClass([{ item: "barn", weight: 5 }], 0.99)).toBe("barn");
    expect(pickSpecies([{ item: "palm", weight: 2 }], 0.01)).toBe("palm");
  });

  test("unknown items are ignored and empty mixes fall back", () => {
    expect(pickClass([{ item: "castle", weight: 99 }], 0.5)).toBe("house");
    expect(pickClass([], 0.5)).toBe("house");
    expect(pickSpecies([{ item: "baobab", weight: 3 }], 0.5)).toBe("broadleaf");
  });

  test("weights bias the draw", () => {
    let towers = 0;
    const mix = [
      { item: "tower", weight: 9 },
      { item: "shop", weight: 1 },
    ];
    for (let i = 0; i < 100; i += 1) if (pickClass(mix, i / 100) === "tower") towers += 1;
    expect(towers).toBeGreaterThan(80);
  });
});

describe("rollClassPlacement", () => {
  test("floors respect the district clamp", () => {
    const rng = seededStreams("clamp")("roll");
    for (let i = 0; i < 20; i += 1) {
      const placement = rollClassPlacement("tower", rng, 1, 3, 8);
      expect(placement.floors).toBeGreaterThanOrEqual(3);
      expect(placement.floors).toBeLessThanOrEqual(8);
    }
  });

  test("lotScale scales the footprint", () => {
    const small = rollClassPlacement("house", seededStreams("s")("roll"), 0.5, 1, 60);
    const large = rollClassPlacement("house", seededStreams("s")("roll"), 2.5, 1, 60);
    expect(large.width).toBeCloseTo(small.width * 5);
    expect(large.depth).toBeCloseTo(small.depth * 5);
  });
});

describe("buildLandmarkPieces", () => {
  const rngFor = (key: string) => seededStreams(key)("landmark");

  test("same stream reproduces identical pieces for every landmark class", () => {
    for (const cls of CITY_LANDMARK_CLASSES) {
      const a = buildLandmarkPieces(cls, 60, 48, 4, 4, rngFor(`det:${cls}`));
      const b = buildLandmarkPieces(cls, 60, 48, 4, 4, rngFor(`det:${cls}`));
      expect(a).toEqual(b);
    }
  });

  test("every class yields finite, positively-sized, grounded pieces that fill the big footprint", () => {
    for (const cls of CITY_LANDMARK_CLASSES) {
      const width = 72;
      const depth = 54;
      const floors = landmarkFloors(cls, rngFor(`floors:${cls}`));
      expect(floors).toBeGreaterThanOrEqual(1);
      const pieces = buildLandmarkPieces(cls, width, depth, floors, 4, rngFor(`size:${cls}`));
      expect(pieces.length).toBeGreaterThan(0);
      expect(pieces.some((piece) => piece.grounded)).toBe(true);
      for (const piece of pieces) {
        for (const v of [...piece.offset, ...piece.size]) expect(Number.isFinite(v)).toBe(true);
        for (const v of piece.size) expect(v).toBeGreaterThan(0);
      }
    }
  });

  test("pieces stay inside the given footprint box (± a hair for decorative caps)", () => {
    // Massing must not blow past the merged cluster AABB by more than a small trim tolerance.
    const width = 80;
    const depth = 60;
    const tol = 0.05; // ≤5% overhang for rim/parapet trims
    for (const cls of CITY_LANDMARK_CLASSES) {
      const pieces = buildLandmarkPieces(cls, width, depth, 4, 4, rngFor(`bounds:${cls}`));
      for (const piece of pieces) {
        const c = Math.abs(Math.cos(piece.rotationY));
        const s = Math.abs(Math.sin(piece.rotationY));
        const hx = (piece.size[0] / 2) * c + (piece.size[2] / 2) * s;
        const hz = (piece.size[0] / 2) * s + (piece.size[2] / 2) * c;
        expect(Math.abs(piece.offset[0]) + hx).toBeLessThanOrEqual((width / 2) * (1 + tol));
        expect(Math.abs(piece.offset[2]) + hz).toBeLessThanOrEqual((depth / 2) * (1 + tol));
      }
    }
  });

  test("class silhouettes read distinctly — arena is a cylinder bowl, market carries a gable, hall a dome", () => {
    const arena = buildLandmarkPieces("arena", 70, 60, 4, 4, rngFor("arena"));
    expect(arena.some((p) => p.shape === "cylinder")).toBe(true);
    const market = buildLandmarkPieces("market", 70, 40, 1, 4, rngFor("market"));
    expect(market.some((p) => p.shape === "gable")).toBe(true);
    const hall = buildLandmarkPieces("hall", 60, 50, 3, 4, rngFor("hall"));
    expect(hall.some((p) => p.shape === "dome")).toBe(true);
    const campus = buildLandmarkPieces("campus", 80, 70, 5, 4, rngFor("campus"));
    // Four courtyard wings ⇒ at least four grounded wall boxes.
    expect(campus.filter((p) => p.role === "wall" && p.grounded).length).toBeGreaterThanOrEqual(4);
  });
});

describe("buildLotPieces", () => {
  const rngFor = (key: string) => seededStreams(key)("pieces");

  test("same stream reproduces identical pieces for every class", () => {
    for (const cls of CITY_LOT_CLASSES) {
      const a = buildLotPieces(cls, 14, 12, 6, 3, rngFor(`det:${cls}`));
      const b = buildLotPieces(cls, 14, 12, 6, 3, rngFor(`det:${cls}`));
      expect(a).toEqual(b);
    }
  });

  test("every class yields finite, positively-sized pieces with a grounded base", () => {
    for (const cls of CITY_LOT_CLASSES) {
      const pieces = buildLotPieces(cls, 16, 13, 8, 3, rngFor(`size:${cls}`));
      expect(pieces.length).toBeGreaterThan(0);
      expect(pieces.some((piece) => piece.grounded)).toBe(true);
      for (const piece of pieces) {
        for (const v of [...piece.offset, ...piece.size]) expect(Number.isFinite(v)).toBe(true);
        for (const v of piece.size) expect(v).toBeGreaterThan(0);
      }
    }
  });

  test("tall towers step: higher tiers have smaller footprints", () => {
    const pieces = buildLotPieces("tower", 20, 18, 24, 3, rngFor("tiers"));
    const walls = pieces.filter((piece) => piece.role === "wall").sort((a, b) => a.offset[1] - b.offset[1]);
    expect(walls.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < walls.length; i += 1) {
      expect(walls[i]!.size[0]).toBeLessThan(walls[i - 1]!.size[0]);
      expect(walls[i]!.size[2]).toBeLessThan(walls[i - 1]!.size[2]);
    }
  });

  test("houses and farm classes carry pitched roofs; silos are cylinders with domes", () => {
    const house = buildLotPieces("house", 11, 9, 2, 3, rngFor("roofs"));
    expect(house.some((piece) => piece.shape === "gable")).toBe(true);
    const barn = buildLotPieces("barn", 14, 11, 1, 3, rngFor("barn"));
    expect(barn.filter((piece) => piece.shape === "gable").length).toBeGreaterThanOrEqual(2);
    const silo = buildLotPieces("silo", 5.5, 5.5, 1, 3, rngFor("silo"));
    expect(silo.some((piece) => piece.shape === "cylinder")).toBe(true);
    expect(silo.some((piece) => piece.shape === "dome")).toBe(true);
  });

  test("distinct streams vary the silhouette — no two identical houses", () => {
    const signatures = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      signatures.add(JSON.stringify(buildLotPieces("house", 11, 9, 2, 3, rngFor(`vary:${i}`))));
    }
    expect(signatures.size).toBeGreaterThan(8);
  });

  test("banded flags land on multi-floor wall pieces only", () => {
    for (const cls of ["tower", "slab", "rowhouse"] as CityLotClass[]) {
      const pieces = buildLotPieces(cls, 16, 13, 12, 3, rngFor(`band:${cls}`));
      expect(pieces.some((piece) => piece.banded)).toBe(true);
      for (const piece of pieces) if (piece.banded) expect(piece.role).toBe("wall");
    }
    const barn = buildLotPieces("barn", 14, 11, 1, 3, rngFor("band:barn"));
    for (const piece of barn) expect(piece.banded).toBe(false);
  });
});
