import { describe, expect, test } from "bun:test";
import { forkBranches, mainCumulative } from "../world/canyon";
import { advanceMapSlow, createInitialMapSlowState } from "./mapSlow";

describe("advanceMapSlow", () => {
  test("holding with no fork passed and a starting charge consumes it and activates", () => {
    const state = advanceMapSlow(createInitialMapSlowState(), { carMainDistance: 0, held: true, dt: 1 / 60 });
    expect(state.active).toBe(true);
    expect(state.charges).toBe(0);
  });

  test("passing a fork system grants a new charge", () => {
    const fork = forkBranches[0];
    const state = advanceMapSlow(createInitialMapSlowState(), {
      carMainDistance: mainCumulative[fork.fromIndex] + 1,
      held: false,
      dt: 1 / 60,
    });
    expect(state.forksPassed.has(fork.id)).toBe(true);
    expect(state.charges).toBe(2);
  });

  test("releasing the key stops the hold and does not refund the charge", () => {
    let state = advanceMapSlow(createInitialMapSlowState(), { carMainDistance: 0, held: true, dt: 1 / 60 });
    state = advanceMapSlow(state, { carMainDistance: 0, held: false, dt: 1 / 60 });
    expect(state.active).toBe(false);
    expect(state.charges).toBe(0);
  });

  test("holding with no charges available never activates", () => {
    let state = createInitialMapSlowState();
    state = { ...state, charges: 0 };
    state = advanceMapSlow(state, { carMainDistance: 0, held: true, dt: 1 / 60 });
    expect(state.active).toBe(false);
  });
});
