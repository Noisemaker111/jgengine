import { describe, expect, test } from "bun:test";

import { readsPinnedGames } from "./fixtures/gamesGate";

describe("check-game-feel", () => {
  test("names the Games commit it measures and fails off the pin", () => {
    expect(() => readsPinnedGames("check-game-feel")).not.toThrow();
  });
});
