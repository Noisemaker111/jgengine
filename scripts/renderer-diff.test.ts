import { expect, test } from "bun:test";

import { parseRendererDiffArgs } from "./renderer-diff";

test("games are positional; --out and --settle take values", () => {
  const parsed = parseRendererDiffArgs(["harbor-heat", "deepward", "--settle", "2500", "--out", "shots"]);
  expect(parsed.games).toEqual(["harbor-heat", "deepward"]);
  expect(parsed.settleMs).toBe(2500);
  expect(parsed.out.replaceAll("\\", "/").endsWith("/shots")).toBe(true);
  expect(parseRendererDiffArgs(["odd-orbit"]).settleMs).toBe(4000);
});

test("no game, an unknown flag or a bad settle is refused", () => {
  expect(() => parseRendererDiffArgs([])).toThrow("usage");
  expect(() => parseRendererDiffArgs(["deepward", "--fps"])).toThrow("unknown argument --fps");
  expect(() => parseRendererDiffArgs(["deepward", "--settle", "-1"])).toThrow("--settle must be milliseconds");
});
