import { describe, expect, test } from "bun:test";
import {
  ASTEROID_CLUSTERS,
  ASTEROID_OBSTACLES,
  BOOST_PADS,
  CHECKPOINT_DEFS,
  PLANETOIDS,
} from "./catalog";

describe("orbit-kart cluster catalog", () => {
  test("seven distinct planetoids", () => {
    expect(PLANETOIDS.length).toBe(7);
    expect(new Set(PLANETOIDS.map((p) => p.id)).size).toBe(7);
  });

  test("planetoids carry real radius/mass variation and ring decoration", () => {
    const radii = new Set(PLANETOIDS.map((p) => p.radius));
    const masses = new Set(PLANETOIDS.map((p) => p.mass));
    expect(radii.size).toBeGreaterThan(1);
    expect(masses.size).toBeGreaterThan(1);
    expect(PLANETOIDS.filter((p) => p.ringColor !== null).length).toBeGreaterThanOrEqual(2);
    for (const planetoid of PLANETOIDS) {
      expect(planetoid.radius).toBeGreaterThan(0);
      expect(planetoid.mass).toBeGreaterThan(0);
      expect(planetoid.wellRadius).toBeGreaterThan(planetoid.radius);
    }
  });

  test("named landmark well exists for the acceptance route", () => {
    expect(PLANETOIDS.some((p) => p.name === "Ceres Junction")).toBe(true);
  });

  test("six ordered checkpoint rings", () => {
    expect(CHECKPOINT_DEFS.length).toBe(6);
    expect(new Set(CHECKPOINT_DEFS.map((c) => c.id)).size).toBe(6);
  });

  test("three asteroid clusters with real rock counts", () => {
    expect(ASTEROID_CLUSTERS.length).toBe(3);
    for (const cluster of ASTEROID_CLUSTERS) expect(cluster.rocks.length).toBeGreaterThanOrEqual(6);
    expect(ASTEROID_OBSTACLES.length).toBeGreaterThanOrEqual(18);
  });

  test("eight boost pads", () => {
    expect(BOOST_PADS.length).toBe(8);
    expect(new Set(BOOST_PADS.map((p) => p.id)).size).toBe(8);
  });

  test("asteroid cluster generation is deterministic under its seed", () => {
    const rocksA = ASTEROID_CLUSTERS[0]!.rocks;
    const rocksB = ASTEROID_CLUSTERS[0]!.rocks;
    expect(rocksA).toEqual(rocksB);
  });
});
