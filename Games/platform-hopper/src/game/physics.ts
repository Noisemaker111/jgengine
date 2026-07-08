import {
  COIN_RADIUS,
  GOAL_X,
  HAZARD_HALF_X,
  HAZARD_HALF_Y,
  SIDE_HIT_HALF_X,
  SIDE_HIT_HALF_Y,
  SPAWN,
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

function overlapsBody(a: BodyXY, b: BodyXY, halfX: number, halfY: number): boolean {
  return Math.abs(a.x - b.x) <= halfX && Math.abs(a.y - b.y) <= halfY;
}

export function isSideHit(player: BodyXY, enemy: BodyXY): boolean {
  return overlapsBody(player, enemy, SIDE_HIT_HALF_X, SIDE_HIT_HALF_Y);
}

export function isHazardHit(player: BodyXY, hazard: BodyXY): boolean {
  return overlapsBody(player, hazard, HAZARD_HALF_X, HAZARD_HALF_Y);
}

export function isCoinCollected(player: BodyXY, coin: BodyXY): boolean {
  return Math.hypot(player.x - coin.x, player.y - coin.y) <= COIN_RADIUS;
}

export function reachedGoal(playerX: number): boolean {
  return playerX <= GOAL_X;
}

export function goalProgress(playerX: number): number {
  const total = SPAWN[0] - GOAL_X;
  if (total <= 0) return 1;
  const traveled = SPAWN[0] - playerX;
  return Math.min(1, Math.max(0, traveled / total));
}
