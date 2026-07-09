import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { BOMB_SPRITE, FLAG_SPRITE, NUMBER_SPRITE_PREFIX } from "./assets";
import type { Board } from "./board";
import { colOf, rowOf } from "./board";
import {
  BOARD_N,
  CELL_HIDDEN,
  CELL_PILLAR,
  CELL_PITCH,
  CELL_SAFE,
  CELL_VISUAL,
  FOOTPRINT_RADIUS,
  TABLE_TOP,
  TILE_BASE_Y,
  TILE_CELL_Y,
  TILE_HEIGHT,
  cellKey,
  cellSolidKey,
  cellWorld,
} from "./tuning";

const DECOR_EPS = 0.041;

const HIDDEN_COLOR = "#e7d3a1";
const FLAG_COLOR = "#e0533b";
const REVEALED_COLOR = "#231d30";
const BOMB_TILE_COLOR = "#7a1f27";

const BOARD_CX = ((BOARD_N - 1) * CELL_PITCH) / 2;
const BOARD_CZ = ((BOARD_N - 1) * CELL_PITCH) / 2;
const BOARD_SPAN = (BOARD_N - 1) * CELL_PITCH;

interface Decor {
  x: number;
  y: number;
  z: number;
  scale: [number, number, number];
  color: string;
  opacity?: number;
}

