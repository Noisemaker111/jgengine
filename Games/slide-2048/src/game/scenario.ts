import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import type { Tile } from "./logic/board";
import { STORE_KEY, type GameState } from "./logic/game";

function tile(id: number, value: number, row: number, col: number): Tile {
  return { id, value, row, col, merged: false, isNew: false, anim: 0 };
}

/**
 * A staged mid/late-game board for GameUiPreview: the full ember ramp on screen
 * (2 → 1024), a corner-stacked strategy shape, one open cell so it reads as a
 * live game — no banner covering the board.
 */
export const slide2048UiScenario: UiPreviewScenario = (ctx) => {
  const grid: number[][] = [
    [1024, 512, 128, 16],
    [8, 64, 256, 32],
    [4, 8, 16, 4],
    [0, 2, 4, 2],
  ];
  const tiles: Tile[] = [];
  let id = 1;
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const value = grid[r]![c]!;
      if (value > 0) tiles.push(tile(id++, value, r, c));
    }
  }
  const state: GameState = {
    tiles,
    score: 12480,
    spawnCount: tiles.length,
    nextId: id,
    moveCount: 96,
    won: false,
    keepGoing: false,
    over: false,
    seed: "ember-42",
    best: 20344,
    history: null,
  };
  ctx.game.store.set(STORE_KEY, state);
};
