import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { BOMB_SPRITE, FLAG_SPRITE, NUMBER_SPRITE_PREFIX } from "./assets";
import type { Board } from "./board";
import { colOf, rowOf } from "./board";
import {
  BOARD_N,
  CELL_HIDDEN,
  CELL_SAFE,
  TABLE_TOP,
  TILE_CELL_Y,
  cellKey,
} from "./tuning";

// Fractional Y keeps a placed object OUT of the voxel solid set (keys are exact
// position strings; the controller only ever queries integer cells), so all
// furniture is decoration you can never bump into — only the board tiles, placed
// at integer coords, are solid.
const DECOR_EPS = 0.041;

const HIDDEN_COLOR = "#e7d3a1";
const FLAG_COLOR = "#e0533b";
const REVEALED_COLOR = "#231d30";
const BOMB_TILE_COLOR = "#7a1f27";

const CENTER = (BOARD_N - 1) / 2;

interface Decor {
  x: number;
  y: number;
  z: number;
  scale: [number, number, number];
  color: string;
  opacity?: number;
}

// A cozy (giant, to sell "tiny people") living room around the board. Every
// piece sits at a fractional Y so none of it is ever solid — only the board
// tiles collide.
function roomDecor(): Decor[] {
  const lo = -0.85;
  const hi = BOARD_N - 1 + 0.85;
  const railTop = TABLE_TOP - 0.5; // a low lip just around the grid
  const legY = TILE_CELL_Y - 0.5;
  return [
    // Coffee-table top slab the board sits on + four chunky legs to the floor.
    { x: CENTER, y: legY, z: CENTER, scale: [BOARD_N + 2.4, 0.55, BOARD_N + 2.4], color: "#6b4326" },
    { x: lo - 0.6, y: DECOR_EPS, z: lo - 0.6, scale: [0.9, legY, 0.9], color: "#4a2c17" },
    { x: hi + 0.6, y: DECOR_EPS, z: lo - 0.6, scale: [0.9, legY, 0.9], color: "#4a2c17" },
    { x: lo - 0.6, y: DECOR_EPS, z: hi + 0.6, scale: [0.9, legY, 0.9], color: "#4a2c17" },
    { x: hi + 0.6, y: DECOR_EPS, z: hi + 0.6, scale: [0.9, legY, 0.9], color: "#4a2c17" },
    // Raised wooden frame around the grid so the play area reads as a board.
    { x: CENTER, y: railTop, z: lo, scale: [BOARD_N + 1.5, 0.6, 0.5], color: "#3a2413" },
    { x: CENTER, y: railTop, z: hi, scale: [BOARD_N + 1.5, 0.6, 0.5], color: "#3a2413" },
    { x: lo, y: railTop, z: CENTER, scale: [0.5, 0.6, BOARD_N + 1.5], color: "#3a2413" },
    { x: hi, y: railTop, z: CENTER, scale: [0.5, 0.6, BOARD_N + 1.5], color: "#3a2413" },
    // Rug under the table.
    { x: CENTER, y: DECOR_EPS, z: CENTER, scale: [BOARD_N + 16, 0.06, BOARD_N + 14], color: "#6e2733" },
    // Fireplace straight ahead (+Z) — the warm focal backdrop.
    { x: CENTER, y: DECOR_EPS, z: 25, scale: [22, 13, 3.5], color: "#7a6152" },
    { x: CENTER, y: 13 + DECOR_EPS, z: 25, scale: [26, 1.8, 5], color: "#8a6b48" },
    { x: CENTER, y: DECOR_EPS, z: 23.4, scale: [11, 7.5, 0.8], color: "#2a1d18" },
    { x: CENTER, y: 0.8 + DECOR_EPS, z: 23.2, scale: [9, 5.6, 0.7], color: "#ff9a3c" },
    { x: CENTER, y: 0.8 + DECOR_EPS, z: 23.0, scale: [11, 7.2, 0.4], color: "#ffe08a", opacity: 0.45 },
    // Giant couch to the west.
    { x: -19, y: DECOR_EPS, z: CENTER, scale: [9, 5, 22], color: "#3f5d78" },
    { x: -22.5, y: DECOR_EPS, z: CENTER, scale: [2.5, 11, 22], color: "#34506a" },
    { x: -19, y: 5 + DECOR_EPS, z: -7, scale: [9, 6, 4], color: "#4a6b88" },
    { x: -19, y: 5 + DECOR_EPS, z: 13, scale: [9, 6, 4], color: "#4a6b88" },
    // Bookshelf to the east.
    { x: 28, y: DECOR_EPS, z: 8, scale: [2.5, 26, 22], color: "#4c3420" },
    { x: 28, y: 7 + DECOR_EPS, z: 8, scale: [1.8, 1, 20], color: "#7a5636" },
    { x: 28, y: 14 + DECOR_EPS, z: 8, scale: [1.8, 1, 20], color: "#7a5636" },
    { x: 28, y: 21 + DECOR_EPS, z: 8, scale: [1.8, 1, 20], color: "#7a5636" },
    // Floor lamp to the east-front, casting warm light.
    { x: 15, y: DECOR_EPS, z: -12, scale: [0.6, 22, 0.6], color: "#2b2b33" },
    { x: 15, y: 22 + DECOR_EPS, z: -12, scale: [6, 5, 6], color: "#ffdf9e", opacity: 0.92 },
    // A giant closed board-game box behind the player.
    { x: CENTER, y: DECOR_EPS, z: -16, scale: [16, 2.4, 12], color: "#7a2f3a" },
    { x: CENTER, y: 2.4 + DECOR_EPS, z: -16, scale: [15, 0.3, 11], color: "#c94f5e" },
  ];
}

