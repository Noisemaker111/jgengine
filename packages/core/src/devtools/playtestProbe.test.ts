import { expect, test } from "bun:test";
import { attachPlaytestProbe } from "./playtestProbe";

test("samples live state and retires readers when the boot ends", () => {
  let x = 1;
  let reads = 0;
  const cleanup = attachPlaytestProbe(() => { reads++; return { x }; });
  const retained = globalThis.__jg!.probe!;
  expect(retained()).toEqual({ x: 1 });
  x = 9;
  expect(retained()).toEqual({ x: 9 });
  cleanup();
  expect(globalThis.__jg?.probe).toBeUndefined();
  expect(retained()).toEqual({});
  expect(reads).toBe(2);
  cleanup();
});

test("cleanup cannot remove a replacement host's probe", () => {
  const first = attachPlaytestProbe(() => ({ player: 1 }));
  const second = attachPlaytestProbe(() => ({ player: 2 }));
  first();
  expect(globalThis.__jg!.probe!()).toEqual({ player: 2 });
  second();
  expect(globalThis.__jg?.probe).toBeUndefined();
});

test("a failed probe is unavailable rather than a fabricated progress sample", () => {
  const cleanup = attachPlaytestProbe(() => { throw new Error("not ready"); });
  expect(globalThis.__jg!.probe!()).toEqual({});
  cleanup();
});
