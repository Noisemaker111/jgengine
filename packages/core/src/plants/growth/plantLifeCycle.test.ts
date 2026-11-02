import { describe, expect, test } from "bun:test";

import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PINUS_STROBUS } from "../species/data/pinusStrobus";
import { growingSeason } from "./phenology";
import { OPEN_TEMPERATE_SITE } from "./plantEnvironment";
import { createPlantGrowth } from "./plantGrowth";

describe("plant life cycle", () => {
  test("a deciduous tree is leafless on day 15 and in full leaf on day 200 on the same structure", () => {
    const maple = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, "seasons");
    maple.step(20);
    const winter = maple.structure(15);
    const summer = maple.structure(200);
    expect(winter.leaves.size.length).toBe(0);
    expect(summer.leaves.size.length).toBeGreaterThan(1000);
    expect(Array.from(winter.segments.end)).toEqual(Array.from(summer.segments.end));
  }, 60_000);

  test("autumn leaves senesce before they fall", () => {
    const maple = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, "autumn");
    maple.step(20);
    const { leafOffDay } = growingSeason(ACER_SACCHARUM, OPEN_TEMPERATE_SITE);
    const senescence = (day: number): number => {
      const state = maple.structure(day).leaves.colorState;
      let sum = 0;
      for (let i = 3; i < state.length; i += 4) sum += state[i] ?? 0;
      return sum / Math.max(1, state.length / 4);
    };
    expect(senescence(200)).toBe(0);
    expect(senescence(leafOffDay - 5)).toBeGreaterThan(0.5);
  }, 60_000);

  test("budburst moves later in a colder environment", () => {
    const mild = growingSeason(ACER_SACCHARUM, OPEN_TEMPERATE_SITE);
    const cold = growingSeason(ACER_SACCHARUM, { ...OPEN_TEMPERATE_SITE, temperatureC: 2 });
    expect(cold.leafOnDay).toBeGreaterThan(mild.leafOnDay + 7);
  });

  test("a dead tree passes through every decay class, the soft pine faster than the dense maple", () => {
    const fallYear = (classes: number[]): number => classes.indexOf(5);
    const decay = (species: typeof ACER_SACCHARUM): { classes: number[]; heights: number[] } => {
      const tree = createPlantGrowth(species, OPEN_TEMPERATE_SITE, "snag", { individual: "typical" });
      tree.step(60);
      expect(tree.stats().decayClass).toBe(0);
      tree.kill();
      const classes: number[] = [];
      const heights: number[] = [];
      for (let year = 0; year < 50; year += 1) {
        classes.push(tree.stats().decayClass);
        heights.push(tree.structure().stats.heightM);
        tree.step();
      }
      return { classes, heights };
    };
    const maple = decay(ACER_SACCHARUM);
    const pine = decay(PINUS_STROBUS);
    for (const { classes, heights } of [maple, pine]) {
      expect(new Set(classes)).toEqual(new Set([1, 2, 3, 4, 5]));
      classes.forEach((value, year) => expect(value).toBeGreaterThanOrEqual(classes[year - 1] ?? 1));
      // The top breaks off well before the trunk falls.
      const firstBare = classes.indexOf(4);
      expect(heights[fallYear(classes) - 1] ?? 0).toBeLessThan(0.8 * (heights[firstBare] ?? 0));
    }
    expect(fallYear(pine.classes)).toBeLessThan(fallYear(maple.classes));
    // Snags of eastern hardwoods and pines mostly fall within 5 to 40 years (Harmon et al. 1986).
    expect(fallYear(pine.classes)).toBeGreaterThan(5);
    expect(fallYear(maple.classes)).toBeLessThan(40);
  }, 120_000);

  test("a snag snapshot resumes the same decay", () => {
    const straight = createPlantGrowth(PINUS_STROBUS, OPEN_TEMPERATE_SITE, "resume-snag");
    straight.step(30);
    straight.kill();
    straight.step(4);
    const snapshot = straight.snapshot();
    straight.step(6);
    const resumed = createPlantGrowth(PINUS_STROBUS, OPEN_TEMPERATE_SITE, "resume-snag");
    resumed.restore(snapshot);
    resumed.step(6);
    expect(resumed.stats()).toEqual(straight.stats());
  }, 60_000);
});