function placeDecor(ctx: GameContext, d: Decor): void {
  ctx.scene.object.place("room-decor", d.x, d.y, d.z, {
    visual: { scale: d.scale, color: d.color, opacity: d.opacity },
  });
}

export function buildRoom(ctx: GameContext): void {
  for (const d of roomDecor()) placeDecor(ctx, d);
}

export function buildBoard(ctx: GameContext): void {
  for (let row = 0; row < BOARD_N; row += 1) {
    for (let col = 0; col < BOARD_N; col += 1) {
      ctx.scene.object.place(CELL_HIDDEN, col, TILE_CELL_Y, row, {
        instanceId: cellKey(col, row),
        visual: { scale: [0.92, 1, 0.92], color: HIDDEN_COLOR },
      });
    }
  }
}

/** Open a trapdoor: removing the solid tile lets whoever stands there free-fall. */
export function openCell(ctx: GameContext, col: number, row: number): void {
  ctx.scene.object.remove(cellKey(col, row));
}

/** Toggle a flag marker on a hidden cell. */
export function setFlag(ctx: GameContext, col: number, row: number, flagged: boolean): void {
  ctx.scene.object.setVisual(cellKey(col, row), {
    scale: [0.92, 1, 0.92],
    color: flagged ? FLAG_COLOR : HIDDEN_COLOR,
  });
  const markId = `flag:${col},${row}`;
  if (flagged) {
    if (ctx.scene.entity.get(markId) === null) {
      ctx.scene.entity.spawn(FLAG_SPRITE, { id: markId, position: [col, TABLE_TOP, row], role: "prop" });
    }
  } else {
    ctx.scene.entity.despawn(markId);
  }
}

/** Turn an opened cell into a revealed floor tile (walkable) showing its number. */
export function placeRevealed(ctx: GameContext, col: number, row: number, adjacent: number): void {
  ctx.scene.entity.despawn(`flag:${col},${row}`);
  ctx.scene.object.remove(cellKey(col, row));
  // Full-height tile (voxel collision is always a unit cell, so a short visual
  // would leave the player floating); the dark color + number read it as opened.
  ctx.scene.object.place(CELL_SAFE, col, TILE_CELL_Y, row, {
    instanceId: cellKey(col, row),
    visual: { scale: [0.99, 1, 0.99], color: REVEALED_COLOR },
  });
  const numId = `num:${col},${row}`;
  ctx.scene.entity.despawn(numId);
  if (adjacent > 0) {
    ctx.scene.entity.spawn(`${NUMBER_SPRITE_PREFIX}${adjacent}`, {
      id: numId,
      position: [col, TABLE_TOP - 0.4, row],
      role: "prop",
    });
  }
}

/** Reveal every bomb (on a loss): recolor the tile and drop a bomb marker on it. */
export function revealBombs(ctx: GameContext, board: Board): void {
  for (let i = 0; i < board.bomb.length; i += 1) {
    if (!board.bomb[i]) continue;
    const col = colOf(board.n, i);
    const row = rowOf(board.n, i);
    ctx.scene.object.setVisual(cellKey(col, row), { scale: [0.92, 1, 0.92], color: BOMB_TILE_COLOR });
    const bombId = `bomb:${col},${row}`;
    if (ctx.scene.entity.get(bombId) === null) {
      ctx.scene.entity.spawn(BOMB_SPRITE, { id: bombId, position: [col, TABLE_TOP, row], role: "prop" });
    }
  }
}

/** Tear down all board tiles + markers for a fresh round. */
export function clearBoard(ctx: GameContext): void {
  for (let row = 0; row < BOARD_N; row += 1) {
    for (let col = 0; col < BOARD_N; col += 1) ctx.scene.object.remove(cellKey(col, row));
  }
  for (const e of ctx.scene.entity.list()) {
    if (e.id.startsWith("num:") || e.id.startsWith("bomb:") || e.id.startsWith("flag:")) {
      ctx.scene.entity.despawn(e.id);
    }
  }
}
