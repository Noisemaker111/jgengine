import { describe, expect, test } from "bun:test";
import { OPEN_TEMPERATE_SITE, type PlantEnvironment } from "../growth/plantEnvironment";
import { createPlantGrowth } from "../growth/plantGrowth";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PINUS_STROBUS } from "../species/data/pinusStrobus";
import type { PlantSpecies } from "../species/plantSpecies";
import { crownRatio } from "../structure/plantStructure";
import { EASTERN_WHITE_PINE_CARMEAN, SUGAR_MAPLE_CARMEAN, siteIndexHeightM, type SiteIndexCurve } from "./heightAgeCurves";
import { BAAD_LEAF_TO_SAPWOOD, FIA_STAND_DIAMETER } from "./stemAllometry";
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
/** Open-grown crown width per DBH against Ek 1974. */
const OPEN_WIDTH_RATIO = { low: 0.8, high: 1.25 };
/** Carmean 1989 site index of the FIA site trees the stand diameters come from, feet at 50 years. */
const SITE_INDEX_FT = 65;

interface Reading {
  age: number;
  dbhCm: number;
  crownWidthM: number;
  crownRatio: number;
  profile: CrownProfile;
  heightM: number;
  leafToSapwood: number;
}

function grow(species: PlantSpecies, env: PlantEnvironment): Reading[] {
  const plant = createPlantGrowth(species, env, SEED);
  const readings: Reading[] = [];
  for (const age of AGES) {
    plant.step(age - plant.ageYears());
    const structure = plant.structure();
    const stats = plant.stats();
    readings.push({
      age,
      dbhCm: structure.stats.dbhCm,
      crownWidthM: 2 * structure.stats.crownRadiusM,
      crownRatio: crownRatio(structure),
      profile: crownProfile(structure),
      heightM: structure.stats.heightM,
      leafToSapwood: stats.sapwoodAtBreastHeightM2 > 0 ? stats.leafAreaM2 / stats.sapwoodAtBreastHeightM2 : 0,
    });
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

function checkWidths(species: PlantSpecies, equations: CrownWidthEquations, curve: SiteIndexCurve): void {
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
      expect(r.crownWidthM, `${r.age} y`).toBeGreaterThanOrEqual(band.lowM);
      expect(r.crownWidthM, `${r.age} y`).toBeLessThanOrEqual(band.highM);
      // Bechtold 2003 is a regression mean; its residual is about a third of the width.
      const mean = forestGrownCrownWidthM(equations, r.dbhCm, r.crownRatio);
      expect(r.crownWidthM / mean, `${r.age} y`).toBeLessThan(2.2);
    }
  });

  test("a forest-grown tree is within 15% of Carmean height and 25% of FIA site-tree DBH", () => {
    const stand = readings(species, true);
    for (const r of stand) if (r.age >= 50) expect(Math.abs(r.heightM / siteIndexHeightM(curve, SITE_INDEX_FT, r.age) - 1), `${r.age} y height`).toBeLessThan(0.15);
    for (const target of FIA_STAND_DIAMETER[species.id] ?? []) {
      const r = stand.find((reading) => reading.age === target.ageYears);
      if (r === undefined) throw new Error(`no reading at ${target.ageYears} y`);
      expect(Math.abs(r.dbhCm / target.dbhCm - 1), `${r.age} y DBH ${r.dbhCm}`).toBeLessThan(0.25);
    }
  });

  test("an open-grown tree at 100 years carries the measured leaf area per sapwood area", () => {
    const band = BAAD_LEAF_TO_SAPWOOD[species.leaf.lifespanYears > 1 ? "evergreen" : "deciduous"];
    const r = readings(species, false).find((reading) => reading.age === 100);
    expect(r?.leafToSapwood).toBeGreaterThan(band.low);
    expect(r?.leafToSapwood).toBeLessThan(band.high);
  });

  test("an open-grown crown is long and a forest-grown one is pruned up", () => {
    for (const r of readings(species, false)) expect(r.crownRatio, `${r.age} y`).toBeGreaterThan(0.5);
    for (const r of readings(species, true)) if (r.age >= 50) expect(r.crownRatio, `${r.age} y`).toBeLessThan(0.55);
  });
}

describe("sugar maple crown form", () => {
  checkWidths(ACER_SACCHARUM, SUGAR_MAPLE_CROWN_WIDTH, SUGAR_MAPLE_CARMEAN);

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
  checkWidths(PINUS_STROBUS, EASTERN_WHITE_PINE_CROWN_WIDTH, EASTERN_WHITE_PINE_CARMEAN);

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
