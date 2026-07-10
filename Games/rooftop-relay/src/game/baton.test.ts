import { describe, expect, test } from "bun:test";

import { classifyHandoff, handoffTimeDeltaSeconds, INITIAL_BATON_STATE, tickBaton } from "./baton";
import { SPRINT_PACE_SPEED, TARGET_PACE_SPEED } from "./tuning";

describe("baton pace math", () => {
  test("sustained full sprint builds a pace streak and eventually shaves time", () => {
    let state = INITIAL_BATON_STATE;
    let totalDelta = 0;
    let shaved = false;
    for (let i = 0; i < 40; i += 1) {
      const result = tickBaton(state, SPRINT_PACE_SPEED + 1, 0.1);
      state = result.state;
      totalDelta += result.timeDeltaSeconds;
      if (result.streakShaved) shaved = true;
    }
    expect(shaved).toBe(true);
    expect(totalDelta).toBeLessThan(0);
    expect(state.bonusSeconds).toBeGreaterThan(0);
  });

  test("hesitating below target pace past the grace window ticks up a cold-baton penalty", () => {
    let state = INITIAL_BATON_STATE;
    let totalDelta = 0;
    for (let i = 0; i < 40; i += 1) {
      const result = tickBaton(state, TARGET_PACE_SPEED - 2, 0.1);
      state = result.state;
      totalDelta += result.timeDeltaSeconds;
    }
    expect(totalDelta).toBeGreaterThan(0);
    expect(state.penaltySeconds).toBeGreaterThan(0);
  });

  test("brief hesitation inside the grace window costs nothing", () => {
    let state = INITIAL_BATON_STATE;
    const result = tickBaton(state, 0, 1);
    state = result.state;
    expect(state.penaltySeconds).toBe(0);
  });

  test("cruising between target and sprint pace is neutral and resets streak/cold", () => {
    const midPace = (TARGET_PACE_SPEED + SPRINT_PACE_SPEED) / 2;
    const primed = { paceStreakSeconds: 2, coldSeconds: 2, bonusSeconds: 0, penaltySeconds: 0 };
    const result = tickBaton(primed, midPace, 0.5);
    expect(result.timeDeltaSeconds).toBe(0);
    expect(result.state.paceStreakSeconds).toBe(0);
    expect(result.state.coldSeconds).toBe(0);
  });

  test("handoff classification: sprinting into the zone is a clean snap, walking is a fumble", () => {
    const sprintingState = { paceStreakSeconds: 1.5, coldSeconds: 0, bonusSeconds: 0, penaltySeconds: 0 };
    expect(classifyHandoff(sprintingState, SPRINT_PACE_SPEED + 1)).toBe("clean");
    expect(handoffTimeDeltaSeconds("clean")).toBeLessThan(0);

    const walkingState = { paceStreakSeconds: 0, coldSeconds: 3, bonusSeconds: 0, penaltySeconds: 0 };
    expect(classifyHandoff(walkingState, 1)).toBe("fumble");
    expect(handoffTimeDeltaSeconds("fumble")).toBeGreaterThan(0);
  });
});
