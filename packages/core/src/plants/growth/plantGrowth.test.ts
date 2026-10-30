import { describe, expect, test } from "bun:test";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PINUS_STROBUS } from "../species/data/pinusStrobus";
import { VACCINIUM_CORYMBOSUM } from "../species/data/vacciniumCorymbosum";
import { basalStemCount } from "../species/habitReference";
import { PLANT_REGION } from "../structure/plantStructure";
import { validatePlantSpecies } from "../species/plantSpecies";
import { crownRatio, hashPlantStructure } from "../structure/plantStructure";
import { siteIndexHeightM, type SiteIndexCurve } from "../validation/heightAgeCurves";
import { SPECIES_REFERENCE } from "../species/speciesReferenceTable";
import { OPEN_TEMPERATE_SITE } from "./plantEnvironment";
import { DEFAULT_GROWTH_LIMITS, createPlantGrowth, type PlantGrowthSnapshot } from "./plantGrowth";

const SEED = "maple";
/** Carmean 1989 site index for northern Wisconsin sugar maple on a good site, feet at 50 years. */
const SITE_INDEX_FT = 65;

function carmeanOf(speciesId: string): SiteIndexCurve {
  const curve = SPECIES_REFERENCE[speciesId]?.carmean;
  if (curve === undefined) throw new Error(`no Carmean curve for ${speciesId}`);
  return curve;
}

interface LongRun {
  heights: Map<number, number>;
  crownRatioAt100: number;
  snapshotAtHalf: PlantGrowthSnapshot;
  hashAtEnd: string;
  maxNodes: number;
  maxBuds: number;
  alive: boolean;
}

let longRun: LongRun | undefined;

/** Sugar maple commonly lives 300 to 400 years (Silvics of North America), so every tree is alive at 300. */
const LONG_RUN_YEARS = 300;
const HALF_RUN_YEARS = LONG_RUN_YEARS / 2;

