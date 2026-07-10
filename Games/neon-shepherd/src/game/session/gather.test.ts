import { describe, expect, test } from "bun:test";
import {
  advanceHold,
  canTriggerWhistle,
  createHoldState,
  createWhistleState,
  isGatherActive,
  triggerWhistle,
  whistleCooldownFraction,
  WHISTLE_ACTIVE_SECONDS,
  WHISTLE_COOLDOWN_SECONDS,
} from "./gather";

describe("whistle cooldown state machine", () => {
  test("can trigger immediately from a fresh state", () => {
    const state = createWhistleState();
    expect(canTriggerWhistle(state, 0)).toBe(true);
  });

  test("triggering starts the active window and the cooldown", () => {
    const state = triggerWhistle(createWhistleState(), 10);
    expect(isGatherActive(state, 10)).toBe(true);
    expect(isGatherActive(state, 10 + WHISTLE_ACTIVE_SECONDS + 0.01)).toBe(false);
    expect(canTriggerWhistle(state, 10 + WHISTLE_COOLDOWN_SECONDS - 0.01)).toBe(false);
    expect(canTriggerWhistle(state, 10 + WHISTLE_COOLDOWN_SECONDS)).toBe(true);
  });

  test("re-triggering while on cooldown is a no-op", () => {
    const first = triggerWhistle(createWhistleState(), 0);
    const second = triggerWhistle(first, 1);
    expect(second).toBe(first);
  });

  test("cooldown fraction counts down from 1 to 0", () => {
    const state = triggerWhistle(createWhistleState(), 0);
    expect(whistleCooldownFraction(state, 0)).toBeCloseTo(1, 5);
    expect(whistleCooldownFraction(state, WHISTLE_COOLDOWN_SECONDS)).toBeCloseTo(0, 5);
    expect(whistleCooldownFraction(state, WHISTLE_COOLDOWN_SECONDS + 5)).toBe(0);
  });
});

describe("hold-the-herd state transitions", () => {
  test("pressing the hold key captures the shepherd position as the anchor", () => {
    const state = advanceHold(createHoldState(), true, { x: 3, z: 4 });
    expect(state.holding).toBe(true);
    expect(state.anchor).toEqual({ x: 3, z: 4 });
  });

  test("the anchor stays fixed while held even as the shepherd keeps moving", () => {
    let state = advanceHold(createHoldState(), true, { x: 3, z: 4 });
    state = advanceHold(state, true, { x: 9, z: 9 });
    expect(state.anchor).toEqual({ x: 3, z: 4 });
  });

  test("releasing clears the anchor", () => {
    let state = advanceHold(createHoldState(), true, { x: 3, z: 4 });
    state = advanceHold(state, false, { x: 9, z: 9 });
    expect(state.holding).toBe(false);
    expect(state.anchor).toBeNull();
  });
});
