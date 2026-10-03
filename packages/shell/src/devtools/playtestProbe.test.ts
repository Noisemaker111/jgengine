import { expect, test } from "bun:test";
import { attachPlaytestProbe } from "./playtestProbe";

test("samples live state and retires readers when the boot ends", () => {
  const host: { __jgProbe?: () => Record<string, number> } = {};
  let x = 1;
  let reads = 0;
  const cleanup = attachPlaytestProbe(host, () => { reads++; return { x }; });
  const retained = host.__jgProbe!;
  expect(retained()).toEqual({ x: 1 });
  x = 9;
  expect(retained()).toEqual({ x: 9 });
  cleanup();
  expect(host.__jgProbe).toBeUndefined();
  expect(retained()).toEqual({});
  expect(reads).toBe(2);
  cleanup();
});

test("cleanup cannot remove a replacement host's probe", () => {
  const host: { __jgProbe?: () => Record<string, number> } = {};
  const first = attachPlaytestProbe(host, () => ({ player: 1 }));
  const second = attachPlaytestProbe(host, () => ({ player: 2 }));
  first();
  expect(host.__jgProbe!()).toEqual({ player: 2 });
  second();
  expect(host.__jgProbe).toBeUndefined();
});

test("a failed probe is unavailable rather than a fabricated progress sample", () => {
  const host: { __jgProbe?: () => Record<string, number> } = {};
  const cleanup = attachPlaytestProbe(host, () => { throw new Error("not ready"); });
  expect(host.__jgProbe!()).toEqual({});
  cleanup();
});
