import { describe, expect, test } from "bun:test";

import { fairChance, longestStreak } from "./fairChance";
import { hashUnit, seededRng } from "./rng";
import { acrossSeeds } from "./seedSweep";

const rolls = (key: string, chance: number, count: number, bag?: number) =>
  Array.from({ length: count }, (_, index) => fairChance(key, index, chance, bag === undefined ? {} : { bag }));

describe("fair chance", () => {
  test("keeps the odds over any stretch of rolls", () => {
    for (const chance of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const results = rolls(`odds:${chance}`, chance, 400);
      expect(results.filter(Boolean).length / 400).toBeCloseTo(chance, 1);
      for (let start = 0; start + 20 <= 400; start += 20) {
        const share = results.slice(start, start + 20).filter(Boolean).length / 20;
        expect(Math.abs(share - chance)).toBeLessThanOrEqual(0.2);
      }
    }
  });

  test("a coin flip never runs more than four the same way, on any seed", () => {
    for (let seed = 0; seed < 200; seed += 1) expect(longestStreak(rolls(`coin:${seed}`, 0.5, 200)).length).toBeLessThanOrEqual(4);
  });

  test("a 70% roll never misses more than four in a row, and a 30% one never hits more than four in a row", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const likely = rolls(`likely:${seed}`, 0.7, 200);
      const unlikely = rolls(`unlikely:${seed}`, 0.3, 200);
      let misses = 0;
      let hits = 0;
      for (let i = 0; i < 200; i += 1) {
        misses = likely[i] === true ? 0 : misses + 1;
        hits = unlikely[i] === true ? hits + 1 : 0;
        expect(misses).toBeLessThanOrEqual(4);
        expect(hits).toBeLessThanOrEqual(4);
      }
    }
  });

  test("the same key and index always answer the same; another key deals another order", () => {
    expect(rolls("replay", 0.5, 50)).toEqual(rolls("replay", 0.5, 50));
    expect(rolls("replay", 0.5, 50)).not.toEqual(rolls("other", 0.5, 50));
  });

  test("never and always hold at the ends", () => {
    expect(rolls("never", 0, 30).some(Boolean)).toBe(false);
    expect(rolls("always", 1, 30).every(Boolean)).toBe(true);
  });
});

describe("the shared hash has no streaks of its own", () => {
  test("rolls for neighbouring keys are independent", () => {
    const values = Array.from({ length: 2000 }, (_, index) => hashUnit(`turf:push:marina:${index}:chance`));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    let lagged = 0;
    let spread = 0;
    for (let i = 0; i < values.length; i += 1) {
      const centred = (values[i] ?? 0) - mean;
      spread += centred * centred;
      if (i > 0) lagged += centred * ((values[i - 1] ?? 0) - mean);
    }
    expect(Math.abs(lagged / spread)).toBeLessThan(0.08);
    expect(longestStreak(values.map((value) => value < 0.7)).length).toBeLessThan(30);
    expect(longestStreak(values.map((value) => value < 0.5)).length).toBeLessThan(16);
  });

  test("a seeded stream's coin flips run no longer than fair coins do", () => {
    const sweep = acrossSeeds(200, (seed) => {
      const rng = seededRng(seed);
      return longestStreak(Array.from({ length: 100 }, () => rng() < 0.5)).length <= 12;
    });
    expect(sweep.rate).toBeGreaterThan(0.97);
  });
});

describe("acrossSeeds", () => {
  test("reports the share of seeds a scenario held for and names the ones it failed", () => {
    const sweep = acrossSeeds(10, (seed) => !seed.endsWith(":3") && !seed.endsWith(":7"));
    expect(sweep.rate).toBe(0.8);
    expect(sweep.failed).toEqual(["sweep:3", "sweep:7"]);
  });
});
