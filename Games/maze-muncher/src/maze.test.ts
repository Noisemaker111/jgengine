import { describe, expect, test } from "bun:test";

import {
  cellKey,
  isWall,
  pelletCells,
  PLAYER_START,
  powerCells,
  PEN_CENTER,
  reachableFrom,
  wallCells,
} from "./maze";

describe("maze layout", () => {
  test("has walls and dots", () => {
    expect(wallCells.length).toBeGreaterThan(80);
    expect(pelletCells.length).toBeGreaterThan(60);
    expect(powerCells.length).toBe(4);
  });

  test("player start and pen center are corridors", () => {
    expect(isWall(PLAYER_START.c, PLAYER_START.r)).toBe(false);
    expect(isWall(PEN_CENTER.c, PEN_CENTER.r)).toBe(false);
  });

  test("every dot is reachable from the start", () => {
    const seen = reachableFrom(PLAYER_START);
    for (const cell of [...pelletCells, ...powerCells]) {
      expect(seen.has(cellKey(cell.c, cell.r))).toBe(true);
    }
  });

  test("power pellets sit in the four corners", () => {
    for (const cell of powerCells) expect(isWall(cell.c, cell.r)).toBe(false);
  });
});