/** One open-grown tree straight to {@link LONG_RUN_YEARS}, read along the way, shared by the tests below. */
function growLong(): LongRun {
  if (longRun) return longRun;
  const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED, { individual: "typical" });
  const heights = new Map<number, number>();
  let crownRatioAt100 = 0;
  let snapshotAtHalf: PlantGrowthSnapshot | undefined;
  for (let year = 1; year <= LONG_RUN_YEARS; year += 1) {
    plant.step();
    if (year === 50 || year === 100) heights.set(year, plant.structure().stats.heightM);
    if (year === 100) crownRatioAt100 = crownRatio(plant.structure());
    // Round-trip through JSON: a snapshot is plain data.
    if (year === HALF_RUN_YEARS) snapshotAtHalf = JSON.parse(JSON.stringify(plant.snapshot()));
  }
  if (!snapshotAtHalf) throw new Error(`no snapshot at ${HALF_RUN_YEARS} years`);
  const stats = plant.stats();
  longRun = {
    heights,
    crownRatioAt100,
    snapshotAtHalf,
    hashAtEnd: hashPlantStructure(plant.structure()),
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

  test(`grow to ${HALF_RUN_YEARS}, snapshot, restore and grow to ${LONG_RUN_YEARS} equals growing straight to ${LONG_RUN_YEARS}`, () => {
    const run = growLong();
    const resumed = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED, { individual: "typical" });
    resumed.restore(run.snapshotAtHalf);
    expect(resumed.ageYears()).toBe(HALF_RUN_YEARS);
    resumed.step(LONG_RUN_YEARS - HALF_RUN_YEARS);
    expect(hashPlantStructure(resumed.structure())).toBe(run.hashAtEnd);
    expect(run.alive).toBe(true);
  }, 120_000);

  test("height at 50 and 100 years is within 15% of the Carmean site-index curve", () => {
    const run = growLong();
    for (const age of [50, 100]) {
      const expected = siteIndexHeightM(carmeanOf("acer-saccharum"), SITE_INDEX_FT, age);
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
    const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED, { limits });
    plant.step(150);
    const stats = plant.stats();
    expect(stats.maxBudsSeen).toBe(limits.maxBuds);
    expect(stats.maxNodesSeen).toBeLessThanOrEqual(limits.maxNodes);
    expect(stats.maxBudsSeen).toBeLessThanOrEqual(limits.maxBuds);
  });

  test("a sugar maple keeps a leafy crown for 100 years under 0.2 light on every seed", () => {
    for (const seed of [SEED, "a", "b"]) {
      const shaded = createPlantGrowth(ACER_SACCHARUM, { ...OPEN_TEMPERATE_SITE, light: 0.2 }, seed);
      shaded.step(100);
      expect(shaded.stats().alive, seed).toBe(true);
      expect(shaded.stats().leafAreaM2, seed).toBeGreaterThan(2);
    }
  }, 120_000);

  test("a multi-stemmed seedling grows its basal stems, and DBH is their quadratic sum", () => {
    const plant = createPlantGrowth({ ...ACER_SACCHARUM, growth: { ...ACER_SACCHARUM.growth, basalStems: 3 } }, OPEN_TEMPERATE_SITE, SEED);
    plant.step(25);
    const { segments, stats } = plant.structure();
    let squared = 0;
    let stems = 0;
    for (let i = 0; i < segments.order.length; i += 1) {
      const startY = segments.start[i * 3 + 1] ?? 0;
      const endY = segments.end[i * 3 + 1] ?? 0;
      if (segments.order[i] !== 0 || startY > 1.3 || endY <= 1.3) continue;
      stems += 1;
      squared += (2 * (segments.radiusStart[i] ?? 0) * 100) ** 2;
    }
    expect(stems).toBe(3);
    expect(stats.dbhCm).toBeGreaterThan(0);
    expect(Math.abs(stats.dbhCm - Math.sqrt(squared)) / stats.dbhCm).toBeLessThan(0.1);
  }, 60_000);

  test("a set point past 90 degrees lets fine shoots hang below the horizontal", () => {
    const hangingShare = (setpointMax: number): number => {
      const tropism = { ...PINUS_STROBUS.growth.tropism, setpointAngle: 80, setpointPerOrder: 30, setpointMax };
      const plant = createPlantGrowth({ ...PINUS_STROBUS, growth: { ...PINUS_STROBUS.growth, tropism } }, OPEN_TEMPERATE_SITE, SEED, { individual: "typical" });
      plant.step(30);
      const { segments } = plant.structure();
      let hanging = 0;
      let total = 0;
      for (let i = 0; i < segments.order.length; i += 1) {
        const dx = (segments.end[i * 3] ?? 0) - (segments.start[i * 3] ?? 0);
        const dy = (segments.end[i * 3 + 1] ?? 0) - (segments.start[i * 3 + 1] ?? 0);
        const dz = (segments.end[i * 3 + 2] ?? 0) - (segments.start[i * 3 + 2] ?? 0);
        const length = Math.hypot(dx, dy, dz);
        total += length;
        if (dy < -0.5 * length) hanging += length;
      }
      return hanging / Math.max(1e-9, total);
    };
    // Share of shoot length hanging steeper than 30 degrees below the horizontal.
    expect(hangingShare(150)).toBeGreaterThan(2 * hangingShare(90) + 0.02);
  }, 120_000);

  test("this year's new shoots are drawn lit like the buds they grew from, not as deep shade", () => {
    const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, SEED, { individual: "typical" });
    plant.step(20);
    const { leaves, segments } = plant.structure();
    let newest = 0;
    for (let row = 0; row < leaves.segment.length; row += 1) newest = Math.max(newest, segments.bornYear[leaves.segment[row] ?? 0] ?? 0);
    let depth = 0;
    let rows = 0;
    for (let row = 0; row < leaves.segment.length; row += 1) {
      if ((segments.bornYear[leaves.segment[row] ?? 0] ?? 0) !== newest) continue;
      depth += leaves.crownDepth[row] ?? 1;
      rows += 1;
    }
    expect(rows).toBeGreaterThan(0);
    // Unlit, every new shoot read as fully shaded (depth 1) and drew darkest at the crown's surface.
    expect(depth / rows).toBeLessThan(0.8);
  });

  test("an open-grown tree keeps a longer crown than one grown in a closed stand", () => {
    const run = growLong();
    const stand = createPlantGrowth(ACER_SACCHARUM, { ...OPEN_TEMPERATE_SITE, stand: { spacingIndex: 0.25 } }, SEED, { individual: "typical" });
    stand.step(100);
    expect(run.crownRatioAt100).toBeGreaterThan(crownRatio(stand.structure()) + 0.2);
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

describe("eastern white pine", () => {
  test("the record is valid", () => {
    expect(validatePlantSpecies(PINUS_STROBUS)).toEqual([]);
  });

  test("height at 50 and 100 years is within 15% of the Carmean site-index curve", () => {
    const plant = createPlantGrowth(PINUS_STROBUS, OPEN_TEMPERATE_SITE, "pine");
    for (const age of [50, 100]) {
      plant.step(age - plant.ageYears());
      const expected = siteIndexHeightM(carmeanOf("pinus-strobus"), SITE_INDEX_FT, age);
      expect(Math.abs(plant.structure().stats.heightM - expected) / expected).toBeLessThan(0.15);
    }
    expect(plant.stats().alive).toBe(true);
  }, 60_000);

  test("evergreen needles keep their colour through winter", () => {
    const plant = createPlantGrowth(PINUS_STROBUS, OPEN_TEMPERATE_SITE, "pine");
    plant.step(8);
    const winter = plant.structure(355);
    expect(winter.leaves.size.length).toBeGreaterThan(0);
    expect(Math.max(...winter.leaves.colorState.filter((_, i) => i % 4 === 3))).toBe(0);
  });
});

describe("highbush blueberry", () => {
  test("old stems die and suckers replace them, so the clump keeps its stems and height", () => {
    const shrub = createPlantGrowth(VACCINIUM_CORYMBOSUM, OPEN_TEMPERATE_SITE, "clump");
    const lifespan = VACCINIUM_CORYMBOSUM.growth.stemLifespanYears ?? 0;
    expect(lifespan).toBeGreaterThan(0);
    shrub.step(40);
    const { segments, stats } = shrub.structure();
    let oldest = 40;
    for (let i = 0; i < segments.parent.length; i += 1) {
      if (segments.parent[i] === 0 && segments.order[i] === 0 && segments.region[i] !== PLANT_REGION.deadwood) oldest = Math.min(oldest, segments.bornYear[i] ?? 0);
    }
    expect(40 - oldest).toBeLessThan(1.5 * lifespan);
    expect(basalStemCount(segments, PLANT_REGION.deadwood)).toBeGreaterThanOrEqual(3);
    expect(stats.heightM).toBeGreaterThan(2);
    expect(shrub.stats().alive).toBe(true);
  }, 60_000);
});
