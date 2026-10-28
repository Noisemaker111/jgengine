import { describe, expect, test } from "bun:test";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { validatePlantSpecies } from "../species/plantSpecies";
import { crownRatio, hashPlantStructure } from "../structure/plantStructure";
import { SUGAR_MAPLE_CARMEAN, siteIndexHeightM } from "../validation/heightAgeCurves";
import { OPEN_TEMPERATE_SITE } from "./plantEnvironment";
import { DEFAULT_GROWTH_LIMITS, createPlantGrowth, type PlantGrowthSnapshot } from "./plantGrowth";

const SEED = "maple";
/** Carmean 1989 site index for northern Wisconsin sugar maple on a good site, feet at 50 years. */
const SITE_INDEX_FT = 65;

interface LongRun {
  heights: Map<number, number>;
  crownRatioAt100: number;
  snapshotAt200: PlantGrowthSnapshot;
  hashAt400: string;
  maxNodes: number;
  maxBuds: number;
  alive: boolean;
}

let longRun: LongRun | undefined;

/** One open-grown tree straight to 400 years, read along the way, shared by the tests below. */
function growLong(): LongRun {
  if (longRun) return longRun;
  const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED);
  const heights = new Map<number, number>();
  let crownRatioAt100 = 0;
  let snapshotAt200: PlantGrowthSnapshot | undefined;
  for (let year = 1; year <= 400; year += 1) {
    plant.step();
    if (year === 50 || year === 100) heights.set(year, plant.structure().stats.heightM);
    if (year === 100) crownRatioAt100 = crownRatio(plant.structure());
    // Round-trip through JSON: a snapshot is plain data.
    if (year === 200) snapshotAt200 = JSON.parse(JSON.stringify(plant.snapshot()));
  }
  if (!snapshotAt200) throw new Error("no snapshot at 200 years");
  const stats = plant.stats();
  longRun = {
    heights,
    crownRatioAt100,
    snapshotAt200,
    hashAt400: hashPlantStructure(plant.structure()),
    maxNodes: stats.maxNodesSeen,
    maxBuds: stats.maxBudsSeen,
    alive: stats.alive,
  };
  return longRun;
}

describe("plant growth", () => {
  test("the sugar maple record is valid", () => {
    expect(validatePlantSpecies(ACER_SACCHARUM)).toEqual([]);
  });

  test("the same species, site and seed give the same structure hash", () => {
    const a = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED);
    const b = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED);
    const other = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, "other");
    a.step(60);
    for (let year = 0; year < 60; year += 1) b.step();
    other.step(60);
    expect(hashPlantStructure(a.structure())).toBe(hashPlantStructure(b.structure()));
    expect(hashPlantStructure(other.structure())).not.toBe(hashPlantStructure(a.structure()));
  });

  test("reset returns to the seed", () => {
    const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED);
    plant.step(30);
    const first = hashPlantStructure(plant.structure());
    plant.step(10);
    plant.reset();
    expect(plant.ageYears()).toBe(0);
    plant.step(30);
    expect(hashPlantStructure(plant.structure())).toBe(first);
  });

  test("grow to 200, snapshot, restore and grow to 400 equals growing straight to 400", () => {
    const run = growLong();
    const resumed = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED);
    resumed.restore(run.snapshotAt200);
    expect(resumed.ageYears()).toBe(200);
    resumed.step(200);
    expect(hashPlantStructure(resumed.structure())).toBe(run.hashAt400);
    expect(run.alive).toBe(true);
  }, 120_000);

  test("height at 50 and 100 years is within 15% of the Carmean site-index curve", () => {
    const run = growLong();
    for (const age of [50, 100]) {
      const expected = siteIndexHeightM(SUGAR_MAPLE_CARMEAN, SITE_INDEX_FT, age);
      const height = run.heights.get(age) ?? 0;
      expect(Math.abs(height - expected) / expected).toBeLessThan(0.15);
    }
  }, 120_000);

  test("the default caps are never exceeded", () => {
    const run = growLong();
    expect(run.maxNodes).toBeLessThanOrEqual(DEFAULT_GROWTH_LIMITS.maxNodes);
    expect(run.maxBuds).toBeLessThanOrEqual(DEFAULT_GROWTH_LIMITS.maxBuds);
  }, 120_000);

  test("tight caps bind and are never exceeded", () => {
    const limits = { maxBuds: 150, maxNodes: 1500 };
    const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED, limits);
    plant.step(150);
    const stats = plant.stats();
    expect(stats.maxBudsSeen).toBe(limits.maxBuds);
    expect(stats.maxNodesSeen).toBeLessThanOrEqual(limits.maxNodes);
    expect(stats.maxBudsSeen).toBeLessThanOrEqual(limits.maxBuds);
  });

  test("an open-grown tree keeps a longer crown than one grown under 0.2 light", () => {
    const run = growLong();
    const shaded = createPlantGrowth(ACER_SACCHARUM, { ...OPEN_TEMPERATE_SITE, light: 0.2 }, SEED);
    shaded.step(100);
    expect(shaded.stats().alive).toBe(true);
    expect(run.crownRatioAt100).toBeGreaterThan(crownRatio(shaded.structure()));
  }, 120_000);

  test("retune changes the site from the next year on", () => {
    const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED);
    plant.step(20);
    plant.retune({ light: 0.3 });
    expect(plant.environment().light).toBe(0.3);
    const before = plant.structure().stats.heightM;
    plant.step(5);
    expect(plant.structure().stats.heightM).toBeGreaterThanOrEqual(before);
  });
});
