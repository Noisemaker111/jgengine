import { describe, expect, test } from "bun:test";
import { advanceSimulation, FRAMES_PER_YIELD, registerSimStepper } from "./simStepper";

describe("advanceSimulation", () => {
  test("is null with no driver mounted", async () => {
    expect(await advanceSimulation(1)).toBeNull();
  });

  test("runs the registered step in 0.05 s frames covering the requested time", async () => {
    const steps: number[] = [];
    const unregister = registerSimStepper((dt) => { steps.push(dt); return true; });
    expect(await advanceSimulation(1)).toEqual({ frames: 20, gated: false });
    expect(steps.length).toBe(20);
    expect(steps.every((dt) => dt === 0.05)).toBe(true);
    unregister();
    expect(await advanceSimulation(1)).toBeNull();
  });

  test("yields to the host between batches so the UI can commit mid-advance", async () => {
    const unregister = registerSimStepper(() => true);
    let yields = 0;
    expect(await advanceSimulation(30, 0.05, async () => { yields += 1; })).toEqual({ frames: 600, gated: false });
    expect(yields).toBe(600 / FRAMES_PER_YIELD - 1);
    unregister();
  });

  test("caps a single call at 2400 frames and clamps the frame size", async () => {
    let count = 0;
    const unregister = registerSimStepper(() => { count += 1; return true; });
    expect(await advanceSimulation(1000, 0.05, async () => {})).toEqual({ frames: 2400, gated: false });
    expect(count).toBe(2400);
    expect(await advanceSimulation(0.1, 0.5)).toEqual({ frames: 2, gated: false });
    unregister();
  });

  test("an older driver's unregister does not remove a newer registration", async () => {
    const first = registerSimStepper(() => true);
    let ran = 0;
    const second = registerSimStepper(() => { ran += 1; return true; });
    first();
    expect(await advanceSimulation(0.05)).toEqual({ frames: 1, gated: false });
    expect(ran).toBe(1);
    second();
  });

  test("a gated frame advances nothing: the advance stops there and counts only the frames that ran", async () => {
    let calls = 0;
    const unregister = registerSimStepper(() => {
      calls += 1;
      return calls <= 3;
    });
    expect(await advanceSimulation(60, 0.05, async () => {})).toEqual({ frames: 3, gated: true });
    expect(calls).toBe(4);
    unregister();
  });

  test("play gated from the first frame reports zero frames, not the requested time", async () => {
    const unregister = registerSimStepper(() => false);
    expect(await advanceSimulation(60, 0.05, async () => {})).toEqual({ frames: 0, gated: true });
    unregister();
  });
});
