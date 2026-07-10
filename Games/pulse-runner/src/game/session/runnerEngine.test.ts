import { describe, expect, test } from "bun:test";

import type { Movement } from "../course/course";
import { RESONANCE_STREAK_THRESHOLD } from "../rules/rhythm";
import { createRunnerEngine, laneWorldX } from "./runnerEngine";

function movement(overrides: Partial<Movement>): Movement {
  return {
    id: "test-movement",
    title: "Test Movement",
    bpm: 60,
    beatsPerBar: 4,
    totalBeats: 400,
    unitsPerBeat: 1,
    obstacles: [],
    ...overrides,
  };
}

function tickMany(engine: ReturnType<typeof createRunnerEngine>, dt: number, count: number): void {
  for (let i = 0; i < count; i += 1) engine.tick(dt);
}

describe("runner engine — starting and idle", () => {
  test("boots idle and enters play on the first stride", () => {
    const engine = createRunnerEngine([movement({})]);
    expect(engine.snapshot().phase).toBe("idle");
    engine.tapStride();
    expect(engine.snapshot().phase).toBe("playing");
  });
});

describe("runner engine — obstacle collisions", () => {
  test("a blocked lane at the obstacle's beat drains pulse", () => {
    const movements = [
      movement({ obstacles: [{ id: "o1", type: "gap", beatIndex: 6, blockedLanes: [1] }], totalBeats: 400 }),
    ];
    const engine = createRunnerEngine(movements);
    engine.start();
    expect(engine.snapshot().laneIndex).toBe(1);
    tickMany(engine, 0.05, 400);
    expect(engine.snapshot().pulse).toBeLessThan(1);
  });

  test("switching out of the blocked lane avoids the penalty", () => {
    const movements = [
      movement({ obstacles: [{ id: "o1", type: "gap", beatIndex: 6, blockedLanes: [1] }], totalBeats: 400 }),
    ];
    const engine = createRunnerEngine(movements);
    engine.start();
    engine.setLane(-1);
    tickMany(engine, 0.05, 400);
    expect(engine.snapshot().pulse).toBe(1);
  });
});

describe("runner engine — resonance parts obstacles", () => {
  test("a long perfect streak grants resonance and forgives the next obstacle", () => {
    const movements = [
      movement({ obstacles: [{ id: "o1", type: "gap", beatIndex: 20, blockedLanes: [1] }], totalBeats: 400 }),
    ];
    const engine = createRunnerEngine(movements);
    engine.start();
    for (let i = 0; i < RESONANCE_STREAK_THRESHOLD; i += 1) {
      engine.tick(1);
      const judgement = engine.tapStride();
      expect(judgement).toBe("perfect");
    }
    expect(engine.snapshot().resonance).toBe(true);
    tickMany(engine, 0.1, 400);
    expect(engine.snapshot().pulse).toBeGreaterThan(0.9);
  });
});

describe("runner engine — movement sequencing and checkpoints", () => {
  test("clearing a movement advances to the next with a fresh checkpoint", () => {
    const movements = [
      movement({ id: "m1", title: "Movement One", bpm: 120, totalBeats: 4, unitsPerBeat: 1 }),
      movement({ id: "m2", title: "Movement Two", bpm: 150, totalBeats: 40, unitsPerBeat: 1 }),
    ];
    const engine = createRunnerEngine(movements);
    engine.start();
    tickMany(engine, 0.05, 100);
    const snapshot = engine.snapshot();
    expect(snapshot.movementIndex).toBe(1);
    expect(snapshot.movement.id).toBe("m2");
    expect(snapshot.checkpoints[0]!.cleared).toBe(true);
    expect(snapshot.checkpoints[1]!.cleared).toBe(false);
    expect(snapshot.results).toHaveLength(1);
  });

  test("clearing the final movement wins the run", () => {
    const movements = [
      movement({ id: "m1", title: "Movement One", bpm: 120, totalBeats: 3, unitsPerBeat: 1 }),
      movement({ id: "m2", title: "Movement Two", bpm: 120, totalBeats: 3, unitsPerBeat: 1 }),
    ];
    const engine = createRunnerEngine(movements);
    engine.start();
    tickMany(engine, 0.05, 800);
    const snapshot = engine.snapshot();
    expect(snapshot.phase).toBe("won");
    expect(snapshot.results).toHaveLength(2);
  });
});

describe("runner engine — defeat", () => {
  test("three zero-strikes end the run", () => {
    const engine = createRunnerEngine([movement({})]);
    engine.start();
    engine.tick(0.3);
    for (let i = 0; i < 15; i += 1) engine.tapStride();
    const snapshot = engine.snapshot();
    expect(snapshot.phase).toBe("lost");
    expect(snapshot.strikes).toBe(3);
    expect(snapshot.defeatedAt).toBe("Test Movement");
  });
});

describe("runner engine — restart purity", () => {
  test("restart fully resets state to match a freshly started engine", () => {
    const movements = [movement({ obstacles: [{ id: "o1", type: "gap", beatIndex: 4, blockedLanes: [1] }] })];
    const dirty = createRunnerEngine(movements);
    dirty.start();
    dirty.setLane(1);
    dirty.lean();
    tickMany(dirty, 0.1, 50);
    dirty.tapStride();
    dirty.drainEvents();
    dirty.restart();

    const fresh = createRunnerEngine(movements);
    fresh.start();

    expect(dirty.snapshot()).toEqual(fresh.snapshot());
    expect(dirty.drainEvents()).toEqual(fresh.drainEvents());
  });
});

describe("lane math", () => {
  test("lane 1 is the causeway centerline", () => {
    expect(laneWorldX(1)).toBe(0);
    expect(laneWorldX(0)).toBeLessThan(0);
    expect(laneWorldX(2)).toBeGreaterThan(0);
  });
});
