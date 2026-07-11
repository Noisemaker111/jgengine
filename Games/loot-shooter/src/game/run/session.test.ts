import { describe, expect, test } from "bun:test";
import { enemyById } from "../entities/enemies/catalog";
import { WAVE_COUNT } from "../waves/manifest";
import { SPAWN_RING, accuracyPercent, endlessManifest } from "./session";

describe("endless manifests", () => {
  test("budget escalates wave over wave", () => {
    const first = endlessManifest(WAVE_COUNT + 1);
    const later = endlessManifest(WAVE_COUNT + 6);
    expect(later.budget).toBeGreaterThan(first.budget);
  });

  test("entries resolve to real enemies", () => {
    for (const wave of [11, 12, 15, 20, 30]) {
      for (const entry of endlessManifest(wave).entries) {
        expect(enemyById(entry.id)).toBeDefined();
        expect(entry.cost).toBeGreaterThan(0);
      }
    }
  });

  test("a boss joins every fifth endless wave", () => {
    expect(endlessManifest(15).entries.some((entry) => entry.id === "boss_warden")).toBe(true);
    expect(endlessManifest(16).entries.some((entry) => entry.id === "boss_warden")).toBe(false);
  });
});

describe("run math", () => {
  test("accuracy is a rounded percentage", () => {
    expect(
      accuracyPercent({
        status: "wave",
        wave: 1,
        waveTotal: 10,
        endless: false,
        alive: 0,
        intermissionLeft: 0,
        kills: 0,
        score: 0,
        shotsFired: 3,
        shotsHit: 2,
        elapsed: 0,
      }),
    ).toBe(67);
  });

  test("spawn ring circles the arena", () => {
    expect(SPAWN_RING.length).toBe(12);
    for (const [x, z] of SPAWN_RING) {
      expect(Math.hypot(x, z)).toBeCloseTo(30, 5);
    }
  });
});
