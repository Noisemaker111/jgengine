import { expect, test } from "bun:test";

import { frameTable, frameTiming, parseRendererDiffArgs, type RendererDiffResult } from "./renderer-diff";

test("frame timing drops the capture's frame and reads the median, the 95th percentile and the rate", () => {
  const t = frameTiming([500, 2, 4, 3, 1, 5]);
  expect(t.samples).toBe(5);
  expect(t.p50Ms).toBe(3);
  expect(t.p95Ms).toBe(5);
  expect(t.fps).toBe(333.3);
  expect(frameTiming([]).samples).toBe(0);
});

test("the table compares WebGPU with the mean of the WebGL windows before and after it", () => {
  const timing = (p50Ms: number) => ({ p50Ms, p95Ms: p50Ms, fps: 1000 / p50Ms, samples: 100 });
  const result = (game: string, gl: number, gpu: number, again: number) => ({ game, frames: { webgl: timing(gl), webgpu: timing(gpu), remounted: timing(again) } }) as unknown as RendererDiffResult;
  const table = frameTable([result("drift-foundry", 10, 8, 10), result("odd-orbit", 2, 3, 2), { game: "untimed", frames: null } as unknown as RendererDiffResult]);
  expect(table).toContain("| drift-foundry | 10 / 10 | 8 | 0.80x | webgpu |");
  expect(table).toContain("| odd-orbit | 2 / 2 | 3 | 1.50x | webgl |");
  expect(table).not.toContain("untimed");
  expect(frameTable([])).toBe("");
});

test("games are positional; --out and --settle take values", () => {
  const parsed = parseRendererDiffArgs(["harbor-heat", "deepward", "--settle", "2500", "--out", "shots"]);
  expect(parsed.games).toEqual(["harbor-heat", "deepward"]);
  expect(parsed.settleMs).toBe(2500);
  expect(parsed.out.replaceAll("\\", "/").endsWith("/shots")).toBe(true);
  expect(parseRendererDiffArgs(["odd-orbit"]).settleMs).toBe(4000);
  expect(parseRendererDiffArgs(["odd-orbit"]).seconds).toBe(5);
  expect(parseRendererDiffArgs(["odd-orbit", "--seconds", "0"]).seconds).toBe(0);
  expect(() => parseRendererDiffArgs(["odd-orbit", "--seconds", "x"])).toThrow("--seconds must be");
});

test("no game, an unknown flag or a bad settle is refused", () => {
  expect(() => parseRendererDiffArgs([])).toThrow("usage");
  expect(() => parseRendererDiffArgs(["deepward", "--fps"])).toThrow("unknown argument --fps");
  expect(() => parseRendererDiffArgs(["deepward", "--settle", "-1"])).toThrow("--settle must be milliseconds");
});
