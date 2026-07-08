import { describe, expect, test } from "bun:test";
import {
  advanceSpawnDirector,
  advanceWave,
  createSpawnDirectorState,
  pickSpawnPoint,
  raiseAlert,
  type SpawnDirectorConfig,
} from "@jgengine/core/ai/spawnDirector";

const grunt = { id: "grunt", cost: 1 };

function drain(config: SpawnDirectorConfig, seconds: number, step = 0.5, alive = () => 0) {
  let state = createSpawnDirectorState(config);
  const spawns: string[] = [];
  for (let t = 0; t < seconds; t += step) {
    const result = advanceSpawnDirector(config, state, step, { alive: alive() });
    state = result.state;
    for (const s of result.spawns) spawns.push(s.entryId);
  }
  return { state, spawns };
}

describe("spawnDirector budget", () => {
  test("wave budget is granted up front and spent on affordable entries", () => {
    const config: SpawnDirectorConfig = { waves: [{ budget: 5, entries: [grunt] }] };
    const state = createSpawnDirectorState(config);
    expect(state.budget).toBe(5);
    const { spawns } = advanceSpawnDirector(config, state, 0.1, { alive: 0 });
    expect(spawns).toHaveLength(5);
    expect(spawns.every((s) => s.entryId === "grunt")).toBe(true);
  });

  test("maxAlive caps concurrent spawns", () => {
    const config: SpawnDirectorConfig = { waves: [{ budget: 100, entries: [grunt] }], maxAlive: 3 };
    const state = createSpawnDirectorState(config);
    const { spawns } = advanceSpawnDirector(config, state, 0.1, { alive: 0 });
    expect(spawns).toHaveLength(3);
  });

  test("does not spawn when the live count already meets the cap", () => {
    const config: SpawnDirectorConfig = { waves: [{ budget: 100, entries: [grunt] }], maxAlive: 3 };
    const state = createSpawnDirectorState(config);
    const { spawns } = advanceSpawnDirector(config, state, 0.1, { alive: 3 });
    expect(spawns).toHaveLength(0);
  });

  test("nothing affordable leaves budget untouched", () => {
    const config: SpawnDirectorConfig = { waves: [{ budget: 3, entries: [{ id: "tank", cost: 10 }] }] };
    const result = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.1, { alive: 0 });
    expect(result.spawns).toHaveLength(0);
    expect(result.state.budget).toBeCloseTo(3);
  });
});

describe("spawnDirector escalation", () => {
  test("escalation accrues budget that grows with sim-time", () => {
    const config: SpawnDirectorConfig = {
      waves: [{ budget: 0, entries: [{ id: "grunt", cost: 1000 }] }],
      escalationPerSecond: 1,
    };
    let state = createSpawnDirectorState(config);
    state = advanceSpawnDirector(config, state, 1, { alive: 0 }).state;
    const early = state.budget;
    for (let i = 0; i < 10; i += 1) state = advanceSpawnDirector(config, state, 1, { alive: 0 }).state;
    const perSecondLate = advanceSpawnDirector(config, state, 1, { alive: 0 }).state.budget - state.budget;
    expect(perSecondLate).toBeGreaterThan(early);
  });

  test("alert raises the spawn budget then decays", () => {
    const config: SpawnDirectorConfig = {
      waves: [{ budget: 0, entries: [grunt] }],
      alertBudgetPerSecond: 10,
      alertDecayPerSecond: 0.5,
    };
    let state = raiseAlert(createSpawnDirectorState(config), 1);
    expect(state.alert).toBe(1);
    const result = advanceSpawnDirector(config, state, 1, { alive: 0 });
    expect(result.spawns.length).toBeGreaterThan(0);
    expect(result.state.alert).toBeCloseTo(0.5);
  });

  test("per-player budget scales with the player count", () => {
    const config: SpawnDirectorConfig = {
      waves: [{ budget: 0, entries: [grunt] }],
      playerBudgetPerSecond: 2,
    };
    const solo = advanceSpawnDirector(config, createSpawnDirectorState(config), 1, { alive: 0, players: 1 });
    const squad = advanceSpawnDirector(config, createSpawnDirectorState(config), 1, { alive: 0, players: 4 });
    expect(squad.spawns.length).toBeGreaterThan(solo.spawns.length);
  });
});

