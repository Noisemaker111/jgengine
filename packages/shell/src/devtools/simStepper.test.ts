import { describe, expect, test } from "bun:test";
import { advanceSimulation, FRAMES_PER_YIELD, registerSimStepper } from "./simStepper";

describe("advanceSimulation", () => {
  test("is null with no driver mounted", async () => {
    expect(await advanceSimulation(1)).toBeNull();
  });

  test("runs the registered step in 0.05 s frames covering the requested time", async () => {
    const steps: number[] = [];
    const unregister = registerSimStepper((dt) => steps.push(dt));
    expect(await advanceSimulation(1)).toBe(20);
    expect(steps.length).toBe(20);
    expect(steps.every((dt) => dt === 0.05)).toBe(true);
    unregister();
    expect(await advanceSimulation(1)).toBeNull();
  });

  test("yields to the host between batches so the UI can commit mid-advance", async () => {
    const unregister = registerSimStepper(() => {});
    let yields = 0;
    expect(await advanceSimulation(30, 0.05, async () => { yields += 1; })).toBe(600);
    expect(yields).toBe(600 / FRAMES_PER_YIELD - 1);
    unregister();
  });

  test("caps a single call at 2400 frames and clamps the frame size", async () => {
    let count = 0;
    const unregister = registerSimStepper(() => { count += 1; });
    expect(await advanceSimulation(1000, 0.05, async () => {})).toBe(2400);
    expect(count).toBe(2400);
    expect(await advanceSimulation(0.1, 0.5)).toBe(2);
    unregister();
  });

  test("an older driver's unregister does not remove a newer registration", async () => {
    const first = registerSimStepper(() => {});
    let ran = 0;
    const second = registerSimStepper(() => { ran += 1; });
    first();
    expect(await advanceSimulation(0.05)).toBe(1);
    expect(ran).toBe(1);
    second();
  });
});
