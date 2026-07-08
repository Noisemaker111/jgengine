import { describe, expect, test } from "bun:test";
import { advanceSpawnDirector, createSpawnDirectorState } from "@jgengine/core/ai/spawnDirector";

import { SPAWN_DIRECTOR_CONFIG, TOTAL_WAVES } from "./manifest";

describe("wave manifest", () => {
  test("declares at least three waves with escalating budget-per-second", () => {
    expect(TOTAL_WAVES).toBeGreaterThanOrEqual(3);
    const rates = SPAWN_DIRECTOR_CONFIG.waves.map((wave) => wave.budgetPerSecond ?? 0);
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
  });

  test("the brute only appears from its minWave onward", () => {
    const firstWave = SPAWN_DIRECTOR_CONFIG.waves[0]!;
    expect(firstWave.entries.some((entry) => entry.id === "raider_brute")).toBe(false);
  });

  test("spawns trickle in over the first wave rather than dumping instantly", () => {
    let state = createSpawnDirectorState(SPAWN_DIRECTOR_CONFIG);
    let totalSpawned = 0;
    let firstTickSpawned = 0;
    for (let tick = 0; tick < 300; tick += 1) {
      const step = advanceSpawnDirector(SPAWN_DIRECTOR_CONFIG, state, 1 / 60, { alive: 0, players: 1 });
      state = step.state;
      totalSpawned += step.spawns.length;
      if (tick === 0) firstTickSpawned = step.spawns.length;
    }
    expect(firstTickSpawned).toBe(0);
    expect(totalSpawned).toBeGreaterThan(0);
    expect(totalSpawned).toBeLessThan(40);
  });

  test("the director finishes after the last wave's duration with no loop", () => {
    let state = createSpawnDirectorState(SPAWN_DIRECTOR_CONFIG);
    const totalDuration = SPAWN_DIRECTOR_CONFIG.waves.reduce((sum, wave) => sum + (wave.duration ?? 0), 0);
    for (let elapsed = 0; elapsed < totalDuration + 1; elapsed += 0.5) {
      const step = advanceSpawnDirector(SPAWN_DIRECTOR_CONFIG, state, 0.5, { alive: 0, players: 1 });
      state = step.state;
    }
    expect(state.done).toBe(true);
    expect(state.wave).toBe(SPAWN_DIRECTOR_CONFIG.waves.length - 1);
  });
});
