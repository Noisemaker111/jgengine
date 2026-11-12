import { describe, expect, test } from "bun:test";

import { CITY_GENERATOR, CITY_SCHEMA, cityClearings, resolveCityObject, type ResolvedCity } from "./cityKind";
import { cityMassingStats, type CityMassingStats } from "./cityStats";
import { runGenerator } from "../generator/generator";
import type { SceneKindObject } from "../scene/sceneKinds";

/** Ten seeds per preset: a quality band has to hold for every one, not for a lucky draw. */
const SEEDS = Array.from({ length: 10 }, (_, i) => `quality-${i}`);

function presetCity(id: string, seed: string): ResolvedCity {
  const values = id === "default" ? {} : (CITY_SCHEMA.presets?.find((preset) => preset.id === id)?.values ?? {});
  return runGenerator(CITY_GENERATOR, { ...values, seed }, { input: { halfX: 200, halfZ: 200 } }) as ResolvedCity;
}

const grown = new Map<string, { city: ResolvedCity; stats: CityMassingStats }[]>();
function districts(id: string): { city: ResolvedCity; stats: CityMassingStats }[] {
  let list = grown.get(id);
  if (list === undefined) {
    list = SEEDS.map((seed) => {
      const city = presetCity(id, seed);
      return { city, stats: cityMassingStats(city) };
    });
    grown.set(id, list);
  }
  return list;
}

/**
 * Real-world density bands per preset on a 400 m district. Coverage and FAR are GROSS (over the whole
 * footprint, streets included) unless named `land…` (over block land only). References: Midtown
 * Manhattan lots carry FAR 10–15 at 60–80 % coverage, ~30 % of the grid is street; LA's detached
 * residential runs 30–40 % lot coverage at FAR ~0.3–0.5 with yards and interiors left open; Beverly
 * Hills estates ~10–20 %; a midwest farm town is mostly field.
 */
const BANDS: Record<string, { coverage?: [number, number]; far?: [number, number]; landCoverage?: [number, number]; landFar?: [number, number] }> = {
  manhattan: { coverage: [0.5, 0.8], far: [6, 15], landCoverage: [0.65, 0.92], landFar: [8, 20] },
  metropolis: { coverage: [0.12, 0.35], far: [0.7, 3], landCoverage: [0.22, 0.5] },
  default: { coverage: [0.07, 0.3], far: [0.3, 2] },
  losangeles: { coverage: [0.08, 0.25], far: [0.1, 0.6], landCoverage: [0.17, 0.4], landFar: [0.2, 0.8] },
  beverlyhills: { coverage: [0.03, 0.15], far: [0.05, 0.3], landCoverage: [0.05, 0.2] },
  ruralohio: { coverage: [0.01, 0.06], far: [0.02, 0.1] },
};

describe("city presets land in their real-world density bands, every seed", () => {
  for (const [id, band] of Object.entries(BANDS)) {
    test(id, () => {
      for (const { stats } of districts(id)) {
        const inBand = (value: number, range: [number, number] | undefined, what: string): void => {
          if (range === undefined) return;
          expect({ what, value }).toEqual({ what, value: Math.min(range[1], Math.max(range[0], value)) });
        };
        inBand(stats.coverage, band.coverage, "coverage");
        inBand(stats.far, band.far, "far");
        inBand(stats.landCoverage, band.landCoverage, "landCoverage");
        inBand(stats.landFar, band.landFar, "landFar");
      }
    }, 60_000);
  }

  test("manhattan out-builds the metropolis, which out-builds los angeles, which out-builds rural ohio", () => {
    const meanFar = (id: string): number => districts(id).reduce((sum, d) => sum + d.stats.far, 0) / SEEDS.length;
    expect(meanFar("manhattan")).toBeGreaterThan(meanFar("metropolis") * 3);
    expect(meanFar("metropolis")).toBeGreaterThan(meanFar("losangeles") * 2);
    expect(meanFar("losangeles")).toBeGreaterThan(meanFar("ruralohio"));
  }, 60_000);
});

