import { describe, expect, test } from "bun:test";

import { createBattleGrid } from "./board";
import { chooseEnemyIntent } from "./ai";

describe("chooseEnemyIntent", () => {
  test("attacks in place when the target is already in range", () => {
    const grid = createBattleGrid([]);
    grid.place("enemy", [4, 4]);
    const intent = chooseEnemyIntent(grid, [4, 4], 2, 3, [[4, 1]]);
    expect(intent).toEqual({ kind: "attack", moveTo: [4, 4], targetTile: [4, 1] });
  });

  test("moves to the cheapest reachable tile that brings the target into range", () => {
    const grid = createBattleGrid([]);
    grid.place("enemy", [0, 0]);
    const intent = chooseEnemyIntent(grid, [0, 0], 3, 1, [[3, 0]]);
    expect(intent.kind).toBe("attack");
    if (intent.kind === "attack") {
      expect(intent.targetTile).toEqual([3, 0]);
      expect(intent.moveTo[0]).toBeLessThanOrEqual(3);
      expect(intent.moveTo[0]).toBeGreaterThanOrEqual(2);
    }
  });

  test("advances toward the nearest target when no reachable tile is in range", () => {
    const grid = createBattleGrid([]);
    grid.place("enemy", [0, 0]);
    const intent = chooseEnemyIntent(grid, [0, 0], 2, 1, [[7, 0]]);
    expect(intent.kind).toBe("advance");
    if (intent.kind === "advance") expect(intent.moveTo[0]).toBeGreaterThan(0);
  });

  test("holds when boxed in with no reachable tiles and target out of range", () => {
    const grid = createBattleGrid([
      [1, 0],
      [0, 1],
    ]);
    grid.place("enemy", [0, 0]);
    const intent = chooseEnemyIntent(grid, [0, 0], 3, 1, [[7, 7]]);
    expect(intent).toEqual({ kind: "hold" });
  });

  test("holds when there are no living targets", () => {
    const grid = createBattleGrid([]);
    grid.place("enemy", [0, 0]);
    expect(chooseEnemyIntent(grid, [0, 0], 3, 1, [])).toEqual({ kind: "hold" });
  });
});
