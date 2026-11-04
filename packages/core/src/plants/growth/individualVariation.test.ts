import { describe, expect, test } from "bun:test";
import { randomSeedFrom } from "../../random/rng";
import { PLANT_LIBRARY } from "../species/data/plantLibrary";
import { individualGrowth } from "./individualVariation";
import { OPEN_TEMPERATE_SITE } from "./plantEnvironment";
import { createPlantGrowth } from "./plantGrowth";

const SEEDS = 10;

describe("individual variation", () => {
  test("open-grown seeds of one species differ in crown width, and stay near the typical tree's height", () => {
    const species = PLANT_LIBRARY.find((entry) => entry.id === "acer-saccharum");
    if (species === undefined) throw new Error("sugar maple missing");
    const typical = createPlantGrowth(species, OPEN_TEMPERATE_SITE, "typical", { individual: "typical" });
    typical.step(40);
    const typicalHeight = typical.structure().stats.heightM;
    const widths: number[] = [];
    for (let k = 0; k < SEEDS; k += 1) {
      const plant = createPlantGrowth(species, OPEN_TEMPERATE_SITE, `spread-${k}`);
      plant.step(40);
      const { crownRadiusM, heightM } = plant.structure().stats;
      // One site's trees of one age differ in shape, not in being half or twice as tall.
      expect(Math.abs(heightM / typicalHeight - 1), `spread-${k} ${heightM.toFixed(1)} m against ${typicalHeight.toFixed(1)} m`).toBeLessThan(0.2);
      widths.push(2 * crownRadiusM);
    }
    const spread = Math.max(...widths) / Math.min(...widths);
    expect(spread, widths.map((w) => w.toFixed(1)).join(" ")).toBeGreaterThan(1.25);
  });

  test("the same seed draws the same individual, and every trait stays inside its species' bounds", () => {
    for (const species of PLANT_LIBRARY) {
      for (let k = 0; k < 20; k += 1) {
        const a = individualGrowth(species.growth, randomSeedFrom(k + 1));
        expect(individualGrowth(species.growth, randomSeedFrom(k + 1))).toEqual(a);
        expect(a.apicalControl).toBeLessThan(1);
        expect(a.apicalControlMature).toBeLessThan(1);
        expect(a.apicalControlMature).toBeGreaterThanOrEqual(0);
        expect(a.tropism.setpointAngle).toBeLessThanOrEqual(species.growth.tropism.setpointMax);
        expect(a.branchAngle).toBeGreaterThanOrEqual(5);
      }
    }
  });
});
