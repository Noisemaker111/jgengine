import { expect, test } from "bun:test";
import { nextFrame } from "./nextFrame.draw";
import { runSliced, type SlicedJob } from "./slicedWork";

test("paces a job to one slice per animation frame", async () => {
  const frames: (() => void)[] = [];
  const original = globalThis.requestAnimationFrame;
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
    globalThis.requestAnimationFrame = original;
  }
});

test("yields without a browser frame loop", async () => {
  const original = globalThis.requestAnimationFrame;
  Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  try {
    let yielded = false;
    const pending = nextFrame().then(() => { yielded = true; });
    expect(yielded).toBe(false);
    await pending;
    expect(yielded).toBe(true);
  } finally {
    if (original !== undefined) globalThis.requestAnimationFrame = original;
  }
});
