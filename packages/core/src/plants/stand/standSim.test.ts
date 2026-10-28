import { describe, expect, test } from "bun:test";

import { seededRng } from "../../random/rng";
import { createPlantGrowth } from "../growth/plantGrowth";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { BETULA_PAPYRIFERA } from "../species/data/betulaPapyrifera";
import { PINUS_RESINOSA } from "../species/data/pinusResinosa";
import { POPULUS_TREMULOIDES } from "../species/data/populusTremuloides";
import { createStand, standTreeGrowth, type StandOptions, type StandSnapshot } from "./standSim";

const NORTHERN_HARDWOODS: StandOptions = { species: [ACER_SACCHARUM, BETULA_PAPYRIFERA, POPULUS_TREMULOIDES], sizeM: 100, seed: "hardwoods", immigrationPerHa: 2000 };

function plantation(seed: string) {
  const stand = createStand({ species: [PINUS_RESINOSA], sizeM: 100, seed, recruitment: false });
  const place = seededRng(`${seed}:place`);
  stand.plant(Array.from({ length: 5000 }, () => ({ species: 0, x: place() * 100, z: place() * 100 })));
  return stand;
}

const share = (basal: readonly number[], index: number): number => (basal[index] ?? 0) / Math.max(1e-9, basal.reduce((a, b) => a + b, 0));

describe("forest stand", () => {
  test("a dense red pine plantation self-thins along Reineke's line", () => {
    const stand = plantation("reineke");
    const logDq: number[] = [];
    const logN: number[] = [];
    for (let year = 1; year <= 120; year += 1) {
      stand.step();
      if (year < 20) continue;
      const stats = stand.stats();
      logDq.push(Math.log(stats.quadraticMeanDbhCm));
      logN.push(Math.log(stats.treesPerHa));
    }
    const n = logDq.length;
    const mx = logDq.reduce((a, b) => a + b, 0) / n;
    const my = logN.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let k = 0; k < n; k += 1) {
      sxy += ((logDq[k] ?? 0) - mx) * ((logN[k] ?? 0) - my);
      sxx += ((logDq[k] ?? 0) - mx) ** 2;
    }
    // Reineke 1933: ln N against ln Dq falls with slope -1.605.
    expect(sxy / sxx).toBeGreaterThan(-1.9);
    expect(sxy / sxx).toBeLessThan(-1.3);
  }, 60_000);

  test("a cleared plot seeded by sugar maple, paper birch and aspen turns maple-dominated by year 200", () => {
    const stand = createStand(NORTHERN_HARDWOODS);
    stand.step(50);
    const early = stand.stats().basalAreaM2PerHa;
    stand.step(150);
    const late = stand.stats().basalAreaM2PerHa;
    // Pioneers share the young stand, then the shade-tolerant maple takes it over.
    expect(share(early, 1) + share(early, 2)).toBeGreaterThan(0.3);
    expect(share(late, 0)).toBeGreaterThan(0.8);
  }, 60_000);

  test("one hectare runs 300 years in under 10 s", () => {
    const stand = createStand({ ...NORTHERN_HARDWOODS, seed: "timing" });
    const start = performance.now();
    stand.step(300);
    expect(performance.now() - start).toBeLessThan(10_000);
    expect(stand.stats().treesPerHa).toBeGreaterThan(100);
  }, 60_000);

  test("snapshot at 60 years, restore and run to 120 equals running straight to 120", () => {
    const straight = createStand({ ...NORTHERN_HARDWOODS, seed: "resume" });
    straight.step(60);
    const snapshot: StandSnapshot = JSON.parse(JSON.stringify(straight.snapshot()));
    straight.step(60);
    const resumed = createStand({ ...NORTHERN_HARDWOODS, seed: "resume" });
    resumed.restore(snapshot);
    resumed.step(60);
    expect(resumed.year()).toBe(120);
    expect(resumed.trees()).toEqual(straight.trees());
    expect(resumed.stats()).toEqual(straight.stats());
  }, 60_000);

  test("reset returns to the seed", () => {
    const stand = createStand({ ...NORTHERN_HARDWOODS, seed: "reset" });
    stand.step(30);
    const first = stand.trees();
    stand.reset();
    expect(stand.year()).toBe(0);
    stand.step(30);
    expect(stand.trees()).toEqual(first);
  }, 60_000);

  test("a drier site grows a thinner stand", () => {
    const wet = createStand({ ...NORTHERN_HARDWOODS, seed: "site" });
    const dry = createStand({ ...NORTHERN_HARDWOODS, seed: "site" });
    dry.retune({ soilWater: 0.3 });
    wet.step(60);
    dry.step(60);
    const total = (basal: readonly number[]): number => basal.reduce((a, b) => a + b, 0);
    expect(total(dry.stats().basalAreaM2PerHa)).toBeLessThan(total(wet.stats().basalAreaM2PerHa));
  }, 60_000);

  test("a suppressed maple grows at full detail from its own seed and the light it lived under", () => {
    const stand = createStand({ ...NORTHERN_HARDWOODS, seed: "tier-b" });
    stand.step(80);
    const trees = stand.trees();
    const { treesPerHa } = stand.stats();
    let dominant = trees[0];
    let suppressed: (typeof trees)[number] | undefined;
    for (const tree of trees) {
      if (tree.heightM > (dominant?.heightM ?? 0)) dominant = tree;
      if (tree.species === 0 && tree.ageYears > 20 && tree.heightM < (suppressed?.heightM ?? Infinity)) suppressed = tree;
    }
    if (dominant === undefined || suppressed === undefined) throw new Error("no trees");
    const top = standTreeGrowth(NORTHERN_HARDWOODS, dominant, treesPerHa);
    const under = standTreeGrowth(NORTHERN_HARDWOODS, suppressed, treesPerHa);
    expect(top.seed).not.toBe(under.seed);
    expect(under.env.light).toBeLessThan(top.env.light);
    const plant = createPlantGrowth(under.species, under.env, under.seed);
    plant.step(Math.min(15, under.ageYears));
    expect(plant.stats().alive).toBe(true);
  }, 60_000);
});
