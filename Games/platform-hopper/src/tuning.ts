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
  { id: "stomper-1", center: -14, span: 5, speed: 2.3 },
  { id: "stomper-2", center: -30, span: 6, speed: 2.9 },
  { id: "stomper-3", center: -42, span: 3, speed: 2.1 },
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
