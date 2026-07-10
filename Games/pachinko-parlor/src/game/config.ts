export const DEFAULT_SEED = "hanamura-1";

export const BOARD = { width: 200, height: 300 };

export const WALL = 9;
export const CEIL = 12;

export const BALL_RADIUS = 2.6;
export const PEG_RADIUS = 1.7;

export const GRAVITY = 250;
export const RESTITUTION = 0.5;
export const WALL_RESTITUTION = 0.62;
export const BOUNCE_JITTER = 0.14;
export const MAX_SPEED = 380;

export const LAUNCH_X = BOARD.width - WALL - BALL_RADIUS - 0.4;
export const LAUNCH_Y = BOARD.height - 22;
export const LAUNCH_SPEED_MIN = 262;
export const LAUNCH_SPEED_MAX = 366;
export const LAUNCH_ANGLE = 0.235;

export const FIELD_TOP = 44;
export const FIELD_BOTTOM = 244;
export const CATCH_Y = 268;

export const START_BANK = 50;
export const LAUNCH_COST = 1;
export const AUTO_FIRE_INTERVAL = 0.7;
export const POWER_CYCLE_RATE = 1.45;
export const POWER_SWEET = 0.66;

export const FEVER_DURATION = 15;
export const FEVER_GATE_TARGET = 3;
export const GATE_PAYOUT = 10;
export const GATE_FEVER_PAYOUT = 25;

export const WINS_FEED_LIMIT = 8;
export const BANK_HISTORY_LIMIT = 48;
export const MAX_BALLS = 24;
