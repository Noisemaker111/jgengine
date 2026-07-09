// Mine Drop — shared constants. World units are meters.

/** Minesweeper board is BOARD_N x BOARD_N cells. */
export const BOARD_N = 10;
/** Hidden bombs seeded across the board. */
export const BOMB_COUNT = 15;

/**
 * Centre-to-centre spacing. 10 cells × 10m → ~100m board.
 * Walkable solid footprint is CELL_FOOTPRINT metres; the leftover is a real crack.
 */
export const CELL_PITCH = 10;
/** Integer solid width/depth of each tile (must be odd so it centres on the cell). */
export const CELL_FOOTPRINT = 7;
/** Visual width of a tile (slightly under the solid footprint so seams read). */
export const CELL_VISUAL = 6.6;
/** Tile height in metres (~10 ft). Stacked as this many unit voxels. */
export const TILE_HEIGHT = 3;
/** Peak jump height in metres (~12 ft) — clears a tile from the crack floor. */
export const JUMP_HEIGHT = 3.66;

/** Bottom voxel Y of a tile column (terrain floor is 0). */
export const TILE_BASE_Y = 0;
/** Top solid voxel Y (box spans [Y, Y+1]); walk surface is Y+1. */
export const TILE_CELL_Y = TILE_BASE_Y + TILE_HEIGHT - 1;
/** Walk surface = top of a tile. */
export const TABLE_TOP = TILE_CELL_Y + 1;
/** Living-room / pit floor. Terrain height is 0 everywhere. */
export const FLOOR_Y = 0;
/** How far you plummet when a trapdoor opens. */
export const FALL_DISTANCE = TABLE_TOP - FLOOR_Y;

/** Player box (human-scale on the big board) + first-person eye height. */
export const PLAYER_HALF_WIDTH = 0.35;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_STEP = 0.55;
export const EYE_HEIGHT = 1.65;
/** Base walk speed; with the engine multiplier this is ~4.2 m/s — corner-to-corner in ~30s. */
export const PLAYER_WALK_SPEED = 2.4;

export const GRAVITY = -22;
/** v = sqrt(2 g h) for JUMP_HEIGHT under |GRAVITY|. */
export const JUMP_VELOCITY = Math.sqrt(2 * Math.abs(GRAVITY) * JUMP_HEIGHT);

/** Blast-off impulse when the board detonates. */
export const BLAST_UP = 18;
export const BLAST_OUT = 22;

/** Companion crew ("your friends") that drop alongside you. */
export const COMPANION_IDS = ["gnome-pib", "gnome-tuck"] as const;

/** Round phases. */
export type Phase = "ready" | "falling" | "revealing" | "boom" | "win";

/** Grace window (seconds) after a safe landing before the crew is lifted back up. */
export const REVEAL_HOLD_SECONDS = 0.9;
/** How long the BOOM screen holds before auto-restart is offered. */
export const BOOM_HOLD_SECONDS = 2.2;

export const STATUS_FEED = "mine.status";

/** World-space centre of the board (used to aim blast impulses outward). */
export const BOARD_CENTER: readonly [number, number] = [
  ((BOARD_N - 1) * CELL_PITCH) / 2,
  ((BOARD_N - 1) * CELL_PITCH) / 2,
];

/** Catalog ids for cell visual states. */
export const CELL_HIDDEN = "cell-hidden";
export const CELL_FLAG = "cell-flag";
export const CELL_SAFE = "cell-safe";
export const CELL_RIM = "cell-rim";
export const CELL_PILLAR = "cell-pillar";

/** World X/Z of a board cell centre. */
export const cellWorld = (col: number, row: number): readonly [number, number] => [
  col * CELL_PITCH,
  row * CELL_PITCH,
];

/** Half-extent of the solid footprint in cell offsets. */
export const FOOTPRINT_RADIUS = (CELL_FOOTPRINT - 1) / 2;

export const cellKey = (col: number, row: number): string => `cell:${col},${row}`;
export const cellSolidKey = (col: number, row: number, lx: number, ly: number, lz: number): string =>
  `cell:${col},${row}:${lx},${ly},${lz}`;
export const cellPillarKey = (col: number, row: number): string => `pillar:${col},${row}`;
