import {
  GOAL_X,
  SIDE_HIT_HALF_X,
  SIDE_HIT_HALF_Y,
  STOMP_CLEAR_Y,
  STOMP_HALF_X,
  STOMP_MIN_FALL_SPEED,
} from "./tuning";

export interface PatrolState {
  x: number;
  dir: number;
}

export function patrolStep(
  state: PatrolState,
  center: number,
  span: number,
  speed: number,
  dt: number,
): PatrolState {
  const min = center - span;
  const max = center + span;
  let dir = state.dir === 0 ? 1 : Math.sign(state.dir);
  let x = state.x + dir * speed * dt;
  if (x <= min) {
    x = min;
    dir = 1;
  } else if (x >= max) {
    x = max;
    dir = -1;
  }
  return { x, dir };
}

export interface BodyXY {
  readonly x: number;
  readonly y: number;
}

export function isStomp(player: BodyXY, verticalVelocity: number, enemy: BodyXY): boolean {
  const descending = verticalVelocity <= -STOMP_MIN_FALL_SPEED;
  const above = player.y - enemy.y >= STOMP_CLEAR_Y;
  const aligned = Math.abs(player.x - enemy.x) <= STOMP_HALF_X;
  return descending && above && aligned;
}

export function isSideHit(player: BodyXY, enemy: BodyXY): boolean {
  const alignedX = Math.abs(player.x - enemy.x) <= SIDE_HIT_HALF_X;
  const alignedY = Math.abs(player.y - enemy.y) <= SIDE_HIT_HALF_Y;
  return alignedX && alignedY;
}

export function reachedGoal(playerX: number): boolean {
  return playerX <= GOAL_X;
}
