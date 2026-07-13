import { describe, expect, test } from "bun:test";
import {
  defineGame,
  seededRng,
  selectSpawnPoint,
} from "@jgengine/core/authoring";

describe("authoring surface", () => {
  test("creates a game without exposing scene or asset stores", () => {
    const game = defineGame({ name: "Authoring example", multiplayer: null });
    expect(game.name).toBe("Authoring example");
    expect(game.scene).toBeDefined();
    expect(game.assets).toBeDefined();
  });

  test("supports deterministic semantic spawn selection", () => {
    const random = seededRng("authoring-test");
    const point = selectSpawnPoint({
      candidates: [[0, 0], [20, 0]],
      avoid: [[0, 0]],
      random,
      distanceBias: "far",
    });
    expect(point).toEqual([20, 0]);
  });
});
