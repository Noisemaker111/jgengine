import { expect, test } from "bun:test";

import { GrassFrameShare } from "./grassFrameShare";

test("patches on one renderer split one frame budget among the ones still working", () => {
  const share = new GrassFrameShare();
  const renderer = {};
  for (let i = 0; i < 8; i += 1) {
    expect(share.slice(renderer, 1, 3)).toBe(3);
    share.stillBusy(renderer);
  }
  let total = 0;
  for (let i = 0; i < 8; i += 1) total += share.slice(renderer, 2, 3);
  expect(total).toBeCloseTo(3);
  share.stillBusy(renderer);
  expect(share.slice(renderer, 3, 3)).toBe(3);
});

test("each renderer keeps its own budget", () => {
  const share = new GrassFrameShare();
  const a = {}, b = {};
  share.slice(a, 1, 3);
  share.stillBusy(a);
  share.stillBusy(a);
  expect(share.slice(a, 2, 3)).toBe(1.5);
  expect(share.slice(b, 2, 3)).toBe(3);
});
