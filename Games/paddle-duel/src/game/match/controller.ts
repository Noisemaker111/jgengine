import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import {
  AI_RETURN_SPEED_FACTOR,
  AI_TABLE,
  BALL_HALF,
  COURT_H,
  COURT_W,
  DRAG_SPEED,
  EDGE_PULSE_TIME,
  HIT_FLASH_TIME,
  LEFT_X,
  MAX_BOUNCE_ANGLE,
  PADDLE_HALF,
  PADDLE_SPEED,
  PADDLE_W,
  RIGHT_X,
  SERVE_PAUSE,
  SERVE_SPEED,
  TRAIL_LENGTH,
} from "../rules";
import {
  clampPaddleY,
  isMatchPoint,
  matchWinner,
  paddleBounce,
  serverFor,
  speedUp,
  stepToward,
} from "./sim";
import { BASE_SEED, type Difficulty, type MatchState, type Mode, type Side } from "./state";
import { bumpUi, getMatch, getRecords, type RecordField } from "./store";

function difficultyOf(mode: Mode): Difficulty | null {
  switch (mode) {
    case "ai-easy":
      return "easy";
    case "ai-medium":
      return "medium";
    case "ai-hard":
      return "hard";
    default:
      return null;
  }
}

function resetEffects(m: MatchState): void {
  m.hitFlashL = 0;
  m.hitFlashR = 0;
  m.edgePulseL = 0;
  m.edgePulseR = 0;
  m.trail.length = 0;
  m.aiTimer = 0;
  m.aiTargetY = COURT_H / 2;
  m.leftInput.dragActive = false;
  m.matchPointL = false;
  m.matchPointR = false;
}

function syncPhase(ctx: GameContext, m: MatchState): void {
  setGamePhase(ctx, m.phase === "menu" ? "menu" : m.phase === "gameover" ? "ended" : m.paused ? "paused" : "playing");
}

function centerBall(m: MatchState): void {
  m.ball.x = COURT_W / 2;
  m.ball.y = COURT_H / 2;
  m.ball.vx = 0;
  m.ball.vy = 0;
}

function beginServe(m: MatchState): void {
  m.phase = "serve";
  m.serveCountdown = SERVE_PAUSE;
  m.volley = 0;
  m.ballSpeed = SERVE_SPEED;
  m.trail.length = 0;
  centerBall(m);
  m.matchPointL = isMatchPoint(m.scoreL, m.scoreR);
  m.matchPointR = isMatchPoint(m.scoreR, m.scoreL);
}

function launchServe(m: MatchState): void {
  const dir = m.server === "L" ? 1 : -1;
  const spread = (m.rng() * 2 - 1) * 0.6;
  const angle = spread * MAX_BOUNCE_ANGLE;
  centerBall(m);
  m.ballSpeed = SERVE_SPEED;
  m.ball.vx = dir * SERVE_SPEED * Math.cos(angle);
  m.ball.vy = SERVE_SPEED * Math.sin(angle);
  m.phase = "rally";
  m.trail.length = 0;
}

export function startMatch(ctx: GameContext, mode: Mode): void {
  const m = getMatch(ctx);
  m.matchIndex += 1;
  m.rng = seededRng(BASE_SEED + m.matchIndex);
  m.mode = mode;
  m.scoreL = 0;
  m.scoreR = 0;
  m.firstServer = "L";
  m.server = "L";
  m.winner = null;
  m.paused = false;
  m.left.y = COURT_H / 2;
  m.right.y = COURT_H / 2;
  resetEffects(m);
  beginServe(m);
  bumpUi(ctx);
  syncPhase(ctx, m);
}

export function togglePause(ctx: GameContext): void {
  const m = getMatch(ctx);
  if (m.phase === "serve" || m.phase === "rally") {
    m.paused = !m.paused;
    bumpUi(ctx);
    syncPhase(ctx, m);
  }
}

export function launchNow(ctx: GameContext): void {
  const m = getMatch(ctx);
  if (m.phase === "serve" && !m.paused) m.serveCountdown = 0;
}

export function rematch(ctx: GameContext): void {
  const m = getMatch(ctx);
  if (m.mode !== null) startMatch(ctx, m.mode);
}

export function toMenu(ctx: GameContext): void {
  const m = getMatch(ctx);
  m.mode = null;
  m.phase = "menu";
  m.paused = false;
  m.winner = null;
  resetEffects(m);
  centerBall(m);
  bumpUi(ctx);
  syncPhase(ctx, m);
}

function recordWin(ctx: GameContext, m: MatchState, winner: Side): void {
  if (winner !== "L" || m.mode === null) return;
  const field = difficultyOf(m.mode);
  if (field === null) return;
  const book = getRecords(ctx);
  const current = book.bestOf(field) ?? 0;
  const run: Partial<Record<RecordField, number>> = {};
  run[field] = current + 1;
  book.submit(run);
}

function scorePoint(ctx: GameContext, m: MatchState, scorer: Side): void {
  if (scorer === "L") {
    m.scoreL += 1;
    m.edgePulseR = EDGE_PULSE_TIME;
  } else {
    m.scoreR += 1;
    m.edgePulseL = EDGE_PULSE_TIME;
  }
  const winner = matchWinner(m.scoreL, m.scoreR);
  if (winner !== null) {
    m.phase = "gameover";
    m.winner = winner;
    centerBall(m);
    recordWin(ctx, m, winner);
    bumpUi(ctx);
    syncPhase(ctx, m);
    return;
  }
  m.server = serverFor(m.scoreL + m.scoreR, m.firstServer);
  beginServe(m);
  bumpUi(ctx);
}

