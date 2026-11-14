import { describe, expect, test } from "bun:test";

import { CREEP_CATALOG } from "../entities/enemies/catalog";
import {
  BOSS_WAVES,
  COMPOSE_FROM_WAVE,
  COMPOSE_TO_WAVE,
  SQUAD_PATTERNS,
  bossForWave,
  composeWave,
  composeWaves,
} from "./composer";
import { DIRECTOR_SEED, ENCOUNTER, TOTAL_WAVES, bossProfile } from "./manifest";

const composedWaves = () => ENCOUNTER.waves.slice(COMPOSE_FROM_WAVE - 1, COMPOSE_TO_WAVE);

describe("the seeded wave composer", () => {
  test("the same seed and wave always compose the same wave", () => {
    for (let wave = COMPOSE_FROM_WAVE; wave <= COMPOSE_TO_WAVE; wave += 1) {
      expect(composeWave(DIRECTOR_SEED, wave)).toEqual(composeWave(DIRECTOR_SEED, wave));
    }
  });

  test("composing other waves in between does not move a wave, so there is no hidden cursor", () => {
    const before = composeWave(DIRECTOR_SEED, 9);
    composeWave(DIRECTOR_SEED, 7);
    composeWave(99, 8);
    composeWaves(DIRECTOR_SEED, COMPOSE_TO_WAVE);
    expect(composeWave(DIRECTOR_SEED, 9)).toEqual(before);
  });

  test("a different seed fields a different act", () => {
    const mine = composeWaves(DIRECTOR_SEED, COMPOSE_TO_WAVE);
    const other = composeWaves(DIRECTOR_SEED + 1, COMPOSE_TO_WAVE);
    expect(mine).not.toEqual(other);
  });

  test("the run definition holds exactly the composed band, with the authored finale after it", () => {
    expect(ENCOUNTER.waves).toHaveLength(TOTAL_WAVES);
    expect(composedWaves()).toEqual(composeWaves(DIRECTOR_SEED, COMPOSE_TO_WAVE));
    expect(COMPOSE_FROM_WAVE).toBeGreaterThan(1);
    expect(COMPOSE_TO_WAVE).toBe(TOTAL_WAVES - 1);
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

  test("composed waves field the late roster: graphics cards, rigs, cars, chatbots, routers", () => {
    const seen = new Set(composedWaves().flatMap((wave) => wave.groups.map((group) => group.unit)));
    for (const unit of ["tech_gpu", "tech_chatbot"]) expect(seen.has(unit)).toBe(true);
    const roster = new Set(SQUAD_PATTERNS.flatMap((pattern) => pattern.squads.map((squad) => squad.unit)));
    for (const unit of ["tech_gpu", "tech_rig", "tech_car", "tech_chatbot", "tech_router", "tech_flock"]) expect(roster.has(unit)).toBe(true);
  });

  test("the server rack returns only on its authored composed wave, and the composer never fields the final boss", () => {
    for (let wave = COMPOSE_FROM_WAVE; wave <= COMPOSE_TO_WAVE; wave += 1) {
      const bosses = composeWave(DIRECTOR_SEED, wave).groups.filter((group) => bossProfile(group.unit) !== null).map((group) => group.unit);
      expect(bosses).toEqual(BOSS_WAVES[wave] === undefined ? [] : [BOSS_WAVES[wave]!]);
      expect(bossForWave(wave)).toBe(BOSS_WAVES[wave] ?? null);
      expect(bosses).not.toContain("boss_datacenter");
    }
  });

  test("counts stay inside the density the field can read", () => {
    for (const wave of composedWaves()) {
      const total = wave.groups.reduce((sum, group) => sum + (group.count ?? 1), 0);
      expect(total).toBeLessThanOrEqual(44);
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