describe("spawnDirector waves", () => {
  test("duration auto-advances waves and grants the next budget", () => {
    const config: SpawnDirectorConfig = {
      waves: [
        { budget: 1, duration: 2, entries: [grunt] },
        { budget: 9, entries: [{ id: "brute", cost: 3 }] },
      ],
    };
    const { state, spawns } = drain(config, 3, 0.5);
    expect(state.wave).toBe(1);
    expect(spawns).toContain("grunt");
    expect(spawns).toContain("brute");
  });

  test("manual advanceWave marks done past the last non-looping wave", () => {
    const config: SpawnDirectorConfig = { waves: [{ budget: 1, entries: [grunt] }] };
    const done = advanceWave(config, createSpawnDirectorState(config));
    expect(done.done).toBe(true);
    expect(advanceSpawnDirector(config, done, 1, { alive: 0 }).spawns).toHaveLength(0);
  });

  test("looping wraps back to the first wave", () => {
    const config: SpawnDirectorConfig = { waves: [{ budget: 1, entries: [grunt] }], loop: true };
    const wrapped = advanceWave(config, createSpawnDirectorState(config));
    expect(wrapped.wave).toBe(0);
    expect(wrapped.done).toBe(false);
  });

  test("minWave gates entries until their wave", () => {
    const config: SpawnDirectorConfig = {
      waves: [
        { budget: 10, duration: 1, entries: [grunt, { id: "boss", cost: 5, minWave: 1 }] },
        { budget: 5, entries: [{ id: "boss", cost: 5, minWave: 1 }] },
      ],
    };
    const wave0 = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.5, { alive: 0 });
    expect(wave0.spawns.some((s) => s.entryId === "boss")).toBe(false);
    const { spawns } = drain(config, 2, 0.5);
    expect(spawns).toContain("boss");
  });

  test("advance is deterministic under a fixed seed", () => {
    const config: SpawnDirectorConfig = {
      waves: [{ budget: 6, entries: [{ id: "a", cost: 1, weight: 1 }, { id: "b", cost: 1, weight: 1 }] }],
      seed: 42,
    };
    const a = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.1, { alive: 0 }).spawns;
    const b = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.1, { alive: 0 }).spawns;
    expect(a).toEqual(b);
  });
});

describe("spawnDirector spawn points", () => {
  test("stamps a resolved point and laneId onto each spawn when spawnPoints are configured", () => {
    const config: SpawnDirectorConfig = {
      waves: [{ budget: 5, entries: [grunt] }],
      spawnPoints: [
        [0, 0],
        [50, 0],
      ],
    };
    const { spawns } = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.1, { alive: 0 });
    expect(spawns).toHaveLength(5);
    for (const spawn of spawns) {
      expect(spawn.point).toBeDefined();
      expect(spawn.laneId).toBeGreaterThanOrEqual(0);
      expect(config.spawnPoints).toContainEqual(spawn.point);
    }
  });

  test("leaves point and laneId unset when no spawnPoints are configured", () => {
    const config: SpawnDirectorConfig = { waves: [{ budget: 5, entries: [grunt] }] };
    const { spawns } = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.1, { alive: 0 });
    expect(spawns).toHaveLength(5);
    for (const spawn of spawns) {
      expect(spawn.point).toBeUndefined();
      expect(spawn.laneId).toBeUndefined();
    }
  });

  test("spawnPointBias combined with playerPositions favours far lanes from players", () => {
    const config: SpawnDirectorConfig = {
      waves: [{ budget: 20, entries: [grunt] }],
      spawnPoints: [
        [0, 0],
        [50, 0],
      ],
      spawnPointBias: -4,
      seed: 7,
    };
    const { spawns } = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.1, {
      alive: 0,
      playerPositions: [[0, 0]],
    });
    const far = spawns.filter((s) => s.point?.[0] === 50).length;
    expect(far).toBeGreaterThan(spawns.length / 2);
  });

  test("spawn point assignment stays deterministic under a fixed seed", () => {
    const config: SpawnDirectorConfig = {
      waves: [{ budget: 5, entries: [grunt] }],
      spawnPoints: [
        [0, 0],
        [50, 0],
      ],
      seed: 42,
    };
    const a = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.1, { alive: 0 }).spawns;
    const b = advanceSpawnDirector(config, createSpawnDirectorState(config), 0.1, { alive: 0 }).spawns;
    expect(a).toEqual(b);
  });
});

describe("pickSpawnPoint", () => {
  const points = [
    [0, 0],
    [50, 0],
  ] as const;
  const players = [[0, 0]] as const;

  test("positive bias favours points near players", () => {
    let near = 0;
    for (let roll = 0; roll < 1; roll += 0.05) {
      const point = pickSpawnPoint([...points], [...players], { roll, bias: 4 });
      if (point && point[0] === 0) near += 1;
    }
    expect(near).toBeGreaterThan(10);
  });

  test("negative bias favours points far from players", () => {
    let far = 0;
    for (let roll = 0; roll < 1; roll += 0.05) {
      const point = pickSpawnPoint([...points], [...players], { roll, bias: -4 });
      if (point && point[0] === 50) far += 1;
    }
    expect(far).toBeGreaterThan(10);
  });

  test("returns null with no candidate points", () => {
    expect(pickSpawnPoint([], [...players], { roll: 0.5 })).toBeNull();
  });
});