function decayEffects(m: MatchState, dt: number): void {
  m.hitFlashL = Math.max(0, m.hitFlashL - dt);
  m.hitFlashR = Math.max(0, m.hitFlashR - dt);
  m.edgePulseL = Math.max(0, m.edgePulseL - dt);
  m.edgePulseR = Math.max(0, m.edgePulseR - dt);
}

function movePaddles(ctx: GameContext, m: MatchState, dt: number): void {
  if (m.leftInput.dragActive) {
    m.left.y = stepToward(m.left.y, clampPaddleY(m.leftInput.dragY), DRAG_SPEED * dt);
  } else {
    const dir = (ctx.input.isDown("leftDown") ? 1 : 0) - (ctx.input.isDown("leftUp") ? 1 : 0);
    if (dir !== 0) m.left.y = clampPaddleY(m.left.y + dir * PADDLE_SPEED * dt);
  }

  if (m.mode === "two-player") {
    const dir = (ctx.input.isDown("rightDown") ? 1 : 0) - (ctx.input.isDown("rightUp") ? 1 : 0);
    if (dir !== 0) m.right.y = clampPaddleY(m.right.y + dir * PADDLE_SPEED * dt);
    return;
  }
  stepAi(m, dt);
}

function stepAi(m: MatchState, dt: number): void {
  if (m.mode === null) return;
  const difficulty = difficultyOf(m.mode);
  if (difficulty === null) return;
  const profile = AI_TABLE[difficulty];
  const approaching = m.phase === "rally" && m.ball.vx > 0;
  if (approaching) {
    m.aiTimer += dt;
    if (m.aiTimer >= profile.reaction) {
      m.aiTimer = 0;
      m.aiTargetY = m.ball.y + (m.rng() * 2 - 1) * profile.aimError;
    }
    m.right.y = clampPaddleY(stepToward(m.right.y, clampPaddleY(m.aiTargetY), profile.speed * dt));
  } else {
    m.right.y = clampPaddleY(stepToward(m.right.y, COURT_H / 2, profile.speed * AI_RETURN_SPEED_FACTOR * dt));
  }
}

function stepBall(ctx: GameContext, m: MatchState, dt: number): boolean {
  m.ball.x += m.ball.vx * dt;
  m.ball.y += m.ball.vy * dt;

  if (m.ball.y < BALL_HALF) {
    m.ball.y = BALL_HALF;
    m.ball.vy = Math.abs(m.ball.vy);
  } else if (m.ball.y > COURT_H - BALL_HALF) {
    m.ball.y = COURT_H - BALL_HALF;
    m.ball.vy = -Math.abs(m.ball.vy);
  }

  const leftFace = LEFT_X + PADDLE_W / 2;
  if (m.ball.vx < 0 && m.ball.x <= leftFace + BALL_HALF && m.ball.x >= LEFT_X) {
    if (Math.abs(m.ball.y - m.left.y) <= PADDLE_HALF + BALL_HALF) {
      m.ballSpeed = speedUp(m.ballSpeed);
      const v = paddleBounce(m.ball.y, m.left.y, PADDLE_HALF, m.ballSpeed, 1);
      m.ball.vx = v.vx;
      m.ball.vy = v.vy;
      m.ball.x = leftFace + BALL_HALF;
      m.volley += 1;
      m.hitFlashL = HIT_FLASH_TIME;
      bumpUi(ctx);
      return true;
    }
  }

  const rightFace = RIGHT_X - PADDLE_W / 2;
  if (m.ball.vx > 0 && m.ball.x >= rightFace - BALL_HALF && m.ball.x <= RIGHT_X) {
    if (Math.abs(m.ball.y - m.right.y) <= PADDLE_HALF + BALL_HALF) {
      m.ballSpeed = speedUp(m.ballSpeed);
      const v = paddleBounce(m.ball.y, m.right.y, PADDLE_HALF, m.ballSpeed, -1);
      m.ball.vx = v.vx;
      m.ball.vy = v.vy;
      m.ball.x = rightFace - BALL_HALF;
      m.volley += 1;
      m.hitFlashR = HIT_FLASH_TIME;
      bumpUi(ctx);
      return true;
    }
  }

  if (m.ball.x < -BALL_HALF) {
    scorePoint(ctx, m, "R");
    return false;
  }
  if (m.ball.x > COURT_W + BALL_HALF) {
    scorePoint(ctx, m, "L");
    return false;
  }
  return true;
}

function advanceBall(ctx: GameContext, m: MatchState, dt: number): void {
  const distance = Math.hypot(m.ball.vx, m.ball.vy) * dt;
  const steps = Math.max(1, Math.ceil(distance / (BALL_HALF * 0.8)));
  const sub = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    stepBall(ctx, m, sub);
    if (m.phase !== "rally") return;
  }
  m.trail.push({ x: m.ball.x, y: m.ball.y });
  while (m.trail.length > TRAIL_LENGTH) m.trail.shift();
}

export function tick(ctx: GameContext, dt: number): void {
  const m = getMatch(ctx);
  if (m.mode === null || m.phase === "menu" || m.phase === "gameover") return;
  if (m.paused || dt <= 0) return;
  decayEffects(m, dt);
  movePaddles(ctx, m, dt);
  if (m.phase === "serve") {
    m.serveCountdown -= dt;
    if (m.serveCountdown <= 0) {
      launchServe(m);
      bumpUi(ctx);
    }
    return;
  }
  advanceBall(ctx, m, dt);
}
