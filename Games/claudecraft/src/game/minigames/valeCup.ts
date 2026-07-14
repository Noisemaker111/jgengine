import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { COPPER } from "../model";
import { teleportHero } from "../session/hero";

export const VALE_CUP_ENTRANCE: readonly [number, number] = [-38, -288];
export const VALE_CUP_PITCH: readonly [number, number] = [-70, -260];
export const VALE_CUP_STADIUM = "vale_cup_pitch";
export const MATCH_DURATION_SEC = 60;
export const GOAL_REWARD_COPPER = 25;

export interface ValeCupView {
  active: boolean;
  scoreHome: number;
  scoreAway: number;
  timeLeft: number;
  ball: readonly [number, number];
  wager: number;
  result: "playing" | "win" | "loss" | "draw" | null;
}

interface MatchState {
  scoreHome: number;
  scoreAway: number;
  endsAt: number;
  ball: { x: number; z: number; vx: number; vz: number };
  wager: number;
  returnPos: readonly [number, number];
  result: ValeCupView["result"];
}

const matchesOf = perContext(() => new Map<string, MatchState>());

const PITCH_HALF_W = 14;
const PITCH_HALF_D = 22;
const BALL_RADIUS = 0.6;
const KICK_SPEED = 14;

export function placeValeCup(ctx: GameContext): void {
  const [x, z] = VALE_CUP_ENTRANCE;
  ctx.scene.object.place(VALE_CUP_STADIUM, x, ctx.world.groundHeightAt(x, z), z);
}

export function startValeCup(ctx: GameContext, userId: string, wager = 0): boolean {
  if (matchesOf(ctx).has(userId)) return false;
  const hero = ctx.scene.entity.get(userId);
  if (hero === null) return false;
  const spend = Math.max(0, Math.floor(wager));
  if (spend > 0 && ctx.game.economy.charge(userId, COPPER, spend) !== null) {
    ctx.scene.entity.floatText({ instanceId: userId, text: "Not enough copper to wager", kind: "info" });
    return false;
  }
  const [px, pz] = VALE_CUP_PITCH;
  const state: MatchState = {
    scoreHome: 0,
    scoreAway: 0,
    endsAt: ctx.time.now() + MATCH_DURATION_SEC,
    ball: { x: px, z: pz, vx: 0, vz: 0 },
    wager: spend,
    returnPos: [hero.position[0], hero.position[2]],
    result: "playing",
  };
  matchesOf(ctx).set(userId, state);
  teleportHero(ctx, userId, px, pz + 8);
  sync(ctx, userId);
  ctx.scene.entity.floatText({ instanceId: userId, text: "Vale Cup kickoff!", kind: "info" });
  return true;
}

export function kickValeCup(ctx: GameContext, userId: string, dirX: number, dirZ: number): boolean {
  const match = matchesOf(ctx).get(userId);
  if (match === undefined || match.result !== "playing") return false;
  const hero = ctx.scene.entity.get(userId);
  if (hero === null) return false;
  const dx = match.ball.x - hero.position[0];
  const dz = match.ball.z - hero.position[2];
  if (Math.hypot(dx, dz) > 3.2) {
    ctx.scene.entity.floatText({ instanceId: userId, text: "Too far from the ball", kind: "info" });
    return false;
  }
  let nx = dirX;
  let nz = dirZ;
  const len = Math.hypot(nx, nz);
  if (len < 0.01) {
    nx = -dx;
    nz = -dz;
  }
  const nlen = Math.hypot(nx, nz) || 1;
  match.ball.vx = (nx / nlen) * KICK_SPEED;
  match.ball.vz = (nz / nlen) * KICK_SPEED;
  sync(ctx, userId);
  return true;
}

export function leaveValeCup(ctx: GameContext, userId: string): boolean {
  const match = matchesOf(ctx).get(userId);
  if (match === undefined) return false;
  teleportHero(ctx, userId, match.returnPos[0], match.returnPos[1]);
  matchesOf(ctx).delete(userId);
  ctx.game.store.delete(`valecup:${userId}`);
  return true;
}

