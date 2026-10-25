import { describe, expect, test } from "bun:test";
import { expandWave } from "@jgengine/core/ai/director/encounter";

import { DIRECTOR_SEED, ENCOUNTER, TOTAL_WAVES } from "./manifest";

describe("wave manifest", () => {
  test("declares the authored host with a boss wave last", () => {
    expect(TOTAL_WAVES).toBeGreaterThanOrEqual(3);
    expect(ENCOUNTER.waves[TOTAL_WAVES - 1]!.groups.some((group) => group.unit === "raider_warden")).toBe(true);
  });

  test("every wave names a unit, an entry and a positive count", () => {
    for (const wave of ENCOUNTER.waves) {
      expect(wave.groups.length).toBeGreaterThan(0);
      for (const group of wave.groups) {
        expect(group.unit.length).toBeGreaterThan(0);
        expect(group.entry.length).toBeGreaterThan(0);
        expect(group.count ?? 1).toBeGreaterThan(0);
      }
    }
  });

  test("nothing dumps at t=0: later groups walk on after the first", () => {
    const first = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, 2);
    const atZero = first.filter((order) => order.atSeconds === 0);
    const later = first.filter((order) => order.atSeconds > 0);
    expect(atZero.length).toBeGreaterThan(0);
    expect(later.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(12);
  });

  test("pressure can thicken a wave but never changes the authored units", () => {
    const wave = ENCOUNTER.waves[3]!;
    const plain = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, 3);
    const pressed = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, 3, { countBonus: 2, eliteSlots: 1 });
    const escalating = wave.groups.filter((group) => group.escalates === true).length;
    const authored = new Set(plain.map((order) => order.unit));
    for (const order of pressed) expect(authored.has(order.unit)).toBe(true);
    expect(pressed.length - plain.length).toBe(escalating * 2);
    expect(pressed.filter((order) => order.pressureAdded).length).toBe(escalating * 2);
  });
});
