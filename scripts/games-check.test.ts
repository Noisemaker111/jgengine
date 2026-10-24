import { describe, expect, test } from "bun:test";

import { readsPinnedGames } from "./fixtures/gamesGate";

describe("games:check", () => {
  test("names the Games commit it measures and fails off the pin", () => {
    expect(() => readsPinnedGames("games:check", "games-check.ts")).not.toThrow();
  });
});


