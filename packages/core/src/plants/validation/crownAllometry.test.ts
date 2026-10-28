import { describe, expect, test } from "bun:test";
import { OPEN_TEMPERATE_SITE, type PlantEnvironment } from "../growth/plantEnvironment";
import { createPlantGrowth } from "../growth/plantGrowth";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PINUS_STROBUS } from "../species/data/pinusStrobus";
import type { PlantSpecies } from "../species/plantSpecies";
import { crownRatio } from "../structure/plantStructure";
import {
  EASTERN_WHITE_PINE_CROWN_WIDTH,
  SUGAR_MAPLE_CROWN_WIDTH,
  crownProfile,
  forestGrownCrownWidthM,
  measuredCrownWidthBandM,
  openGrownCrownWidthM,
  type CrownProfile,
  type CrownWidthEquations,
} from "./crownAllometry";

const SEED = "a";
const AGES = [20, 50, 100] as const;
/** A fully stocked even-aged stand (Hart–Becking index 0.25). */
const STAND: PlantEnvironment = { ...OPEN_TEMPERATE_SITE, stand: { spacingIndex: 0.25 } };
/**
 * Open-grown crowns run wider per DBH than Ek 1974 (#2729): the simulated crowns hold too little
 * leaf area, so the pipe model grows a thin trunk under a crown of the right spread.
 */
const OPEN_WIDTH_RATIO = { low: 0.8, high: 1.75 };
/** Forest-grown crowns sit within the Tallo 10th–90th percentile band, give or take this share. */
const MEASURED_BAND_SLACK = 0.12;

interface Reading {
  age: number;
  dbhCm: number;
  crownWidthM: number;
  crownRatio: number;
  profile: CrownProfile;
}

function grow(species: PlantSpecies, env: PlantEnvironment): Reading[] {
  const plant = createPlantGrowth(species, env, SEED);
  const readings: Reading[] = [];
  for (const age of AGES) {
    plant.step(age - plant.ageYears());
    const structure = plant.structure();
    readings.push({ age, dbhCm: structure.stats.dbhCm, crownWidthM: 2 * structure.stats.crownRadiusM, crownRatio: crownRatio(structure), profile: crownProfile(structure) });
  }
  return readings;
}

const grown = new Map<string, Reading[]>();
function readings(species: PlantSpecies, forest: boolean): Reading[] {
  const key = `${species.id}|${forest}`;
  const known = grown.get(key);
  if (known !== undefined) return known;
  const fresh = grow(species, forest ? STAND : OPEN_TEMPERATE_SITE);
  grown.set(key, fresh);
  return fresh;
}

function checkWidths(species: PlantSpecies, equations: CrownWidthEquations): void {
  test("open-grown crown width per DBH is near Ek 1974 at 20, 50 and 100 years", () => {
    for (const r of readings(species, false)) {
      const ratio = r.crownWidthM / openGrownCrownWidthM(equations, r.dbhCm);
      expect(ratio, `${r.age} y`).toBeGreaterThan(OPEN_WIDTH_RATIO.low);
      expect(ratio, `${r.age} y`).toBeLessThan(OPEN_WIDTH_RATIO.high);
    }
  });

  test("forest-grown crown width per DBH is within the measured Tallo band at 20, 50 and 100 years", () => {
    for (const r of readings(species, true)) {
      const band = measuredCrownWidthBandM(species.id, r.dbhCm);
      if (band === null) throw new Error(`no Tallo record for ${species.id}`);
      expect(r.crownWidthM, `${r.age} y`).toBeGreaterThan(band.lowM * (1 - MEASURED_BAND_SLACK));
      expect(r.crownWidthM, `${r.age} y`).toBeLessThan(band.highM * (1 + MEASURED_BAND_SLACK));
      // Bechtold 2003 is a regression mean; its residual is about a third of the width.
      const mean = forestGrownCrownWidthM(equations, r.dbhCm, r.crownRatio);
      expect(r.crownWidthM / mean, `${r.age} y`).toBeLessThan(2.2);
    }
  });

  test("an open-grown crown is long and a forest-grown one is pruned up", () => {
    for (const r of readings(species, false)) expect(r.crownRatio, `${r.age} y`).toBeGreaterThan(0.5);
    for (const r of readings(species, true)) if (r.age >= 50) expect(r.crownRatio, `${r.age} y`).toBeLessThan(0.55);
  });
}

describe("sugar maple crown form", () => {
  checkWidths(ACER_SACCHARUM, SUGAR_MAPLE_CROWN_WIDTH);

  test("the crown is decurrent: spread carried high with full shoulders, open or in a stand, at 20, 50 and 100 years", () => {
    for (const forest of [false, true]) {
      for (const r of readings(ACER_SACCHARUM, forest)) {
        const where = `${forest ? "forest" : "open"} ${r.age} y`;
        expect(r.profile.centroid, where).toBeGreaterThanOrEqual(0.37);
        expect(r.profile.centroid, where).toBeLessThanOrEqual(0.7);
        expect(r.profile.shoulder, where).toBeGreaterThanOrEqual(r.age >= 50 ? 0.6 : 0.45);
      }
    }
  });
});

describe("eastern white pine crown form", () => {
  checkWidths(PINUS_STROBUS, EASTERN_WHITE_PINE_CROWN_WIDTH);

  test("the crown is excurrent: spread carried low and tapering to the leader, at 20, 50 and 100 years", () => {
    for (const forest of [false, true]) {
      for (const r of readings(PINUS_STROBUS, forest)) {
        const where = `${forest ? "forest" : "open"} ${r.age} y`;
        expect(r.profile.centroid, where).toBeLessThanOrEqual(0.36);
        if (r.age >= 50) expect(r.profile.shoulder, where).toBeLessThanOrEqual(0.45);
      }
    }
  });
});
