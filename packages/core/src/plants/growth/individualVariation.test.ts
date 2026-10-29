import { describe, expect, test } from "bun:test";
import { randomSeedFrom } from "../../random/rng";
import { PLANT_LIBRARY } from "../species/data/plantLibrary";
import { crownWidthBandM, REFERENCE_STAND } from "../species/speciesReference";
import { SPECIES_REFERENCE } from "../species/speciesReferenceTable";
import { individualGrowth } from "./individualVariation";
import { createPlantGrowth } from "./plantGrowth";

const SEEDS = 10;

describe("individual variation", () => {
  test("seeds of one species span the Tallo crown-width band at one age, not a small jitter", () => {
    const species = PLANT_LIBRARY.find((entry) => entry.id === "acer-saccharum");
    const reference = SPECIES_REFERENCE["acer-saccharum"];
    if (species === undefined || reference === undefined) throw new Error("sugar maple missing");
    const widths: number[] = [];
    let dbhSum = 0;
    for (let k = 0; k < SEEDS; k += 1) {
      const plant = createPlantGrowth(species, REFERENCE_STAND, `spread-${k}`);
      plant.step(40);
      const { crownRadiusM, dbhCm } = plant.structure().stats;
      widths.push(2 * crownRadiusM);
      dbhSum += dbhCm;
    }
    const band = crownWidthBandM(reference, dbhSum / SEEDS);
    if (band === null) throw new Error("no Tallo record");
    const spread = Math.max(...widths) / Math.min(...widths);
    expect(spread, widths.map((w) => w.toFixed(1)).join(" ")).toBeGreaterThan(0.75 * (band.highM / band.lowM));
    expect(spread).toBeLessThan(3);
  });

  test("the same seed draws the same individual, and every trait stays inside its species' bounds", () => {
    for (const species of PLANT_LIBRARY) {
      for (let k = 0; k < 20; k += 1) {
        const a = individualGrowth(species.growth, randomSeedFrom(k + 1));
        expect(individualGrowth(species.growth, randomSeedFrom(k + 1))).toEqual(a);
        expect(a.apicalControl).toBeLessThan(1);
        expect(a.apicalControlMature).toBeLessThan(1);
        expect(a.tropism.setpointAngle).toBeLessThanOrEqual(species.growth.tropism.setpointMax);
        expect(a.branchAngle).toBeGreaterThanOrEqual(5);
      }
    }
  });
});
