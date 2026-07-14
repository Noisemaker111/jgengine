import { describe, expect, test } from "bun:test";

import { advanceHeat, createHeatState, type HeatConfig } from "./heatSystem";

const CONFIG: HeatConfig = {
  levels: [
    { level: 1, threshold: 100, pursuerBudget: 2 },
    { level: 2, threshold: 250, pursuerBudget: 4 },
  ],
  maxHeat: 500,
  decayPerSecond: 10,
  decayDelaySeconds: 2,
  standDownSeconds: 5,
  spawnRingRadius: [40, 60],
  seed: 7,
};

describe("heatSystem", () => {
  test("unwitnessed gains never raise heat", () => {
    let state = createHeatState(CONFIG);
    const step = advanceHeat(CONFIG, state, 1, [{ amount: 50, witnessed: false }], {
      nearWitness: false,
      activePursuers: 0,
      around: [0, 0],
    });
    expect(step.state.heat).toBe(0);
    expect(step.pursuerBudget).toBe(0);
  });

  test("witnessed gains raise heat and cross level thresholds", () => {
    let state = createHeatState(CONFIG);
    const step = advanceHeat(CONFIG, state, 1, [{ amount: 120, witnessed: true }], {
      nearWitness: false,
      activePursuers: 0,
      around: [0, 0],
    });
    expect(step.state.heat).toBe(120);
    expect(step.state.level).toBe(1);
    expect(step.levelChanged).toBe(true);
    expect(step.pursuerBudget).toBe(2);
    expect(step.wantSpawns).toBe(2);
    expect(step.spawnPoints).toHaveLength(2);
    for (const [x, z] of step.spawnPoints) {
      const distance = Math.hypot(x, z);
      expect(distance).toBeGreaterThanOrEqual(40);
      expect(distance).toBeLessThanOrEqual(60);
    }
  });

  test("decay is blocked near a witness even past the delay", () => {
    let state = createHeatState(CONFIG);
    state = advanceHeat(CONFIG, state, 1, [{ amount: 120, witnessed: true }], {
      nearWitness: false,
      activePursuers: 0,
      around: [0, 0],
    }).state;
    const held = advanceHeat(CONFIG, state, 5, [], { nearWitness: true, activePursuers: 2, around: [0, 0] });
    expect(held.state.heat).toBe(120);
  });

  test("decay resumes after the grace delay once clear of witnesses", () => {
    let state = createHeatState(CONFIG);
    state = advanceHeat(CONFIG, state, 1, [{ amount: 120, witnessed: true }], {
      nearWitness: false,
      activePursuers: 0,
      around: [0, 0],
    }).state;
    const step = advanceHeat(CONFIG, state, 3, [], { nearWitness: false, activePursuers: 0, around: [0, 0] });
    expect(step.state.heat).toBeLessThan(120);
  });

  test("stand-down fires after pursuers linger past the timer at level 0", () => {
    let state = createHeatState(CONFIG);
    state.heat = 0;
    state.level = 0;
    let step = advanceHeat(CONFIG, state, 4, [], { nearWitness: false, activePursuers: 3, around: [0, 0] });
    expect(step.standDown).toBe(false);
    step = advanceHeat(CONFIG, step.state, 2, [], { nearWitness: false, activePursuers: 3, around: [0, 0] });
    expect(step.standDown).toBe(true);
  });

  test("heat is clamped to maxHeat", () => {
    const state = createHeatState(CONFIG);
    const step = advanceHeat(CONFIG, state, 1, [{ amount: 10000, witnessed: true }], {
      nearWitness: false,
      activePursuers: 0,
      around: [0, 0],
    });
    expect(step.state.heat).toBe(500);
  });
});
