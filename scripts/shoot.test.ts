import { describe, expect, test } from "bun:test";

import { BOARD_GUARD_SECONDS, SHOOT_GUARD_SECONDS, shootCommand } from "./shoot";

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

  test("--board hands the rest to the grass board under one long guard", () => {
    expect(shootCommand(["--board", "--views"])).toEqual(["scripts/guard.ts", String(BOARD_GUARD_SECONDS), "bun scripts/reference/grass/grassBoard.ts", "--views"]);
  });
});
