import { describe, expect, test } from "bun:test";
import type { FanState } from "../flight/fanSchedule";
import { advancePacer, choosePacerFork, initPacer } from "./pacer";
import { CANYON_C_FAN_IDS, SPAWN_HEADING, SPAWN_POSITION } from "./route";

function fanState(power: number, direction: 1 | -1 = 1): FanState {
  return { power, stage: power > 0 ? "on" : "off", direction, secondsToNextStage: 5, cycleSeconds: 30 };
}

describe("choosePacerFork", () => {
  test("picks the canyon when its fans are spooled up", () => {
    const states = new Map(CANYON_C_FAN_IDS.map((id) => [id, fanState(0.9)]));
    expect(choosePacerFork(states)).toBe("canyon");
  });

  test("picks the connector when the canyon fans are dying", () => {
    const states = new Map(CANYON_C_FAN_IDS.map((id) => [id, fanState(0.1)]));
    expect(choosePacerFork(states)).toBe("connector");
  });
});

describe("advancePacer", () => {
  const lookup = () => ({ power: 1, direction: 1 as const });
  const fanStates = new Map(CANYON_C_FAN_IDS.map((id) => [id, fanState(1)]));

  test("moves the pacer toward its next waypoint over time", () => {
    let runtime = initPacer(SPAWN_POSITION, SPAWN_HEADING);
    const start = runtime.glider.position;
    for (let i = 0; i < 60; i += 1) {
      const advance = advancePacer(runtime, 0.1, i * 0.1, lookup, fanStates, [0, 0]);
      runtime = advance.runtime;
    }
    const dx = runtime.glider.position[0] - start[0];
    const dz = runtime.glider.position[2] - start[2];
    expect(Math.hypot(dx, dz)).toBeGreaterThan(5);
  });

  test("waypoint progress is monotonic non-decreasing until it wraps a lap", () => {
    let runtime = initPacer(SPAWN_POSITION, SPAWN_HEADING);
    let previousIndex = runtime.waypointIndex;
    let wrapped = false;
    for (let i = 0; i < 4000; i += 1) {
      const advance = advancePacer(runtime, 0.1, i * 0.1, lookup, fanStates, [0, 0]);
      runtime = advance.runtime;
      if (runtime.waypointIndex < previousIndex) wrapped = true;
      else expect(runtime.waypointIndex).toBeGreaterThanOrEqual(previousIndex);
      previousIndex = runtime.waypointIndex;
    }
    expect(wrapped).toBe(true);
  });

  test("advancePacer is deterministic given identical inputs", () => {
    const runtime = initPacer(SPAWN_POSITION, SPAWN_HEADING);
    const a = advancePacer(runtime, 0.1, 5, lookup, fanStates, [0, 0]);
    const b = advancePacer(runtime, 0.1, 5, lookup, fanStates, [0, 0]);
    expect(a.position).toEqual(b.position);
    expect(a.runtime.waypointIndex).toBe(b.runtime.waypointIndex);
  });
});