function roomDecor(): Decor[] {
  const lo = -CELL_PITCH * 0.6;
  const hi = BOARD_SPAN + CELL_PITCH * 0.6;
  const railTop = TABLE_TOP - 0.4;
  const legY = Math.max(0.5, TILE_CELL_Y - 0.5);
  const pad = CELL_PITCH * 1.4;
  return [
    { x: BOARD_CX, y: legY, z: BOARD_CZ, scale: [BOARD_SPAN + pad * 2, 0.8, BOARD_SPAN + pad * 2], color: "#6b4326" },
    { x: lo - pad, y: DECOR_EPS, z: lo - pad, scale: [2.2, legY, 2.2], color: "#4a2c17" },
    { x: hi + pad, y: DECOR_EPS, z: lo - pad, scale: [2.2, legY, 2.2], color: "#4a2c17" },
    { x: lo - pad, y: DECOR_EPS, z: hi + pad, scale: [2.2, legY, 2.2], color: "#4a2c17" },
    { x: hi + pad, y: DECOR_EPS, z: hi + pad, scale: [2.2, legY, 2.2], color: "#4a2c17" },
    { x: BOARD_CX, y: railTop, z: lo, scale: [BOARD_SPAN + pad, 1.2, 1.4], color: "#3a2413" },
    { x: BOARD_CX, y: railTop, z: hi, scale: [BOARD_SPAN + pad, 1.2, 1.4], color: "#3a2413" },
    { x: lo, y: railTop, z: BOARD_CZ, scale: [1.4, 1.2, BOARD_SPAN + pad], color: "#3a2413" },
    { x: hi, y: railTop, z: BOARD_CZ, scale: [1.4, 1.2, BOARD_SPAN + pad], color: "#3a2413" },
    { x: BOARD_CX, y: DECOR_EPS, z: BOARD_CZ, scale: [BOARD_SPAN + 40, 0.08, BOARD_SPAN + 36], color: "#6e2733" },
    { x: BOARD_CX, y: DECOR_EPS, z: BOARD_CZ + 70, scale: [40, 28, 6], color: "#7a6152" },
    { x: BOARD_CX, y: 28 + DECOR_EPS, z: BOARD_CZ + 70, scale: [48, 3, 8], color: "#8a6b48" },
    { x: BOARD_CX, y: DECOR_EPS, z: BOARD_CZ + 66, scale: [20, 16, 1.4], color: "#2a1d18" },
    { x: BOARD_CX, y: 1.2 + DECOR_EPS, z: BOARD_CZ + 65.5, scale: [16, 12, 1.2], color: "#ff9a3c" },
    { x: BOARD_CX, y: 1.2 + DECOR_EPS, z: BOARD_CZ + 65, scale: [20, 15, 0.6], color: "#ffe08a", opacity: 0.45 },
    { x: BOARD_CX - 55, y: DECOR_EPS, z: BOARD_CZ, scale: [16, 10, 40], color: "#3f5d78" },
    { x: BOARD_CX - 62, y: DECOR_EPS, z: BOARD_CZ, scale: [5, 22, 40], color: "#34506a" },
    { x: BOARD_CX + 60, y: DECOR_EPS, z: BOARD_CZ + 10, scale: [5, 48, 40], color: "#4c3420" },
    { x: BOARD_CX + 60, y: 14 + DECOR_EPS, z: BOARD_CZ + 10, scale: [3.5, 1.6, 36], color: "#7a5636" },
    { x: BOARD_CX + 60, y: 28 + DECOR_EPS, z: BOARD_CZ + 10, scale: [3.5, 1.6, 36], color: "#7a5636" },
    { x: BOARD_CX + 60, y: 42 + DECOR_EPS, z: BOARD_CZ + 10, scale: [3.5, 1.6, 36], color: "#7a5636" },
    { x: BOARD_CX + 35, y: DECOR_EPS, z: BOARD_CZ - 40, scale: [1.2, 40, 1.2], color: "#2b2b33" },
    { x: BOARD_CX + 35, y: 40 + DECOR_EPS, z: BOARD_CZ - 40, scale: [10, 8, 10], color: "#ffdf9e", opacity: 0.92 },
    { x: BOARD_CX, y: DECOR_EPS, z: BOARD_CZ - 50, scale: [30, 4, 22], color: "#7a2f3a" },
    { x: BOARD_CX, y: 4 + DECOR_EPS, z: BOARD_CZ - 50, scale: [28, 0.5, 20], color: "#c94f5e" },
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

function placeTileSolids(ctx: GameContext, col: number, row: number): void {
  const [wx, wz] = cellWorld(col, row);
  for (let lx = -FOOTPRINT_RADIUS; lx <= FOOTPRINT_RADIUS; lx += 1) {
    for (let lz = -FOOTPRINT_RADIUS; lz <= FOOTPRINT_RADIUS; lz += 1) {
      ctx.scene.object.place(CELL_PILLAR, wx + lx, TILE_CELL_Y, wz + lz, {
        instanceId: cellSolidKey(col, row, lx, TILE_CELL_Y, lz),
      });
    }
  }
}

function placeTileVisual(ctx: GameContext, col: number, row: number, catalog: string, color: string): void {
  const [wx, wz] = cellWorld(col, row);
  ctx.scene.object.place(catalog, wx, TILE_BASE_Y + DECOR_EPS, wz, {
    instanceId: cellKey(col, row),
    visual: { scale: [CELL_VISUAL, TILE_HEIGHT, CELL_VISUAL], color },
  });
}

function removeTile(ctx: GameContext, col: number, row: number): void {
  ctx.scene.object.remove(cellKey(col, row));
  for (let lx = -FOOTPRINT_RADIUS; lx <= FOOTPRINT_RADIUS; lx += 1) {
    for (let lz = -FOOTPRINT_RADIUS; lz <= FOOTPRINT_RADIUS; lz += 1) {
      ctx.scene.object.remove(cellSolidKey(col, row, lx, TILE_CELL_Y, lz));
    }
  }
}

export function buildBoard(ctx: GameContext): void {
  for (let row = 0; row < BOARD_N; row += 1) {
    for (let col = 0; col < BOARD_N; col += 1) {
      placeTileSolids(ctx, col, row);
      placeTileVisual(ctx, col, row, CELL_HIDDEN, HIDDEN_COLOR);
    }
  }
}

export function openCell(ctx: GameContext, col: number, row: number): void {
  removeTile(ctx, col, row);
}

export function setFlag(ctx: GameContext, col: number, row: number, flagged: boolean): void {
  const [wx, wz] = cellWorld(col, row);
  ctx.scene.object.setVisual(cellKey(col, row), {
    scale: [CELL_VISUAL, TILE_HEIGHT, CELL_VISUAL],
    color: flagged ? FLAG_COLOR : HIDDEN_COLOR,
  });
  const markId = `flag:${col},${row}`;
  if (flagged) {
    if (ctx.scene.entity.get(markId) === null) {
      ctx.scene.entity.spawn(FLAG_SPRITE, { id: markId, position: [wx, TABLE_TOP, wz], role: "prop" });
    }
  } else {
    ctx.scene.entity.despawn(markId);
  }
}

export function placeRevealed(ctx: GameContext, col: number, row: number, adjacent: number): void {
  const [wx, wz] = cellWorld(col, row);
  ctx.scene.entity.despawn(`flag:${col},${row}`);
  removeTile(ctx, col, row);
  placeTileSolids(ctx, col, row);
  placeTileVisual(ctx, col, row, CELL_SAFE, REVEALED_COLOR);
  const numId = `num:${col},${row}`;
  ctx.scene.entity.despawn(numId);
  if (adjacent > 0) {
    ctx.scene.entity.spawn(`${NUMBER_SPRITE_PREFIX}${adjacent}`, {
      id: numId,
      position: [wx, TABLE_TOP + 0.2, wz],
      role: "prop",
    });
  }
}

export function revealBombs(ctx: GameContext, board: Board): void {
  for (let i = 0; i < board.bomb.length; i += 1) {
    if (!board.bomb[i]) continue;
    const col = colOf(board.n, i);
    const row = rowOf(board.n, i);
    const [wx, wz] = cellWorld(col, row);
    ctx.scene.object.setVisual(cellKey(col, row), {
      scale: [CELL_VISUAL, TILE_HEIGHT, CELL_VISUAL],
      color: BOMB_TILE_COLOR,
    });
    const bombId = `bomb:${col},${row}`;
    if (ctx.scene.entity.get(bombId) === null) {
      ctx.scene.entity.spawn(BOMB_SPRITE, { id: bombId, position: [wx, TABLE_TOP, wz], role: "prop" });
    }
  }
}

export function clearBoard(ctx: GameContext): void {
  for (let row = 0; row < BOARD_N; row += 1) {
    for (let col = 0; col < BOARD_N; col += 1) removeTile(ctx, col, row);
  }
  for (const e of ctx.scene.entity.list()) {
    if (e.id.startsWith("num:") || e.id.startsWith("bomb:") || e.id.startsWith("flag:")) {
      ctx.scene.entity.despawn(e.id);
    }
  }
}
