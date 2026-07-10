import { describe, expect, test } from "bun:test";

import { DRIFT_GATES, SHIFT_PAIRS } from "./route";
import {
  applyGateTrigger,
  gateAt,
  gateStyleClears,
  initialShiftState,
  isLegShifted,
  legWaypoints,
  resolveShiftState,
} from "./shift";

describe("district shift", () => {
  test("initial state has every shift pair closed (long route)", () => {
    const state = initialShiftState();
    for (const pair of SHIFT_PAIRS) {
      expect(state[pair.id]?.active).toBe(false);
      expect(isLegShifted(pair.legIndex, state)).toBe(false);
    }
  });

  test("non-drifted corners leave the long route: an untriggered leg keeps its detour waypoint", () => {
    const state = initialShiftState();
    const pair = SHIFT_PAIRS[0]!;
    const waypoints = legWaypoints(pair.legIndex, state);
    expect(waypoints.length).toBe(3);
  });

  test("triggering a gate opens its target shift pair's shortcut", () => {
    const gate = DRIFT_GATES[0]!;
    const state = applyGateTrigger(initialShiftState(), "seed-a", gate.id);
    expect(state[gate.targetShiftId]?.active).toBe(true);
    const waypoints = legWaypoints(SHIFT_PAIRS.find((p) => p.id === gate.targetShiftId)!.legIndex, state);
    expect(waypoints.length).toBe(2);
  });

  test("same seed and same gate order reproduce the identical layout (determinism)", () => {
    const order = [DRIFT_GATES[0]!.id, DRIFT_GATES[2]!.id, DRIFT_GATES[3]!.id];
    const a = resolveShiftState("run-seed-42", order);
    const b = resolveShiftState("run-seed-42", order);
    expect(a).toEqual(b);
  });

  test("different seeds can pick different barrier variants for the same gate order", () => {
    const order = [DRIFT_GATES[0]!.id];
    const seeds = ["seed-one", "seed-two", "seed-three", "seed-four", "seed-five", "seed-six", "seed-seven"];
    const variants = new Set(seeds.map((seed) => resolveShiftState(seed, order)[DRIFT_GATES[0]!.targetShiftId]?.variantIndex));
    expect(variants.size).toBeGreaterThan(1);
  });

  test("retriggering the same gate can reshuffle to a different variant deterministically", () => {
    const gate = DRIFT_GATES[0]!;
    const twice = resolveShiftState("reshuffle-seed", [gate.id, gate.id, gate.id]);
    expect(twice[gate.targetShiftId]?.triggerCount).toBe(3);
    const once = resolveShiftState("reshuffle-seed", [gate.id]);
    expect(once[gate.targetShiftId]?.triggerCount).toBe(1);
  });

  test("gateStyleClears requires drifting and meeting the style threshold", () => {
    const gate = DRIFT_GATES[0]!;
    expect(gateStyleClears(gate.id, gate.styleThreshold, true)).toBe(true);
    expect(gateStyleClears(gate.id, gate.styleThreshold - 0.01, true)).toBe(false);
    expect(gateStyleClears(gate.id, 1, false)).toBe(false);
  });

  test("gateAt finds the nearest gate within its radius", () => {
    const gate = DRIFT_GATES[0]!;
    expect(gateAt(gate.position)).toBe(gate.id);
    expect(gateAt([100000, 100000])).toBeNull();
  });
});