describe("landmarks, squares and parks", () => {
  test("every preset that asks for landmarks gets at least one, every seed", () => {
    for (const preset of CITY_SCHEMA.presets ?? []) {
      const landmarks = typeof preset.values["landmarks"] === "number" ? preset.values["landmarks"] : 0;
      if (preset.values["fabric"] === false) continue;
      expect(landmarks).toBeGreaterThan(0);
      for (const { stats } of districts(preset.id)) expect(stats.landmarks).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  test("a tall core's signature landmark is the district's tallest building", () => {
    for (const { city } of districts("manhattan")) {
      const top = (lot: ResolvedCity["lots"][number]): number => Math.max(...lot.pieces.map((piece) => piece.offset[1] + piece.size[1]));
      const signature = city.lots.find((lot) => lot.landmark === "skyscraper");
      expect(signature).toBeDefined();
      expect(top(signature!)).toBeGreaterThanOrEqual(Math.max(...city.lots.map(top)) - 1e-6);
    }
  }, 60_000);

  test("landmarks off grows none", () => {
    const city = presetCity("metropolis", "no-landmarks");
    const off = runGenerator(CITY_GENERATOR, { ...CITY_SCHEMA.presets!.find((p) => p.id === "metropolis")!.values, landmarks: 0, seed: "no-landmarks" }, { input: { halfX: 200, halfZ: 200 } }) as ResolvedCity;
    expect(cityMassingStats(city).landmarks).toBeGreaterThan(0);
    expect(cityMassingStats(off).landmarks).toBe(0);
  });

  test("open space becomes squares at the centres and footpathed parks spread across the district", () => {
    let paths = 0;
    let plazas = 0;
    for (const { city } of districts("metropolis")) {
      paths += city.parks.filter((park) => (park.paths?.length ?? 0) > 0).length;
      plazas += city.parks.filter((park) => park.type === "plaza").length;
      for (const park of city.parks) for (const path of park.paths ?? []) for (const point of path) expect(Number.isFinite(point[0] + point[1])).toBe(true);
    }
    expect(paths).toBeGreaterThan(SEEDS.length);
    expect(plazas).toBeGreaterThan(0);
  }, 60_000);
});

describe("district character", () => {
  test("bands follow several organic centres, not the volume's concentric squares", () => {
    let disagree = 0;
    let total = 0;
    for (const { city } of districts("metropolis")) {
      const rank = { core: 0, mid: 1, edge: 2 } as const;
      for (const block of city.blocks) {
        const n = Math.max(1, block.polygon.length);
        const cx = block.polygon.reduce((sum, p) => sum + p[0], 0) / n;
        const cz = block.polygon.reduce((sum, p) => sum + p[1], 0) / n;
        const square = Math.max(Math.abs(cx), Math.abs(cz)) / 200;
        const squareBand = square < city.rules.coreExtent ? 0 : square < city.rules.midExtent ? 1 : 2;
        total += 1;
        if (rank[block.band] !== squareBand) disagree += 1;
      }
    }
    expect(disagree / total).toBeGreaterThan(0.15);
  }, 60_000);

  test("a metropolis mixes CBD, residential and industrial districts", () => {
    const seen = new Set<string>();
    for (const { city } of districts("metropolis")) for (const block of city.blocks) seen.add(block.district);
    for (const kind of ["cbd", "residential", "industrial"]) expect(seen.has(kind)).toBe(true);
    const sheds = districts("metropolis").reduce((sum, d) => sum + d.city.lots.filter((lot) => lot.class === "warehouse").length, 0);
    expect(sheds).toBeGreaterThan(SEEDS.length);
  }, 60_000);

  test("heights vary within a band: no single floor count dominates the core", () => {
    for (const { city } of districts("manhattan").slice(0, 3)) {
      const towers = city.lots.filter((lot) => lot.class === "tower" && lot.landmark === undefined).map((lot) => lot.floors);
      expect(new Set(towers).size).toBeGreaterThan(towers.length * 0.3);
    }
  }, 60_000);
});

describe("massing variety and render cost", () => {
  test("every common class shows at least five templates across a preset's seeds", () => {
    for (const id of Object.keys(BANDS)) {
      const counts = new Map<string, number>();
      const templates = new Map<string, Set<string>>();
      for (const { city } of districts(id)) {
        for (const lot of city.lots) {
          if (lot.landmark !== undefined) continue;
          counts.set(lot.class, (counts.get(lot.class) ?? 0) + 1);
          templates.set(lot.class, (templates.get(lot.class) ?? new Set()).add(lot.template));
        }
      }
      for (const [cls, count] of counts) if (count >= 60) expect({ id, cls, templates: Math.min(5, templates.get(cls)!.size) }).toEqual({ id, cls, templates: 5 });
    }
  }, 60_000);

  // Instanced massing pieces per 400 m district — the renderer draws one instance per piece, in a
  // fixed six draws (box, banded box, gable, hip, cylinder, dome). The fabric before this pass drew
  // at most ~1,750 per preset; denser districts must not blow the instance budget.
  test("massing instances stay inside the per-district budget", () => {
    for (const id of Object.keys(BANDS)) for (const { stats } of districts(id)) expect(stats.pieces).toBeLessThan(2_200);
  }, 60_000);
});

describe("village regime", () => {
  const hamletMeta = {
    gridness: 0.45, curviness: 0.5, branching: 0.6, blockSize: 24, blockAspect: 1, openSpace: 0.15, roadsideOccupancy: 0.9, blockDensity: 0.5,
    streetWidth: 3.5, boulevards: 0, gravelLanes: true, profile: "uniform", coreExtent: 0.4, midExtent: 0.7,
    coreMix: [{ item: "shop", weight: 2 }, { item: "rowhouse", weight: 2 }],
    midMix: [{ item: "house", weight: 3 }, { item: "rowhouse", weight: 1 }],
    edgeMix: [{ item: "house", weight: 2 }, { item: "barn", weight: 1 }],
    lotScale: 0.7, floorsMin: 1, floorsMax: 2, floorHeight: 2.6, treeDensity: 0.45,
    treeMix: [{ item: "conifer", weight: 3 }, { item: "broadleaf", weight: 1 }],
    lightDensity: 0, hedges: false, driveways: false, parking: false, fields: false, sidewalks: false, style: "ruin", seed: "ashfall-3",
    surface: "gravel", buildingRoadSetback: 1.2, buildingSpacing: 1, clusterStrength: 0.6,
  };
  // Ember Command's ruined hamlet as its editor.scene.json places it, beside its central gold mine.
  const hamlet = (seed: string): SceneKindObject => ({
    id: "hamlet_1",
    kind: "city",
    center: { x: 28, y: 0, z: 0 },
    halfExtents: { x: 21, y: 8, z: 27 },
    meta: { ...hamletMeta, seed },
  });
  const mine: SceneKindObject = { id: "goldmine_mid", kind: "prop", position: { x: 22, y: 0, z: 4 }, meta: { clearance: 4 } };

  test("the authored hamlet reads as a hamlet: a lane or two, a green, buildings well past the street count", () => {
    const city = resolveCityObject(hamlet("ashfall-3"), { objects: [mine] })!;
    expect(city.streets.length).toBeLessThanOrEqual(4);
    expect(city.lots.length).toBeGreaterThanOrEqual(10);
    expect(city.parks.some((park) => park.type === "green")).toBe(true);
  });

  test("a hamlet stays a hamlet on any seed", () => {
    for (const seed of SEEDS) {
      const city = resolveCityObject(hamlet(seed), { objects: [mine] })!;
      expect(city.streets.length).toBeLessThanOrEqual(2);
      expect(city.lots.length).toBeGreaterThanOrEqual(5);
      expect(city.lots.length).toBeGreaterThan(city.streets.length * 2);
      // Every lane runs rim to rim, so the hamlet can meet the roads outside its volume.
      const main = city.streets[0]!.points;
      const end = main[main.length - 1]!;
      expect(Math.abs(Math.abs(end[1]) - 27) < 0.01 || Math.abs(Math.abs(end[0] - 28) - 21) < 0.01).toBe(true);
    }
  });

  test("no building, tree or parked car covers a clearance-tagged gameplay spot", () => {
    expect(cityClearings([mine])).toEqual([{ x: 22, z: 4, radius: 4 }]);
    for (const seed of SEEDS) {
      const city = resolveCityObject(hamlet(seed), { objects: [mine] })!;
      for (const lot of city.lots) {
        const c = Math.cos(lot.rotationY);
        const s = Math.sin(lot.rotationY);
        // Closest point of the lot rect to the mine stays outside its disc.
        const dx = 22 - lot.center[0];
        const dz = 4 - lot.center[1];
        const lx = Math.max(-lot.size[0] / 2, Math.min(lot.size[0] / 2, dx * c - dz * s));
        const lz = Math.max(-lot.size[1] / 2, Math.min(lot.size[1] / 2, dx * s + dz * c));
        expect(Math.hypot(dx * c - dz * s - lx, dx * s + dz * c - lz)).toBeGreaterThan(3.9);
      }
      for (const tree of city.trees) expect(Math.hypot(tree.x - 22, tree.z - 4)).toBeGreaterThan(3.9);
    }
  });

  test("a large district is never a village, a small one always is", () => {
    expect(presetCity("metropolis", "big").streets.length).toBeGreaterThan(10);
    const small = runGenerator(CITY_GENERATOR, { seed: "small", blockSize: 48 }, { input: { halfX: 60, halfZ: 50 } }) as ResolvedCity;
    expect(small.streets.length).toBeLessThanOrEqual(2);
    expect(small.lots.length).toBeGreaterThan(small.streets.length * 5);
  });
});
