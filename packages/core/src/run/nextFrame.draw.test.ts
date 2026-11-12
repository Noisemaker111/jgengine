import { expect, test } from "bun:test";
import { nextFrame } from "./nextFrame.draw";
import { runSliced, type SlicedJob } from "./slicedWork";

/** Put `requestAnimationFrame` back exactly: absent under bun stays absent, never an own key holding undefined (#3194). */
function restoreFrame(previous: PropertyDescriptor | undefined): void {
  if (previous === undefined) Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  else Object.defineProperty(globalThis, "requestAnimationFrame", previous);
}

test("paces a job to one slice per animation frame", async () => {
  const frames: (() => void)[] = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => frames.push(() => callback(0));
  try {
    let clock = 0;
    function* work(): SlicedJob<number> {
      let total = 0;
      for (let index = 0; index < 10; index += 1) {
        total += index;
        clock += 3;
        yield;
      }
      return total;
    }
    let finished = false;
    const run = runSliced(work(), { budgetMs: 8, now: () => clock, yieldThread: nextFrame });
    void run.done.then(() => (finished = true));
    const slices: number[] = [];
    while (!finished) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      slices.push(clock);
      frames.shift()?.();
    }
    expect(await run.done).toBe(45);
    expect(slices).toEqual([9, 18, 27, 30]);
  } finally {
    restoreFrame(original);
  }
});

test("yields without a browser frame loop", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  try {
    let yielded = false;
    const pending = nextFrame().then(() => { yielded = true; });
    expect(yielded).toBe(false);
    await pending;
    expect(yielded).toBe(true);
  } finally {
    restoreFrame(original);
  }
});
