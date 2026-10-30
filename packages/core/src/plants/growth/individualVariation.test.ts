import { describe, expect, test } from "bun:test";
import { randomSeedFrom } from "../../random/rng";
import { PLANT_LIBRARY } from "../species/data/plantLibrary";
import { crownWidthBandM } from "../species/speciesReference";
import { SPECIES_REFERENCE } from "../species/speciesReferenceTable";
import { individualGrowth } from "./individualVariation";
import { OPEN_TEMPERATE_SITE } from "./plantEnvironment";
import { createPlantGrowth } from "./plantGrowth";

const SEEDS = 10;

describe("individual variation", () => {
  test("open-grown seeds of one species differ in crown width inside the Tallo band, and stay near the typical tree's height", () => {
    const species = PLANT_LIBRARY.find((entry) => entry.id === "acer-saccharum");
    const reference = SPECIES_REFERENCE["acer-saccharum"];
    if (species === undefined || reference === undefined) throw new Error("sugar maple missing");
    const typical = createPlantGrowth(species, OPEN_TEMPERATE_SITE, "typical", { individual: "typical" });
    typical.step(40);
    const typicalHeight = typical.structure().stats.heightM;
    const widths: number[] = [];
    let dbhSum = 0;
    for (let k = 0; k < SEEDS; k += 1) {
      const plant = createPlantGrowth(species, OPEN_TEMPERATE_SITE, `spread-${k}`);
      plant.step(40);
      const { crownRadiusM, dbhCm, heightM } = plant.structure().stats;
      // One site's trees of one age differ in shape, not in being half or twice as tall.
      expect(Math.abs(heightM / typicalHeight - 1), `spread-${k} ${heightM.toFixed(1)} m against ${typicalHeight.toFixed(1)} m`).toBeLessThan(0.2);
      widths.push(2 * crownRadiusM);
      dbhSum += dbhCm;
    }
    const band = crownWidthBandM(reference, dbhSum / SEEDS);
    if (band === null) throw new Error("no Tallo record");
    const spread = Math.max(...widths) / Math.min(...widths);
    const detail = widths.map((w) => w.toFixed(1)).join(" ");
    // Tallo's band also holds other sites and competition, so one site's seeds span part of it.
    expect(spread, detail).toBeGreaterThan(1.25);
    expect(spread, detail).toBeLessThan(band.highM / band.lowM);
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
