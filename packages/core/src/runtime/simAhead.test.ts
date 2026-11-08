import { expect, test } from "bun:test";

import { createIdleTask, createRecordedTime, shouldStepAhead } from "./simAhead";
import { createSimLoop } from "./simLoop";

test("a step runs ahead only when the next frame of the same length owes it and frames are short", () => {
  const loop = createSimLoop({ hz: 60 });
  loop.advance(0.012, () => {});
  expect(shouldStepAhead(loop, 1 / 360)).toBe(false);
  loop.advance(0.003, () => {});
  expect(shouldStepAhead(loop, 1 / 360)).toBe(true);
  // At 100 fps most frames carry a step anyway: running one early would only sample input sooner.
  expect(shouldStepAhead(loop, 0.01)).toBe(false);
  loop.stepAhead(() => {});
  expect(shouldStepAhead(loop, 1 / 360)).toBe(false);
  expect(shouldStepAhead(createSimLoop({ hz: "variable" }), 1 / 360)).toBe(false);
  expect(shouldStepAhead(loop, 0)).toBe(false);
});

test("an idle task runs once after the current task, however often it is asked, and never after dispose", async () => {
  let runs = 0;
  const task = createIdleTask(() => (runs += 1));
  task.request();
  task.request();
  expect(runs).toBe(0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(runs).toBe(1);
  task.request();
  task.dispose();
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(runs).toBe(1);
});

test("a replay fed the recorded times runs every step on the frame and input the live loop stepping ahead used", () => {
  // Live: frames near 360 fps with jitter, so some early steps land on a frame that ends short of them.
  let seed = 7;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.0008;
  const live = createSimLoop({ hz: 60 });
  const time = createRecordedTime();
  const recorded: { dt: number; input: number }[] = [];
  const liveSteps: number[] = [];
  let input = 0;
  let early = 0;
  let lastDt = 1 / 360;
  for (let frame = 0; frame < 2000; frame += 1) {
    input += 1;
    const dt = 1 / 360 + jitter();
    recorded.push({ dt: time.frame(dt), input });
    live.advance(dt, () => liveSteps.push(input));
    lastDt = dt;
    if (shouldStepAhead(live, lastDt)) {
      input += 1;
      const until = live.untilStep() ?? 0;
      live.stepAhead(() => liveSteps.push(input));
      recorded.push({ dt: time.ahead(until), input });
      early += 1;
    }
  }
  expect(early).toBeGreaterThan(250);
  expect(recorded.every((entry) => entry.dt >= 0)).toBe(true);
  const replay = createSimLoop({ hz: 60 });
  const replaySteps: number[] = [];
  for (const entry of recorded) replay.advance(entry.dt, () => replaySteps.push(entry.input));
  expect(replaySteps).toEqual(liveSteps.slice(0, replaySteps.length));
  expect(liveSteps.length - replaySteps.length).toBeLessThanOrEqual(1);
});
