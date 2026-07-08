export const PLAYER = "hopper";
export const ENEMY = "stomper";

export const GOAL_OBJECT = "goalPost";
export const PLATFORM_OBJECT = "backdropPlatform";

export const GROUND_Y = 0;
export const SPAWN: readonly [number, number, number] = [4, GROUND_Y, 0];

export const MAX_HEALTH = 3;

export const RUN_AXIS_MIN = -52;
export const RUN_AXIS_MAX = 6;
export const GOAL_X = -48;

export const STOMP_MIN_FALL_SPEED = 0.4;
export const STOMP_CLEAR_Y = 0.5;
export const STOMP_HALF_X = 1;

export const SIDE_HIT_HALF_X = 0.85;
export const SIDE_HIT_HALF_Y = 0.75;
export const HIT_INVULN_SEC = 1.3;

export interface EnemyPatrol {
  readonly id: string;
  readonly center: number;
  readonly span: number;
  readonly speed: number;
}

export const ENEMIES: readonly EnemyPatrol[] = [
  { id: "stomper-1", center: -14, span: 5, speed: 2.2 },
  { id: "stomper-2", center: -30, span: 6, speed: 2.7 },
  { id: "stomper-3", center: -42, span: 3, speed: 3.2 },
];

export const STOMP_SCORE = 1;

export const HAZARD_OBJECT = "spikeTrap";
export const HAZARD_HALF_X = 0.6;
export const HAZARD_HALF_Y = 0.5;

export interface Hazard {
  readonly id: string;
  readonly x: number;
}

export const HAZARDS: readonly Hazard[] = [
  { id: "spike-1", x: -4 },
  { id: "spike-2", x: -22 },
  { id: "spike-3", x: -38 },
];

export const COIN_OBJECT = "coin";
export const COIN_RADIUS = 0.9;
export const COIN_SCORE = 1;
export const COIN_HEIGHT = 0.9;

export interface Collectible {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export const COINS: readonly Collectible[] = [
  { id: "coin-1", x: -1, y: COIN_HEIGHT },
  { id: "coin-2", x: -9, y: COIN_HEIGHT },
  { id: "coin-3", x: -17, y: COIN_HEIGHT },
  { id: "coin-4", x: -25, y: COIN_HEIGHT },
  { id: "coin-5", x: -33, y: COIN_HEIGHT },
  { id: "coin-6", x: -41, y: COIN_HEIGHT },
];

export interface BackdropPlatform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const BACKDROP_PLATFORMS: readonly BackdropPlatform[] = [
  { x: -6, y: 2.4, z: -7 },
  { x: -18, y: 3.6, z: -8 },
  { x: -27, y: 2.1, z: -6.5 },
  { x: -38, y: 4.2, z: -8 },
  { x: -46, y: 2.8, z: -7 },
];

export const STATUS_FEED = "level.status";
export type LevelResult = "won" | "lost";
