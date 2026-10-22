import { describe, expect, test } from "bun:test";

import { parseDebugArgs } from "./debug-report";

/**
 * `bun run debug` is the fast read path, so its argument handling is the part that
 * has to be boring: one game, an optional wait, and no surprise budget skip.
 */
describe("bun run debug arguments", () => {
  test("defaults to a 1.5s wait and the budget check", () => {
    expect(parseDebugArgs(["harbor-heat"])).toEqual({ game: "harbor-heat", waitMs: 1_500, budget: true });
  });

  test("takes an explicit wait and can skip the budget", () => {
    expect(parseDebugArgs(["deepward", "--wait", "0", "--no-budget"])).toEqual({
      game: "deepward",
      waitMs: 0,
      budget: false,
    });
  });

  test("refuses two games, an unknown flag and a negative wait", () => {
    expect(() => parseDebugArgs(["a", "b"])).toThrow(/one game/);
    expect(() => parseDebugArgs(["a", "--games"])).toThrow(/unknown flag/);
    expect(() => parseDebugArgs(["a", "--wait", "-1"])).toThrow(/0 or more/);
    expect(() => parseDebugArgs([])).toThrow(/game id is required/);
  });

  test("--help prints usage instead of running", () => {
    expect(parseDebugArgs(["--help"])).toBe("help");
  });
});
