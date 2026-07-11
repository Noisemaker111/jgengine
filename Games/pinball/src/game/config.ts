export const DEFAULT_SEED = "bally-1978";

export const TABLE = { width: 216, height: 384 };
export const CX = TABLE.width / 2;

export const BALL_R = 5;

export const GRAVITY = 340;
export const MAX_SPEED = 780;
export const MICRO_LEN = BALL_R * 0.5;
export const MIN_SUBSTEPS = 4;
export const MAX_SUBSTEPS = 40;

export const WALL_E = 0.46;
export const BARRIER_E = 0.42;

export const BUMPER_R = 9;
export const BUMPER_E = 0.4;
export const BUMPER_KICK = 178;
export const BUMPER_SCORE = 100;

export const SLING_E = 0.4;
export const SLING_KICK = 150;
export const SLING_SCORE = 50;

export const FLIPPER_LEN = 40;
export const FLIPPER_CAP_R = 6;
export const FLIPPER_E = 0.34;
export const FLIPPER_RATE = 19;
export const FLIPPER_RETURN_RATE = 12;
export const PIVOT_Y = 316;
export const LEFT_PIVOT_X = 68;
export const RIGHT_PIVOT_X = 148;
export const LEFT_REST = (42 * Math.PI) / 180;
export const LEFT_ACTIVE = (-3 * Math.PI) / 180;
export const RIGHT_REST = Math.PI - LEFT_REST;
export const RIGHT_ACTIVE = Math.PI - LEFT_ACTIVE;

export const DRAIN_Y = 374;

export const LANE_X = 198;
export const LANE_REST_Y = 360;
export const LAUNCH_MIN = 400;
export const LAUNCH_MAX = 720;
export const LAUNCH_DRIFT = 34;
export const PLUNGER_CHARGE_RATE = 1.5;

export const BALLS_PER_GAME = 3;
export const SAVER_SECONDS = 5;

export const ROLLOVER_LABELS = ["A", "L", "L"] as const;
export const ROLLOVER_SCORE = 120;
export const ROLLOVER_COMPLETE_SCORE = 1000;
export const MULTIPLIERS = [1, 2, 3, 5] as const;

export const DROP_SCORE = 260;
export const DROP_BANK_COUNT = 4;
export const SPOT_BONUS = 5000;
export const EXTRA_BALL_ON_COMPLETION = 3;

export const TILT_LIMIT = 3;
export const TILT_WINDOW = 3.2;
export const NUDGE_VX = 62;
export const NUDGE_VY = 46;

export const BONUS_PER_EVENT = 1;

export const MESSAGE_SECONDS = 2.4;
export const SCORE_FEED_LIMIT = 6;
