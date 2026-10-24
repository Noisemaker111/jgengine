import { describe, expect, test } from "bun:test";

import { readsPinnedGames } from "./fixtures/gamesGate";

describe("check-module-globals", () => {
  test("names the Games commit it measures and fails off the pin", () => {
    expect(() => readsPinnedGames("check-module-globals")).not.toThrow();
  });
});
