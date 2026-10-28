import { describe, expect, test } from "bun:test";
import { OPEN_TEMPERATE_SITE, type PlantEnvironment } from "../plants/growth/plantEnvironment";
import { createPlantGrowth } from "../plants/growth/plantGrowth";
import { ACER_SACCHARUM } from "../plants/species/data/acerSaccharum";
import { jenkinsFoliageKg } from "../plants/validation/foliageAllometry";
import { createFireLandscape } from "./fireLandscape";
import { MOISTURE_SCENARIOS } from "./fuelModels";
import { plantCanopyFuel, rasterizeCanopyFuel, sampleFireGround, sunExposure, type PlantCanopyFuel } from "./fuelSources";

const STAND: PlantEnvironment = { ...OPEN_TEMPERATE_SITE, stand: { spacingIndex: 0.25 } };


describe("crown fuel from a grown plant", () => {
  test("sugar maple foliage mass is within 40 % of Jenkins 2003 at 20 and 50 years, open and in a stand", () => {
    for (const env of [OPEN_TEMPERATE_SITE, STAND]) {
      const plant = createPlantGrowth(ACER_SACCHARUM, env, "a");
      for (const age of [20, 50]) {
        plant.step(age - plant.ageYears());
        const structure = plant.structure();
        const fuel = plantCanopyFuel(structure, ACER_SACCHARUM, plant.stats().leafAreaM2);
        const ratio = fuel.foliageKg / jenkinsFoliageKg("hard-maple-oak-hickory-beech", structure.stats.dbhCm);
        expect(ratio, `${age} y`).toBeGreaterThan(0.6);
        expect(ratio, `${age} y`).toBeLessThan(1.4);
        expect(fuel.availableKg).toBeCloseTo(fuel.foliageKg + 0.5 * fuel.fineWoodKg, 9);
        expect(fuel.fineWoodKg).toBeGreaterThan(0);
        expect(fuel.heightM).toBe(structure.stats.heightM);
      }
    }
  }, 60_000);
});

describe("canopy raster", () => {
  const frame = { cols: 10, rows: 10, cellSize: 2 };
  const tree: PlantCanopyFuel = { foliageKg: 20, fineWoodKg: 10, availableKg: 25, heightM: 12, crownBaseM: 4, crownRadiusM: 3 };

  test("conserves crown fuel mass and sets cover, height, base and bulk density", () => {
    const { canopies, canopy } = rasterizeCanopyFuel(frame, [{ x: 10, z: 10, fuel: tree }]);
    let mass = 0;
    let cells = 0;
    let coverArea = 0;
    for (let i = 0; i < 100; i++) {
      const k = canopy[i] ?? -1;
      const stand = k >= 0 ? canopies[k] : undefined;
      if (stand === undefined) continue;
      cells++;
      mass += stand.bulkDensity * (stand.heightM - stand.baseHeightM) * 4;
      expect(stand.heightM).toBe(12);
      expect(stand.baseHeightM).toBe(4);
      expect(stand.cover).toBeGreaterThan(0);
      expect(stand.cover).toBeLessThanOrEqual(1);
      coverArea += stand.cover * 4;
    }
    expect(cells).toBe(12);
    expect(mass).toBeCloseTo(25, 6);
    expect(Math.abs(coverArea - Math.PI * 9) / (Math.PI * 9)).toBeLessThan(0.05);
  });

  test("a small crown lands in its own cell; plants off the grid are ignored", () => {
    const small = { ...tree, crownRadiusM: 0.3 };
    const { canopies, canopy } = rasterizeCanopyFuel(frame, [
      { x: 3, z: 5, fuel: small },
      { x: -50, z: 5, fuel: small },
    ]);
    expect(canopies.length).toBe(1);
    expect(canopy[2 * 10 + 1]).toBe(0);
    expect(canopies[0]?.cover).toBeCloseTo((Math.PI * 0.09) / 4, 6);
  });
});

describe("ground sampling and sun", () => {
  test("fuel codes become a deduplicated palette; unknown codes throw", () => {
    const g = sampleFireGround({ cols: 4, rows: 2, cellSize: 1 }, { heightAt: (x) => x, fuelAt: (x) => (x < 2 ? "GR2" : "NB9") });
    expect(g.fuels.length).toBe(2);
    expect([...g.fuel]).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect(g.elevation[1]).toBeCloseTo(1.5, 6);
    expect(() => sampleFireGround({ cols: 1, rows: 1, cellSize: 1 }, { fuelAt: () => "XX9" })).toThrow();
  });

  test("a slope facing the sun gets full sun, the far slope less, crowns shade, night is dark", () => {
    const frame = { cols: 3, rows: 1, cellSize: 1 };
    const sun = { azimuth: 0, elevation: Math.PI / 6 };
    const facing = sunExposure(frame, [0, -0.5, -1], sun);
    const away = sunExposure(frame, [0, 0.5, 1], sun);
    expect(facing[1]).toBe(1);
    expect(away[1] ?? 1).toBeLessThan(0.5);
    const shaded = sunExposure(frame, [0, 0, 0], sun, { canopies: [{ cover: 0.6, heightM: 10, baseHeightM: 2, bulkDensity: 0.1, foliarMoisture: 1 }], canopy: [-1, 0, -1] });
    expect(shaded[1]).toBeCloseTo(0.4, 6);
    expect([...sunExposure(frame, [0, 0, 0], { azimuth: 0, elevation: -0.1 })]).toEqual([0, 0, 0]);
  });

  test("a sampled ground with a rock break feeds a fire that stops at the break", () => {
    const frame = { cols: 60, rows: 20, cellSize: 2 };
    const g = sampleFireGround(frame, { fuelAt: (x) => (x > 60 && x < 66 ? "NB9" : "GR2") });
    const fire = createFireLandscape({ ...frame, ...g, seed: 1, tuning: { spotting: false } });
    fire.ignite(5, 10);
    const moisture = MOISTURE_SCENARIOS["D1L1"];
    if (moisture === undefined) throw new Error("missing scenario");
    for (let t = 0; t < 1800; t += 30) fire.step(30, { twentyFootWind: 6, windDirection: 0, airTemperatureC: 30, moisture });
    expect(fire.cell(25, 10).state).not.toBe("unburnt");
    for (let r = 0; r < 20; r++) for (let c = 33; c < 60; c++) expect(fire.cell(c, r).state).toBe("unburnt");
  });
});
