import { describe, expect, test } from "bun:test";

import { readsPinnedGames } from "./fixtures/gamesGate";

describe("check-game-front-end", () => {
  test("names the Games commit it measures and fails off the pin", () => {
    expect(() => readsPinnedGames("check-game-front-end")).not.toThrow();
  });
});
