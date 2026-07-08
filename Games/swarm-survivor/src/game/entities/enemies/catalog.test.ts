import { describe, expect, test } from "bun:test";

import { advanceSpawnDirector, createSpawnDirectorState } from "@jgengine/core/ai/spawnDirector";

import { SPAWN_DIRECTOR_CONFIG, SWARMERS, swarmerDef } from "./catalog";

describe("swarm-survivor enemy catalog", () => {
  test("every wave entry references a real swarmer id", () => {
    const knownIds = new Set(SWARMERS.map((swarmer) => swarmer.id));
    for (const wave of SPAWN_DIRECTOR_CONFIG.waves) {
      for (const entry of wave.entries) {
        expect(knownIds.has(entry.id)).toBe(true);
      }
    }
  });

  test("swarmerDef resolves known ids and rejects unknown ones", () => {
    expect(swarmerDef("husk")?.health).toBe(32);
    expect(swarmerDef("does-not-exist")).toBeNull();
  });

  test("spawn director escalates pressure across a long run", () => {
    let state = createSpawnDirectorState(SPAWN_DIRECTOR_CONFIG);
    let alive = 0;
    let totalSpawned = 0;
    let earlySpawned = 0;
    for (let second = 0; second < 180; second += 1) {
      const step = advanceSpawnDirector(SPAWN_DIRECTOR_CONFIG, state, 1, { alive, players: 1 });
      state = step.state;
      alive += step.spawns.length;
      totalSpawned += step.spawns.length;
      if (second === 20) earlySpawned = totalSpawned;
    }
    expect(totalSpawned).toBeGreaterThan(earlySpawned);
    expect(alive).toBeLessThanOrEqual(SPAWN_DIRECTOR_CONFIG.maxAlive ?? Number.POSITIVE_INFINITY);
  });

  test("the warden is gated behind an early-wave minWave", () => {
    const firstWardenEntry = SPAWN_DIRECTOR_CONFIG.waves
      .flatMap((wave) => wave.entries)
      .find((entry) => entry.id === "warden");
    expect(firstWardenEntry?.minWave).toBeGreaterThan(0);
  });
});
