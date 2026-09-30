import { expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { installCaptureProbe, publishCaptureProbe } from "./captureProbe";

test("probe samples actual state and native frames, respecting event spacing and cleanup", () => {
  let stateEvent = () => {};
  let detached = false;
  const ctx = { subscribe: (listener: () => void) => {
    stateEvent = listener;
    return () => { detached = true; };
  } } as unknown as GameContext;
  const target: Parameters<typeof installCaptureProbe>[2] = {};
  let t = 0;
  let position = 0;
  let reads = 0;
  const dispose = installCaptureProbe(ctx, () => { reads++; return { position, invalid: NaN }; }, target, () => t);
  publishCaptureProbe(ctx);
  expect(reads).toBe(0);
  const samples: Array<{ t: number; metrics: Record<string, number> }> = [];
  const unsubscribe = target.__jgSubscribeProbe!(sample => samples.push(sample), 10);
  position = 5; t = 5; stateEvent();
  t = 10; publishCaptureProbe(ctx);
  position = 0; t = 20; stateEvent();
  expect(samples).toEqual([
    { t: 0, metrics: { position: 0 } },
    { t: 10, metrics: { position: 5 } },
    { t: 20, metrics: { position: 0 } },
  ]);
  unsubscribe(); t = 30; publishCaptureProbe(ctx);
  expect(samples.length).toBe(3);
  dispose();
  expect(detached).toBe(true);
  expect(target.__jgProbe).toBeUndefined();
  expect(target.__jgSubscribeProbe).toBeUndefined();
  publishCaptureProbe(ctx);
  expect(reads).toBe(3);
});

test("throwing probes and capture listeners do not break gameplay or replace unrelated hooks", () => {
  const ctx = { subscribe: () => () => {} } as unknown as GameContext;
  const previous = () => ({ old: 1 });
  const target: Parameters<typeof installCaptureProbe>[2] = { __jgProbe: previous };
  const dispose = installCaptureProbe(ctx, () => { throw new Error("broken probe"); }, target);
  target.__jgSubscribeProbe!(() => { throw new Error("broken consumer"); });
  expect(target.__jgProbe!()).toEqual({});
  expect(() => publishCaptureProbe(ctx)).not.toThrow();
  dispose();
  expect(target.__jgProbe).toBe(previous);
});
