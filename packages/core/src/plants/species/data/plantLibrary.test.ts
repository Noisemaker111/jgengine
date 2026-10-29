import { describe, expect, test } from "bun:test";
import { OPEN_TEMPERATE_SITE } from "../../growth/plantEnvironment";
import { createPlantGrowth } from "../../growth/plantGrowth";
import { PLANT_REGION } from "../../structure/plantStructure";
import { PLANT_LIBRARY } from "./plantLibrary";
import { basalStemCount, habitHeightAt20M, habitHeightCeilingM, SHRUB_STEMS } from "../habitReference";
import { HABIT_REFERENCE } from "../habitReferenceTable";
import { validatePlantSpecies, type PlantSpecies } from "../plantSpecies";
import { crownWidthBandM, REFERENCE_STAND, standDbhAtCm, standHeightAtM } from "../speciesReference";
import { SPECIES_REFERENCE } from "../speciesReferenceTable";

const SEED = "a";
const AGES = [20, 50, 100] as const;

function checkTree(species: PlantSpecies): void {
  test(`${species.id}: a stand-grown tree is within 15% of its height, 25% of its DBH and inside the Tallo crown band at 20, 50 and 100 years`, () => {
    expect(validatePlantSpecies(species)).toEqual([]);
    const reference = SPECIES_REFERENCE[species.id];
    if (reference === undefined) throw new Error(`no reference for ${species.id}`);
    const plant = createPlantGrowth(species, REFERENCE_STAND, SEED);
    for (const age of AGES) {
      plant.step(age - plant.ageYears());
      const { heightM, dbhCm, crownRadiusM } = plant.structure().stats;
      expect(Math.abs(heightM / standHeightAtM(reference, age) - 1), `${age} y height ${heightM.toFixed(1)} m`).toBeLessThan(0.15);
      expect(Math.abs(dbhCm / standDbhAtCm(reference, age) - 1), `${age} y DBH ${dbhCm.toFixed(1)} cm`).toBeLessThan(0.25);
      const band = crownWidthBandM(reference, dbhCm);
      if (band === null) throw new Error(`no Tallo record for ${species.id}`);
      expect(2 * crownRadiusM, `${age} y crown width`).toBeGreaterThanOrEqual(band.lowM);
      expect(2 * crownRadiusM, `${age} y crown width`).toBeLessThanOrEqual(band.highM);
    }
  }, 60_000);
}

function checkHabit(species: PlantSpecies): void {
  test(`${species.id}: an open-grown ${species.habit} is within 15% of its USDA PLANTS height at 20 years, holds its mature height at 40 and keeps its stems`, () => {
    expect(validatePlantSpecies(species)).toEqual([]);
    const reference = HABIT_REFERENCE[species.id];
    if (reference === undefined) throw new Error(`no PLANTS reference for ${species.id}`);
    const plant = createPlantGrowth(species, OPEN_TEMPERATE_SITE, SEED);
    for (const age of [20, 40]) {
      plant.step(age - plant.ageYears());
      const structure = plant.structure();
      const { heightM, crownRadiusM } = structure.stats;
      if (age === 20) expect(Math.abs(heightM / habitHeightAt20M(reference) - 1), `20 y height ${heightM.toFixed(2)} m`).toBeLessThan(0.15);
      else expect(heightM / habitHeightCeilingM(reference), `40 y height ${heightM.toFixed(2)} m`).toBeLessThan(1.15);
      expect(crownRadiusM, `${age} y crown radius`).toBeLessThanOrEqual(species.limits.maxCrownRadiusM * 1.1);
      if (reference.multiStem) {
        const stems = basalStemCount(structure.segments, PLANT_REGION.deadwood);
        expect(stems, `${age} y stems`).toBeGreaterThanOrEqual(SHRUB_STEMS.min);
        expect(stems, `${age} y stems`).toBeLessThanOrEqual(SHRUB_STEMS.max);
      }
    }
  }, 60_000);
}

describe("plant species library", () => {
  for (const species of PLANT_LIBRARY) {
    if (species.habit === "tree") checkTree(species);
    else checkHabit(species);
  }
});

describe("palm trunks", () => {
  test("a coconut's surplus carbon never balloons its newest trunk sections (seed forest-b-cocos-nucifera, 60 years)", () => {
    const coconut = PLANT_LIBRARY.find((species) => species.id === "cocos-nucifera");
    if (coconut === undefined) throw new Error("cocos-nucifera missing");
    const growth = createPlantGrowth(coconut, { ...OPEN_TEMPERATE_SITE, light: 1 }, "forest-b-cocos-nucifera");
    growth.step(60);
    const { segments, stats } = growth.structure();
    // A coconut trunk is 25-40 cm across; a 15 m slab of bark came from metre-wide sections.
    expect(Math.max(...segments.radiusStart, ...segments.radiusEnd)).toBeLessThan(0.6);
    for (let i = 0; i < segments.order.length; i += 1) {
      expect(Math.hypot(segments.end[i * 3] ?? 0, segments.end[i * 3 + 2] ?? 0)).toBeLessThan(stats.crownRadiusM + 1);
      expect(segments.end[i * 3 + 1] ?? 0).toBeGreaterThanOrEqual(-0.01);
    }
  });
});
