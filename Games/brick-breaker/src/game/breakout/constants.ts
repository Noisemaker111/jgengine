export const FIELD_W = 480;
export const FIELD_H = 540;

export const BRICK_COLS = 12;
export const MAX_BRICK_ROWS = 16;
export const BRICK_W = FIELD_W / BRICK_COLS;
export const BRICK_H = 22;
export const BRICK_TOP = 54;
export const BRICK_INSET = 1.5;

export const PADDLE_W = 84;
export const PADDLE_H = 13;
export const PADDLE_Y = FIELD_H - 30;
export const PADDLE_SPEED = 600;
export const WIDE_PADDLE_MULT = 1.6;

export const BALL_R = 6.5;
export const BALL_BASE_SPEED = 400;
export const BALL_MAX_SPEED = 640;
export const BALL_SPEED_PER_HIT = 4;
export const BALL_SPEED_PER_LEVEL = 14;
export const SLOW_BALL_MULT = 0.6;
export const MIN_VERTICAL_DIR = 0.22;
export const BALL_TRAIL_LENGTH = 12;

export const MAX_BOUNCE_DEG = 62;
export const SERVE_SPREAD = 0.34;

export const START_LIVES = 3;
export const MAX_LIVES = 6;
export const MAX_BALLS = 8;

export const POWERUP_DROP_CHANCE = 0.15;
export const POWERUP_FALL_SPEED = 155;
export const POWERUP_W = 32;
export const POWERUP_H = 16;

export const WIDE_PADDLE_SECONDS = 20;
export const SLOW_BALL_SECONDS = 10;

export const BANNER_SECONDS = 2.2;
export const MESSAGE_SECONDS = 1.3;

export const TIER_SCORE: Readonly<Record<1 | 2 | 3, number>> = { 1: 60, 2: 100, 3: 160 };
export const COMBO_STEP = 25;

export const RECORD_KEY = "brick-breaker/records";
