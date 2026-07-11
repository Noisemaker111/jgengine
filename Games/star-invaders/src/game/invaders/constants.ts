export const FIELD_W = 224;
export const FIELD_H = 256;

export const COLS = 11;
export const ROWS = 5;
export const CELL_W = 16;
export const CELL_H = 14;
export const CELL_SLOT_W = 12;

export const FORMATION_X = Math.round((FIELD_W - (COLS - 1) * CELL_W - CELL_SLOT_W) / 2);
export const FORMATION_Y = 40;
export const WAVE_DROP = 12;
export const WAVE_DROP_MAX = 48;

export const STEP_X = 4;
export const STEP_Y = 10;
export const EDGE_MARGIN = 8;

export const MARCH_SLOW = 0.82;
export const MARCH_FAST = 0.055;
export const MARCH_FLOOR = 0.028;
export const WAVE_SPEEDUP = 0.86;

export const CANNON_W = 13;
export const CANNON_H = 8;
export const CANNON_Y = FIELD_H - 22;
export const CANNON_SPEED = 108;
export const CANNON_MIN_X = EDGE_MARGIN;
export const CANNON_MAX_X = FIELD_W - EDGE_MARGIN - CANNON_W;

export const SHOT_W = 1;
export const SHOT_H = 5;
export const SHOT_SPEED = 300;

export const BOMB_W = 2;
export const BOMB_H = 6;
export const BOMB_BASE_SPEED = 82;
export const BOMB_SPEED_PER_WAVE = 8;
export const BOMB_BASE_INTERVAL = 1.15;
export const BOMB_INTERVAL_PER_WAVE = 0.9;
export const BOMB_INTERVAL_FLOOR = 0.34;
export const BOMB_MAX_BASE = 1;
export const BOMB_MAX_CAP = 4;

export const BUNKER_COUNT = 4;
export const BUNKER_COLS = 11;
export const BUNKER_ROWS = 8;
export const BUNKER_BLOCK = 2;
export const BUNKER_W = BUNKER_COLS * BUNKER_BLOCK;
export const BUNKER_H = BUNKER_ROWS * BUNKER_BLOCK;
export const BUNKER_Y = 188;

export const INVASION_Y = BUNKER_Y + 6;

export const SAUCER_W = 16;
export const SAUCER_H = 7;
export const SAUCER_Y = 26;
export const SAUCER_SPEED = 46;
export const SAUCER_PERIOD = 21;
export const SAUCER_FIRST_DELAY = 12;

export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const EXTRA_LIFE_AT = 1500;

export const RESPAWN_SECONDS = 1.4;
export const CLEAR_BANNER_SECONDS = 2.0;
export const MESSAGE_SECONDS = 1.3;

export const TIER_SCORE = [30, 20, 20, 10, 10] as const;

export const RECORD_KEY = "star-invaders/records";
