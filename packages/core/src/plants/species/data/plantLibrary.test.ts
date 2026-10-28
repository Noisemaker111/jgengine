import { describe, expect, test } from "bun:test";
import { createPlantGrowth } from "../../growth/plantGrowth";
import { PLANT_LIBRARY } from "./plantLibrary";
import { validatePlantSpecies } from "../plantSpecies";
import { crownWidthBandM, REFERENCE_STAND, standDbhAtCm, standHeightAtM } from "../speciesReference";
import { SPECIES_REFERENCE } from "../speciesReferenceTable";

const SEED = "a";
const AGES = [20, 50, 100] as const;

describe("plant species library", () => {
  for (const species of PLANT_LIBRARY) {
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
});
