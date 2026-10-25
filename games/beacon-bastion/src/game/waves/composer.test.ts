import { describe, expect, test } from "bun:test";

import { CREEP_CATALOG } from "../entities/enemies/catalog";
import {
  BOSS_EVERY_WAVES,
  BOSS_ORDER,
  COMPOSE_FROM_WAVE,
  ELITE_ROSTER,
  SQUAD_PATTERNS,
  bossForWave,
  composeWave,
  composeWaves,
} from "./composer";
import { DIRECTOR_SEED, ENCOUNTER, TOTAL_WAVES, bossProfile } from "./manifest";

const composedWaves = () => ENCOUNTER.waves.slice(COMPOSE_FROM_WAVE - 1);

describe("the seeded wave composer", () => {
  test("the same seed and wave always compose the same wave", () => {
    for (let wave = COMPOSE_FROM_WAVE; wave <= TOTAL_WAVES; wave += 1) {
      expect(composeWave(DIRECTOR_SEED, wave)).toEqual(composeWave(DIRECTOR_SEED, wave));
    }
  });

  test("composing other waves in between does not move a wave, so there is no hidden cursor", () => {
    const before = composeWave(DIRECTOR_SEED, 9);
    composeWave(DIRECTOR_SEED, 7);
    composeWave(99, 8);
    composeWaves(DIRECTOR_SEED, TOTAL_WAVES);
    expect(composeWave(DIRECTOR_SEED, 9)).toEqual(before);
  });

  test("a different seed fields a different act", () => {
    const mine = composeWaves(DIRECTOR_SEED, TOTAL_WAVES);
    const other = composeWaves(DIRECTOR_SEED + 1, TOTAL_WAVES);
    expect(mine).not.toEqual(other);
  });

  test("the run definition holds exactly the composed band", () => {
    expect(ENCOUNTER.waves).toHaveLength(TOTAL_WAVES);
    expect(composedWaves()).toEqual(composeWaves(DIRECTOR_SEED, TOTAL_WAVES));
    expect(COMPOSE_FROM_WAVE).toBeGreaterThan(1);
  });
});

describe("what a composed wave is made of", () => {
  test("every composed wave is readable: a label, a duration and more than one group", () => {
    for (const wave of composedWaves()) {
      expect(wave.label?.length ?? 0).toBeGreaterThan(0);
      expect(wave.durationSeconds ?? 0).toBeGreaterThanOrEqual(20);
      expect(wave.groups.length).toBeGreaterThan(1);
    }
  });

  test("every group names a unit the catalog knows and a positive count", () => {
    for (const wave of composedWaves()) {
      for (const group of wave.groups) {
        expect(CREEP_CATALOG[group.unit]).toBeDefined();
        expect(group.count ?? 1).toBeGreaterThan(0);
        expect(group.entry.length).toBeGreaterThan(0);
      }
    }
  });

  test("composed waves call named elites, and each name is the unit that carries it", () => {
    const named = new Set(ELITE_ROSTER.map((elite) => elite.unit));
    const seen = new Set<string>();
    for (const wave of composedWaves()) {
      for (const group of wave.groups) {
        if (!named.has(group.unit)) continue;
        seen.add(group.unit);
        const roster = ELITE_ROSTER.find((elite) => elite.unit === group.unit)!;
        expect(CREEP_CATALOG[group.unit]?.title).toBe(roster.name);
        expect(group.count).toBe(1);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  test("a boss lands every fourth wave from the composed band, and nowhere else", () => {
    const bossWaves = composedWaves()
      .map((wave, index) => ({ wave, number: index + COMPOSE_FROM_WAVE }))
      .filter(({ wave }) => wave.groups.some((group) => bossProfile(group.unit) !== null));
    const expected = [];
    for (let wave = COMPOSE_FROM_WAVE; wave <= TOTAL_WAVES; wave += 1) {
      const boss = bossForWave(wave);
      if (boss !== null) expected.push({ number: wave, boss });
    }
    expect(expected.length).toBeGreaterThanOrEqual(2);
    expect(bossWaves.map(({ number }) => number)).toEqual(expected.map(({ number }) => number));
    for (const [index, entry] of expected.entries()) {
      const groups = bossWaves[index]!.wave.groups.filter((group) => bossProfile(group.unit) !== null);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.unit).toBe(entry.boss);
      expect(entry.number % BOSS_EVERY_WAVES).toBe(0);
    }
    expect(new Set(expected.map(({ boss }) => boss))).toEqual(new Set(BOSS_ORDER));
  });

  test("counts stay inside the density the field can read", () => {
    for (const wave of composedWaves()) {
      const total = wave.groups.reduce((sum, group) => sum + (group.count ?? 1), 0);
      expect(total).toBeLessThanOrEqual(28);
    }
  });

  test("the patterns are authored data, and each names itself", () => {
    expect(SQUAD_PATTERNS.length).toBeGreaterThanOrEqual(3);
    for (const pattern of SQUAD_PATTERNS) {
      expect(pattern.label.length).toBeGreaterThan(0);
      expect(pattern.weight).toBeGreaterThan(0);
    }
  });
});
