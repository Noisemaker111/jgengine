export const COLS = 13;
export const ROWS = 13;
export const TILE = 40;
export const FIELD_W = COLS * TILE;
export const FIELD_H = ROWS * TILE;

export const START_ROW = 0;
export const MEDIAN_ROW = 6;
export const HOME_ROW = 12;
export const ROAD_ROWS: readonly number[] = [1, 2, 3, 4, 5];
export const RIVER_ROWS: readonly number[] = [7, 8, 9, 10, 11];

export const BAY_COLS: readonly number[] = [0, 3, 6, 9, 12];
export const HOME_TOLERANCE = 0.5;
export const START_COL = 6;

export const OFF_MIN = -0.5;
export const OFF_MAX = COLS - 1 + 0.5;

export const LANE_SPAN = 18;
export const WRAP_MIN = -4;

export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const EXTRA_LIFE_SCORE = 5000;

export const TIME_LIMIT = 30;
export const SCORE_FORWARD = 10;
export const SCORE_HOME = 50;
export const SCORE_ALL_HOMES = 1000;
export const SCORE_FLY = 200;
export const TIME_BONUS_PER_UNIT = 10;

export const HOP_ANIM = 0.12;
export const DEATH_ANIM = 1.15;
export const CLEAR_ANIM = 2.0;
export const BANNER_SECONDS = 2.2;

export const PARALLAX_SPEED = 0.35;

export const FLY_MIN_DELAY = 6;
export const FLY_MAX_DELAY = 13;
export const FLY_DURATION = 5.5;

export const DIVE_CYCLE = 6.5;
export const DIVE_DOWN_BASE = 1.6;
export const DIVE_DOWN_PER_LEVEL = 0.4;
export const DIVE_DOWN_MAX = 3.6;
export const DIVE_BLINK = 0.95;

export const LEVEL_SPEED_STEP = 0.14;
export const TRAFFIC_STEP_LEVELS = 2;
export const TRAFFIC_MAX_EXTRA = 3;

export const RECORD_KEY = "road-hopper/records";
