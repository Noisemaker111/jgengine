import { describe, expect, test } from "bun:test";

import { OPEN_TEMPERATE_SITE } from "../growth/plantEnvironment";
import { createPlantGrowth } from "../growth/plantGrowth";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PINUS_STROBUS } from "../species/data/pinusStrobus";
import type { PlantSpecies } from "../species/plantSpecies";
import { REFERENCE_STAND } from "../species/speciesReference";
import { jenkinsFoliageKg, type JenkinsGroup } from "./foliageAllometry";

/** Grown foliage mass over Jenkins 2003 foliage mass at 20 and 50 years, open and in a stand. */
function foliageRatios(species: PlantSpecies, group: JenkinsGroup): number[] {
  const ratios: number[] = [];
  for (const env of [OPEN_TEMPERATE_SITE, REFERENCE_STAND]) {
    const plant = createPlantGrowth(species, env, "a");
    for (const age of [20, 50]) {
      plant.step(age - plant.ageYears());
      const foliageKg = plant.stats().leafAreaM2 / species.leaf.sla;
      ratios.push(foliageKg / jenkinsFoliageKg(group, plant.structure().stats.dbhCm));
    }
  }
  return ratios;
}

describe("foliage mass against Jenkins 2003", () => {
  test("Jenkins foliage mass grows with DBH and softwoods carry a larger share", () => {
    expect(jenkinsFoliageKg("pine", 30)).toBeGreaterThan(jenkinsFoliageKg("pine", 15));
    expect(jenkinsFoliageKg("pine", 30)).toBeGreaterThan(jenkinsFoliageKg("hard-maple-oak-hickory-beech", 30));
  });

  for (const [species, group] of [
    [PINUS_STROBUS, "pine"],
    [ACER_SACCHARUM, "hard-maple-oak-hickory-beech"],
  ] as const) {
    test(`${species.names.common["en"]} is within 40% at 20 and 50 years, open and in a stand`, () => {
      for (const ratio of foliageRatios(species, group)) {
        expect(ratio).toBeGreaterThan(0.6);
        expect(ratio).toBeLessThan(1.4);
      }
    }, 60_000);
  }
});
