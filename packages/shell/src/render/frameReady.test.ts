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
