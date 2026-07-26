import { describe, expect, it } from "bun:test";

import { advanceStepCadence, createStepCadenceState, type StepCadenceConfig } from "./stepCadence";

const config: StepCadenceConfig = { strideDistance: 1.6 };

describe("advanceStepCadence", () => {
  it("lands the first step from rest at half a stride", () => {
    const first = advanceStepCadence(createStepCadenceState(), { distance: 0.8, moving: true }, config);
    expect(first.steps).toBe(1);
  });

  it("needs a full stride for subsequent steps", () => {
    let state = advanceStepCadence(createStepCadenceState(), { distance: 0.8, moving: true }, config).state;
    const short = advanceStepCadence(state, { distance: 0.9, moving: true }, config);
    expect(short.steps).toBe(0);
    state = short.state;
    expect(advanceStepCadence(state, { distance: 0.7, moving: true }, config).steps).toBe(1);
  });

  it("emits multiple steps across a long frame", () => {
    const state = advanceStepCadence(createStepCadenceState(), { distance: 0.8, moving: true }, config).state;
    expect(advanceStepCadence(state, { distance: 3.2, moving: true }, config).steps).toBe(2);
  });

  it("alternates feet by step parity", () => {
    let state = createStepCadenceState();
    const feet: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const result = advanceStepCadence(state, { distance: 1.6, moving: true }, config);
      feet.push(result.foot);
      state = result.state;
    }
    expect(feet).toEqual([0, 1, 0, 1]);
  });

  it("resets banked distance when the mover stops, so the next start steps promptly", () => {
    const walked = advanceStepCadence(createStepCadenceState(), { distance: 1.5, moving: true }, config);
    const stopped = advanceStepCadence(walked.state, { distance: 0, moving: false }, config);
    expect(stopped.state.travelled).toBe(0);
    expect(advanceStepCadence(stopped.state, { distance: 0.8, moving: true }, config).steps).toBe(1);
  });

  it("shortens the stride with strideScale", () => {
    const state = advanceStepCadence(createStepCadenceState(), { distance: 0.8, moving: true }, config).state;
    expect(advanceStepCadence(state, { distance: 0.8, moving: true, strideScale: 0.5 }, config).steps).toBe(1);
  });
});
