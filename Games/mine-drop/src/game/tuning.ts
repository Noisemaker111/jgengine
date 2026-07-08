// Mine Drop — shared constants. All world coordinates are in game units.
// A tiny person is ~0.9u tall; the room furniture is giant around them to sell
// the "little people on a coffee table" fantasy.

/** Minesweeper board is BOARD_N x BOARD_N cells, one world unit per cell. */
export const BOARD_N = 7;
/** Hidden bombs seeded across the board. */
export const BOMB_COUNT = 8;

/** Solid tile cells live at this voxel Y (box spans [Y, Y+1]); their top face is the walk surface. */
export const TILE_CELL_Y = 4;
/** Walk surface = top of a tile = the tabletop. Feet rest here. */
export const TABLE_TOP = TILE_CELL_Y + 1; // 5
/** Living-room floor / pit floor. Terrain height is 0 everywhere, so this is where a dropped player lands. */
export const FLOOR_Y = 0;
/** Drama number: how far you plummet when a trapdoor opens. */
export const FALL_DISTANCE = TABLE_TOP - FLOOR_Y; // 5

/** Player box (tiny person) + first-person eye height. */
export const PLAYER_HALF_WIDTH = 0.22;
export const PLAYER_HEIGHT = 0.9;
export const PLAYER_STEP = 0.34;
export const EYE_HEIGHT = 0.9;

export const GRAVITY = -18;
export const JUMP_VELOCITY = 5.2;

/** Blast-off impulse when the board detonates. */
export const BLAST_UP = 14;
export const BLAST_OUT = 9;

/** Companion crew ("your friends") that leap alongside you. */
export const COMPANION_IDS = ["gnome-pib", "gnome-tuck"] as const;

/** Round phases. */
export type Phase = "ready" | "countdown" | "falling" | "revealing" | "boom" | "win";

/** Seconds the 3-2-1 leap countdown runs before everyone jumps. */
export const COUNTDOWN_SECONDS = 1.6;
/** Grace window (seconds) after a safe landing before the crew is lifted back up. */
export const REVEAL_HOLD_SECONDS = 0.9;
/** How long the BOOM screen holds before auto-restart is offered. */
export const BOOM_HOLD_SECONDS = 2.2;

export const STATUS_FEED = "mine.status";

/** World-space centre of the board (used to aim blast impulses outward). */
export const BOARD_CENTER: readonly [number, number] = [(BOARD_N - 1) / 2, (BOARD_N - 1) / 2];

/** Catalog ids for cell visual states. */
export const CELL_HIDDEN = "cell-hidden";
export const CELL_FLAG = "cell-flag";
export const CELL_SAFE = "cell-safe"; // revealed, recoloured per adjacency number via visual.color
export const CELL_RIM = "cell-rim"; // thin lip around an open shaft (decoration, non-solid)

/** World id of the tabletop board group anchor (decoration). */
export const cellKey = (col: number, row: number): string => `cell:${col},${row}`;
