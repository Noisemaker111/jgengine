import type { Difficulty } from "./match/state";

export const COURT_W = 200;
export const COURT_H = 120;

export const PADDLE_H = 18;
export const PADDLE_W = 3.4;
export const PADDLE_HALF = PADDLE_H / 2;
export const LEFT_X = 8;
export const RIGHT_X = COURT_W - 8;

export const BALL_SIZE = 3.2;
export const BALL_HALF = BALL_SIZE / 2;

export const SERVE_SPEED = 82;
export const MAX_SPEED = 172;
export const VOLLEY_SPEEDUP = 1.035;
export const MAX_BOUNCE_ANGLE = (55 * Math.PI) / 180;
export const BALL_MAX_VERTICAL_SPEED = MAX_SPEED * Math.sin(MAX_BOUNCE_ANGLE);

export const PADDLE_SPEED = 148;
export const DRAG_SPEED = 460;
export const AI_RETURN_SPEED_FACTOR = 0.55;

export const SERVE_PAUSE = 1.6;
export const SERVE_ALTERNATE_EVERY = 5;
export const WIN_SCORE = 11;

export const HIT_FLASH_TIME = 0.16;
export const EDGE_PULSE_TIME = 0.5;
export const TRAIL_LENGTH = 14;

export interface AiProfile {
  readonly speed: number;
  readonly reaction: number;
  readonly aimError: number;
}

export const AI_TABLE: Readonly<Record<Difficulty, AiProfile>> = {
  easy: { speed: 70, reaction: 0.32, aimError: 22 },
  medium: { speed: 106, reaction: 0.16, aimError: 10 },
  hard: { speed: 130, reaction: 0.07, aimError: 3 },
};
