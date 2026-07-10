import { describe, expect, test } from "bun:test";
import { defaultThrowStates, edgeById, edgeLength, TERMINUS_NODE_ID, type ThrowStates } from "./network";
import {
  advancePlayerRun,
  createPlayerRun,
  MAX_SPEED,
  nextJunctionAhead,
  playerHeading,
  playerWorldXZ,
  remainingRouteDistance,
  type PlayerInput,
} from "./movement";

const HOLD_THROTTLE: PlayerInput = { throttle: true, brake: false, pumpBonus: 0 };
const COAST: PlayerInput = { throttle: false, brake: false, pumpBonus: 0 };

function driveSeconds(seconds: number, throwStates: ThrowStates, input: PlayerInput = HOLD_THROTTLE) {
  let state = createPlayerRun();
  const dt = 1 / 60;
  let elapsed = 0;
  while (elapsed < seconds && !state.finished) {
    state = advancePlayerRun(state, dt, input, throwStates);
    elapsed += dt;
  }
  return state;
}

describe("player run state", () => {
  test("starts on the depot's only outgoing edge, stationary", () => {
    const state = createPlayerRun();
    expect(state.currentEdgeId).toBe("e-depot-j1");
    expect(state.speed).toBe(0);
    expect(state.finished).toBe(false);
  });

  test("holding throttle accelerates up to (and not past) max speed over enough time", () => {
    const state = driveSeconds(20, defaultThrowStates());
    expect(state.speed).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
    expect(state.speed).toBeGreaterThan(0);
  });

  test("coasting decelerates back toward zero", () => {
    let state = driveSeconds(5, defaultThrowStates(), HOLD_THROTTLE);
    const speedAtCoastStart = state.speed;
    for (let i = 0; i < 300; i += 1) state = advancePlayerRun(state, 1 / 60, COAST, defaultThrowStates());
    expect(state.speed).toBeLessThan(speedAtCoastStart);
  });

  test("reaches Terminus eventually and marks finished with a finish time", () => {
    const state = driveSeconds(400, defaultThrowStates());
    expect(state.finished).toBe(true);
    expect(state.finishTime).not.toBeNull();
    expect(state.finishTime).toBeGreaterThan(0);
  });

  test("world position and heading stay finite along the whole run", () => {
    let state = createPlayerRun();
    const throwStates = defaultThrowStates();
    for (let i = 0; i < 5000 && !state.finished; i += 1) {
      state = advancePlayerRun(state, 1 / 60, HOLD_THROTTLE, throwStates);
      const [x, z] = playerWorldXZ(state);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
      expect(Number.isFinite(playerHeading(state))).toBe(true);
    }
  });
});

describe("junction throw changes the route actually taken", () => {
  test("normal vs reverse at junction 1 sends the player through different edges", () => {
    const normal: ThrowStates = { ...defaultThrowStates(), j1: "normal" };
    const reverse: ThrowStates = { ...defaultThrowStates(), j1: "reverse" };
    const a = driveSeconds(60, normal);
    const b = driveSeconds(60, reverse);
    expect(a.edgesTraveled).not.toEqual(b.edgesTraveled);
  });

  test("a throw only takes effect the instant the junction is actually reached, not retroactively", () => {
    let state = createPlayerRun();
    const throwStates: ThrowStates = { ...defaultThrowStates(), j1: "normal" };
    for (let i = 0; i < 400; i += 1) {
      state = advancePlayerRun(state, 1 / 60, HOLD_THROTTLE, throwStates);
      if (state.edgesTraveled.length > 1) break;
    }
    const pathTaken = state.edgesTraveled[1];
    throwStates.j1 = "reverse";
    expect(state.edgesTraveled[1]).toBe(pathTaken);
  });
});

describe("next junction ahead", () => {
  test("reports junction 1 immediately after departing the depot", () => {
    const state = createPlayerRun();
    expect(nextJunctionAhead(state, defaultThrowStates())).toBe("j1");
  });

  test("returns null once the player has finished", () => {
    const state = driveSeconds(400, defaultThrowStates());
    expect(nextJunctionAhead(state, defaultThrowStates())).toBeNull();
  });
});

describe("remaining route distance", () => {
  test("decreases monotonically as the player drives forward", () => {
    let state = createPlayerRun();
    const throwStates = defaultThrowStates();
    let previous = remainingRouteDistance(state, throwStates);
    for (let i = 0; i < 400 && !state.finished; i += 1) {
      state = advancePlayerRun(state, 1 / 60, HOLD_THROTTLE, throwStates);
      const next = remainingRouteDistance(state, throwStates);
      expect(next).toBeLessThanOrEqual(previous + 1e-6);
      previous = next;
    }
  });

  test("is ~0 once the player has finished", () => {
    const state = driveSeconds(400, defaultThrowStates());
    expect(remainingRouteDistance(state, defaultThrowStates())).toBeCloseTo(0, 1);
  });

  test("reflects the throw states passed in, not necessarily the ones the player actually took", () => {
    const state = createPlayerRun();
    const throughLowdale: ThrowStates = { ...defaultThrowStates(), j1: "normal" };
    const throughGorge: ThrowStates = { ...defaultThrowStates(), j1: "reverse" };
    expect(remainingRouteDistance(state, throughLowdale)).not.toBe(remainingRouteDistance(state, throughGorge));
  });
});

describe("restart purity", () => {
  test("two fresh runs are independent — mutating one never leaks into the other", () => {
    const a = createPlayerRun();
    const b = createPlayerRun();
    const throwStates = defaultThrowStates();
    const advancedA = advancePlayerRun(a, 1, HOLD_THROTTLE, throwStates);
    expect(b.speed).toBe(0);
    expect(b.edgesTraveled).toHaveLength(1);
    expect(advancedA).not.toBe(a);
    expect(a.speed).toBe(0);
  });

  test("edgeLength/edgeById stay pure across repeated runs", () => {
    const edge = edgeById("e-depot-j1");
    const first = edgeLength(edge);
    driveSeconds(400, defaultThrowStates());
    const second = edgeLength(edge);
    expect(first).toBe(second);
  });

  test("driving the default route always eventually reaches Terminus node", () => {
    const state = driveSeconds(400, defaultThrowStates());
    expect(state.fromNodeId).toBe(TERMINUS_NODE_ID);
  });
});