export function tickValeCup(ctx: GameContext, userId: string, dt: number): void {
  const match = matchesOf(ctx).get(userId);
  if (match === undefined || match.result !== "playing") return;
  const [cx, cz] = VALE_CUP_PITCH;
  match.ball.x += match.ball.vx * dt;
  match.ball.z += match.ball.vz * dt;
  match.ball.vx *= 0.96;
  match.ball.vz *= 0.96;
  if (Math.abs(match.ball.vx) < 0.05) match.ball.vx = 0;
  if (Math.abs(match.ball.vz) < 0.05) match.ball.vz = 0;

  if (match.ball.x < cx - PITCH_HALF_W + BALL_RADIUS) {
    match.ball.x = cx - PITCH_HALF_W + BALL_RADIUS;
    match.ball.vx *= -0.6;
  }
  if (match.ball.x > cx + PITCH_HALF_W - BALL_RADIUS) {
    match.ball.x = cx + PITCH_HALF_W - BALL_RADIUS;
    match.ball.vx *= -0.6;
  }

  if (match.ball.z > cz + PITCH_HALF_D - BALL_RADIUS) {
    if (Math.abs(match.ball.x - cx) < 4) {
      match.scoreHome += 1;
      resetBall(match);
      ctx.scene.entity.floatText({ instanceId: userId, text: "GOAL! Vale scores", kind: "info" });
      ctx.game.economy.grant(userId, COPPER, GOAL_REWARD_COPPER);
    } else {
      match.ball.z = cz + PITCH_HALF_D - BALL_RADIUS;
      match.ball.vz *= -0.6;
    }
  }
  if (match.ball.z < cz - PITCH_HALF_D + BALL_RADIUS) {
    if (Math.abs(match.ball.x - cx) < 4) {
      match.scoreAway += 1;
      resetBall(match);
      ctx.scene.entity.floatText({ instanceId: userId, text: "Goal against!", kind: "info" });
    } else {
      match.ball.z = cz - PITCH_HALF_D + BALL_RADIUS;
      match.ball.vz *= -0.6;
    }
  }

  const hero = ctx.scene.entity.get(userId);
  if (hero !== null && Math.random() < dt * 0.35) {
    const awayKick = Math.hypot(match.ball.x - cx, match.ball.z - (cz - 6));
    if (awayKick < 10) {
      match.ball.vx += (Math.random() - 0.5) * 6;
      match.ball.vz -= 8 + Math.random() * 4;
    }
  }

  if (ctx.time.now() >= match.endsAt) {
    finish(ctx, userId, match);
  }
  sync(ctx, userId);
}

function resetBall(match: MatchState): void {
  const [cx, cz] = VALE_CUP_PITCH;
  match.ball = { x: cx, z: cz, vx: 0, vz: 0 };
}

function finish(ctx: GameContext, userId: string, match: MatchState): void {
  if (match.scoreHome > match.scoreAway) {
    match.result = "win";
    if (match.wager > 0) ctx.game.economy.grant(userId, COPPER, match.wager * 2);
    ctx.scene.entity.floatText({ instanceId: userId, text: "Vale Cup victory!", kind: "info" });
  } else if (match.scoreHome < match.scoreAway) {
    match.result = "loss";
    ctx.scene.entity.floatText({ instanceId: userId, text: "Vale Cup defeat", kind: "info" });
  } else {
    match.result = "draw";
    if (match.wager > 0) ctx.game.economy.grant(userId, COPPER, match.wager);
    ctx.scene.entity.floatText({ instanceId: userId, text: "Vale Cup draw", kind: "info" });
  }
  sync(ctx, userId);
}

function sync(ctx: GameContext, userId: string): void {
  const match = matchesOf(ctx).get(userId);
  if (match === undefined) {
    ctx.game.store.delete(`valecup:${userId}`);
    return;
  }
  const view: ValeCupView = {
    active: true,
    scoreHome: match.scoreHome,
    scoreAway: match.scoreAway,
    timeLeft: Math.max(0, match.endsAt - ctx.time.now()),
    ball: [match.ball.x, match.ball.z],
    wager: match.wager,
    result: match.result,
  };
  ctx.game.store.set(`valecup:${userId}`, view);
}

export function valeCupActive(ctx: GameContext, userId: string): boolean {
  return matchesOf(ctx).has(userId);
}
