import { describe, expect, test } from "bun:test";

import { BOARD_BUDGET_SECONDS, BOARD_SHEETS_SECONDS, boardGuardSeconds, SHOOT_GUARD_SECONDS, shootCommand } from "./shoot";

describe("bun run shoot", () => {
  test("a plain run is one guarded capture with its arguments untouched", () => {
    expect(shootCommand(["deepward", "--mode", "play"])).toEqual([
      "scripts/guard.ts",
      String(SHOOT_GUARD_SECONDS),
      "bun scripts/shoot-dev.ts",
      "deepward",
      "--mode",
      "play",
    ]);
  });

  test("--prove hands the rest to the evidence bundle", () => {
    expect(shootCommand(["--prove", "harbor-heat", "--view", "downtown"])).toEqual(["games/scripts/prove.ts", "harbor-heat", "--view", "downtown"]);
  });

  test("--board hands the rest to the grass board, guarded for one run's budget, the capture in flight and the sheets", () => {
    const guard = BOARD_BUDGET_SECONDS + SHOOT_GUARD_SECONDS + BOARD_SHEETS_SECONDS;
    expect(shootCommand(["--board", "--views"])).toEqual(["scripts/guard.ts", String(guard), "bun scripts/reference/grass/grassBoard.ts", "--views"]);
    expect(boardGuardSeconds(["--board", "--budget", "120"])).toBe(120 + SHOOT_GUARD_SECONDS + BOARD_SHEETS_SECONDS);
    expect(boardGuardSeconds(["--board", "--budget", "nope"])).toBe(guard);
    // One default run, worst case, still ends well inside the hour a single long board used to need many of.
    expect(guard).toBeLessThan(20 * 60);
  });
});
