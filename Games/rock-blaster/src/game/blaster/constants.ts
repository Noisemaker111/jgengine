export const FIELD_W = 800;
export const FIELD_H = 600;

export const SHIP_RADIUS = 11;
export const SHIP_TURN_RATE = 3.4;
export const SHIP_THRUST = 340;
export const SHIP_MAX_SPEED = 360;
export const SHIP_NOSE = 16;
export const SHIP_TAIL = 11;

export const BULLET_SPEED = 520;
export const BULLET_RANGE = 520;
export const BULLET_RADIUS = 2.4;
export const MAX_BULLETS = 4;
export const FIRE_COOLDOWN = 0.16;

export const SAUCER_BULLET_SPEED = 300;
export const SAUCER_BULLET_RANGE = 620;

export const ROCK_LARGE = 3;
export const ROCK_MEDIUM = 2;
export const ROCK_SMALL = 1;

export const ROCK_RADIUS: Record<number, number> = { 3: 42, 2: 22, 1: 11 };
export const ROCK_SCORE: Record<number, number> = { 3: 20, 2: 50, 1: 100 };
export const ROCK_SPEED: Record<number, [number, number]> = { 3: [26, 64], 2: [46, 96], 1: [74, 150] };

export const SAUCER_BIG_RADIUS = 20;
export const SAUCER_SMALL_RADIUS = 12;
export const SAUCER_BIG_SCORE = 200;
export const SAUCER_SMALL_SCORE = 1000;
export const SAUCER_SPEED = 92;
export const SAUCER_BIG_FIRE = 1.3;
export const SAUCER_SMALL_FIRE = 0.95;
export const SAUCER_JINK = 1.1;

export const AIM_SPREAD_MAX = 0.92;
export const AIM_SPREAD_MIN = 0.06;
export const AIM_SPREAD_FLOOR_SCORE = 40000;

export const START_LIVES = 3;
export const EXTRA_LIFE_EVERY = 10000;

export const RESPAWN_DELAY = 1.3;
export const SAFE_RADIUS = 130;
export const INVULN_TIME = 2.4;

export const HYPERSPACE_DEATH_CHANCE = 0.13;
export const WAVE_CLEAR_DELAY = 1.1;
export const SAUCER_FIRST_DELAY = 11;
export const SAUCER_MIN_GAP = 8;
export const SAUCER_MAX_GAP = 17;

export const SHAKE_ON_DEATH = 13;
export const SHAKE_DECAY = 26;

export const RECORD_KEY = "rock-blaster/records.v1";
export const STAR_COUNT = 90;
