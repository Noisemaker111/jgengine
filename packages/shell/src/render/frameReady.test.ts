import { expect, test } from "bun:test";
import { FrameReadiness } from "./frameReady";

test("a referenced model awaiting its first request prevents readiness", () => {
  let ready = false;
  const frame = new FrameReadiness((next) => { ready = next; });
  const loaded = frame.begin();
  frame.drawn();
  expect(ready).toBe(false);
  loaded();
  expect(ready).toBe(false);
  frame.drawn();
  expect(ready).toBe(true);
});

test("all subtrees must commit, and a newly loading subtree invalidates the old frame", () => {
  let ready = false;
  const frame = new FrameReadiness((next) => { ready = next; });
  frame.drawn();
  expect(ready).toBe(true);
  const first = frame.begin();
  const second = frame.begin();
  expect(ready).toBe(false);
  first();
  first();
  frame.drawn();
  expect(ready).toBe(false);
  second();
  frame.drawn();
  expect(ready).toBe(true);
});

test("diagnostics distinguish a pending model, an unfinished draw, and a completed frame without publishing readiness", () => {
  let time = 10;
  const published: boolean[] = [];
  const frame = new FrameReadiness(next => published.push(next), () => time);
  const loaded = frame.begin();
  frame.started();
  expect(frame.snapshot()).toEqual({ ready: false, pending: 1, framesStarted: 1, framesCompleted: 0, lastFrameStartedAt: 10, lastFrameCompletedAt: null });
  expect(published).toEqual([]);
  time = 40;
  frame.drawn();
  expect(frame.snapshot().framesCompleted).toBe(1);
  expect(frame.snapshot().ready).toBe(false);
  loaded();
  loaded();
  expect(frame.snapshot().pending).toBe(0);
  expect(frame.snapshot().ready).toBe(false);
  time = 50;
  frame.started();
  time = 80;
  frame.drawn();
  expect(frame.snapshot()).toEqual({ ready: true, pending: 0, framesStarted: 2, framesCompleted: 2, lastFrameStartedAt: 50, lastFrameCompletedAt: 80 });
  expect(published).toEqual([true]);
});
