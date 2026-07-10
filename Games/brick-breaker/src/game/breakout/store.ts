import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import { seededRng } from "@jgengine/core/random/rng";

import {
  BALL_BASE_SPEED,
  BALL_MAX_SPEED,
  BALL_R,
  BALL_SPEED_PER_HIT,
  BALL_SPEED_PER_LEVEL,
  BALL_TRAIL_LENGTH,
  BANNER_SECONDS,
  BRICK_H,
  BRICK_W,
  COMBO_STEP,
  FIELD_H,
  FIELD_W,
  MAX_BALLS,
  MAX_LIVES,
  MESSAGE_SECONDS,
  PADDLE_H,
  PADDLE_SPEED,
  PADDLE_W,
  PADDLE_Y,
  POWERUP_DROP_CHANCE,
  POWERUP_FALL_SPEED,
  POWERUP_H,
  POWERUP_W,
  RECORD_KEY,
  SERVE_SPREAD,
  SLOW_BALL_MULT,
  SLOW_BALL_SECONDS,
  START_LIVES,
  TIER_SCORE,
  WIDE_PADDLE_MULT,
  WIDE_PADDLE_SECONDS,
} from "./constants";
import {
  circleRectHit,
  clamp,
  enforceVertical,
  normalize,
  paddleBounceDir,
  reflect,
  rotate,
  type Vec2,
} from "./geometry";
import { brickBounds, isBreakable, LEVELS, parseLevel, TOTAL_LEVELS, type BrickKind } from "./levels";
import { pickPowerup, type PowerupType } from "./powerups";

export type GameStatus = "serve" | "playing" | "gameover" | "victory";

export interface BrickView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly kind: BrickKind;
  readonly hp: number;
  readonly maxHp: number;
}

export interface BallView {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly trail: readonly Vec2[];
}

export interface PowerupView {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly type: PowerupType;
}

export interface PaddleView {
  readonly cx: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly wide: boolean;
}

export interface BrickBreakerSnapshot {
  readonly status: GameStatus;
  readonly paused: boolean;
  readonly bricks: readonly BrickView[];
  readonly balls: readonly BallView[];
  readonly powerups: readonly PowerupView[];
  readonly paddle: PaddleView;
  readonly score: number;
  readonly best: number;
  readonly lives: number;
  readonly level: number;
  readonly levelName: string;
  readonly totalLevels: number;
  readonly bricksLeft: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly wideMs: number;
  readonly slowMs: number;
  readonly ballSpeed: number;
  readonly bannerText: string | null;
  readonly bannerMs: number;
  readonly message: string | null;
  readonly newBest: boolean;
}

interface Brick {
  id: number;
  col: number;
  row: number;
  kind: BrickKind;
  hp: number;
  maxHp: number;
}

interface Ball {
  x: number;
  y: number;
  dir: Vec2;
  trail: Vec2[];
}

interface Powerup {
  x: number;
  y: number;
  type: PowerupType;
}

interface MutableState {
  status: GameStatus;
  paused: boolean;
  bricks: Brick[];
  balls: Ball[];
  powerups: Powerup[];
  paddleCx: number;
  levelIndex: number;
  score: number;
  best: number;
  lives: number;
  paddleHits: number;
  combo: number;
  maxCombo: number;
  wideTimer: number;
  slowTimer: number;
  bannerTimer: number;
  bannerText: string | null;
  message: string | null;
  messageTimer: number;
  moveLeft: boolean;
  moveRight: boolean;
  pointerX: number | null;
  usePointer: boolean;
  newBest: boolean;
  rng: () => number;
  runSeed: number;
  nextBrickId: number;
}

export interface BrickBreakerStore {
  getState(): BrickBreakerSnapshot;
  subscribe(listener: (snapshot: BrickBreakerSnapshot) => void): () => void;
  reset(seed?: string | number): void;
  setMoveInput(left: boolean, right: boolean): void;
  setPointerX(x: number | null): void;
  launch(): void;
  togglePause(): void;
  tick(dt: number): void;
  preview(): void;
}

function resolveStorage(): RecordStorage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    return null;
  }
  return null;
}

export function createBrickBreakerStore(seed: string | number = "brick-breaker"): BrickBreakerStore {
  const listeners = new Set<(snapshot: BrickBreakerSnapshot) => void>();
  const records = createRecordBook<"score">({ key: RECORD_KEY, fields: { score: "higher" }, storage: resolveStorage() });

  const state: MutableState = {
    status: "serve",
    paused: false,
    bricks: [],
    balls: [],
    powerups: [],
    paddleCx: FIELD_W / 2,
    levelIndex: 0,
    score: 0,
    best: records.bestOf("score") ?? 0,
    lives: START_LIVES,
    paddleHits: 0,
    combo: 0,
    maxCombo: 0,
    wideTimer: 0,
    slowTimer: 0,
    bannerTimer: 0,
    bannerText: null,
    message: null,
    messageTimer: 0,
    moveLeft: false,
    moveRight: false,
    pointerX: null,
    usePointer: false,
    newBest: false,
    rng: seededRng(seed),
    runSeed: 0,
    nextBrickId: 1,
  };

  let snapshot: BrickBreakerSnapshot;

  function paddleHalfWidth(): number {
    return (state.wideTimer > 0 ? PADDLE_W * WIDE_PADDLE_MULT : PADDLE_W) / 2;
  }

  function baseBallSpeed(): number {
    return Math.min(BALL_MAX_SPEED, BALL_BASE_SPEED + state.paddleHits * BALL_SPEED_PER_HIT + state.levelIndex * BALL_SPEED_PER_LEVEL);
  }

  function currentBallSpeed(): number {
    return baseBallSpeed() * (state.slowTimer > 0 ? SLOW_BALL_MULT : 1);
  }

  function loadLevel(index: number): void {
    const def = LEVELS[index]!;
    state.bricks = parseLevel(def).map((brick) => {
      const maxHp = isBreakable(brick.kind) ? (brick.kind as 1 | 2 | 3) : Infinity;
      return { id: state.nextBrickId++, col: brick.col, row: brick.row, kind: brick.kind, hp: maxHp, maxHp };
    });
    state.powerups = [];
    state.balls = [];
    state.combo = 0;
    state.status = "serve";
    state.bannerText = `Level ${index + 1} — ${def.name}`;
    state.bannerTimer = BANNER_SECONDS;
    resetBallToPaddle();
  }

  function resetBallToPaddle(): void {
    state.balls = [
      { x: state.paddleCx, y: PADDLE_Y - BALL_R - 1, dir: { x: 0, y: -1 }, trail: [] },
    ];
  }

  function breakableLeft(): number {
    let count = 0;
    for (const brick of state.bricks) if (isBreakable(brick.kind)) count += 1;
    return count;
  }

  function setMessage(text: string): void {
    state.message = text;
    state.messageTimer = MESSAGE_SECONDS;
  }

  function submitScore(): void {
    const result = records.submit({ score: state.score });
    state.best = result.best.score ?? state.best;
    state.newBest = result.improved.includes("score") && state.score > 0;
  }

  function reset(nextSeed?: string | number): void {
    state.runSeed += 1;
    state.rng = seededRng(nextSeed ?? `${seed}:${state.runSeed}`);
    state.levelIndex = 0;
    state.score = 0;
    state.lives = START_LIVES;
    state.paddleHits = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.wideTimer = 0;
    state.slowTimer = 0;
    state.message = null;
    state.messageTimer = 0;
    state.paused = false;
    state.newBest = false;
    state.paddleCx = FIELD_W / 2;
    state.pointerX = null;
    state.usePointer = false;
    state.best = records.bestOf("score") ?? 0;
    loadLevel(0);
    emit();
  }

  function launch(): void {
    if (state.paused || state.status !== "serve") return;
    const spread = (state.rng() * 2 - 1) * SERVE_SPREAD;
    const dir = paddleBounceDir(spread);
    for (const ball of state.balls) ball.dir = dir;
    state.status = "playing";
    state.combo = 0;
    emit();
  }

  function togglePause(): void {
    if (state.status === "gameover" || state.status === "victory") return;
    state.paused = !state.paused;
    emit();
  }

  function setMoveInput(left: boolean, right: boolean): void {
    state.moveLeft = left;
    state.moveRight = right;
    if (left || right) state.usePointer = false;
  }

  function setPointerX(x: number | null): void {
    if (x === null) {
      state.pointerX = null;
      return;
    }
    state.pointerX = x;
    state.usePointer = true;
  }

  function updatePaddle(dt: number): void {
    const half = paddleHalfWidth();
    let cx = state.paddleCx;
    const keyDir = (state.moveRight ? 1 : 0) - (state.moveLeft ? 1 : 0);
    if (keyDir !== 0) {
      cx += keyDir * PADDLE_SPEED * dt;
    } else if (state.usePointer && state.pointerX !== null) {
      cx = state.pointerX;
    }
    state.paddleCx = clamp(cx, half, FIELD_W - half);
  }

  function damageBrick(brick: Brick): void {
    if (!isBreakable(brick.kind)) return;
    brick.hp -= 1;
    if (brick.hp > 0) return;
    state.bricks = state.bricks.filter((b) => b.id !== brick.id);
    state.combo += 1;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    const tier = brick.kind as 1 | 2 | 3;
    const comboBonus = Math.max(0, state.combo - 1) * COMBO_STEP;
    state.score += TIER_SCORE[tier] + comboBonus;
    if (state.combo >= 4) setMessage(`Combo x${state.combo}`);
    maybeDropPowerup(brick);
  }

  function maybeDropPowerup(brick: Brick): void {
    if (state.rng() >= POWERUP_DROP_CHANCE) return;
    const bounds = brickBounds(brick);
    state.powerups.push({
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
      type: pickPowerup(state.rng()),
    });
  }

  function applyPowerup(type: PowerupType): void {
    switch (type) {
      case "multiball":
        splitBalls();
        setMessage("Multiball!");
        break;
      case "wide":
        state.wideTimer = WIDE_PADDLE_SECONDS;
        setMessage("Wide Paddle");
        break;
      case "slow":
        state.slowTimer = SLOW_BALL_SECONDS;
        setMessage("Slow Ball");
        break;
      case "life":
        state.lives = Math.min(MAX_LIVES, state.lives + 1);
        setMessage("Extra Life");
        break;
    }
  }

  function splitBalls(): void {
    const target = Math.min(MAX_BALLS, Math.max(3, state.balls.length * 3));
    const spawned: Ball[] = [];
    let index = 0;
    while (state.balls.length + spawned.length < target && state.balls.length > 0) {
      const source = state.balls[index % state.balls.length]!;
      const angle = 18 + (index % 3) * 10;
      const dir = enforceVertical(rotate(source.dir, index % 2 === 0 ? angle : -angle));
      spawned.push({ x: source.x, y: source.y, dir, trail: [] });
      index += 1;
    }
    state.balls = state.balls.concat(spawned);
  }

  function bounceOffPaddle(ball: Ball): boolean {
    if (ball.dir.y <= 0) return false;
    const half = paddleHalfWidth();
    const left = state.paddleCx - half;
    const right = state.paddleCx + half;
    const top = PADDLE_Y;
    if (ball.y + BALL_R < top || ball.y - BALL_R > top + PADDLE_H) return false;
    if (ball.x < left - BALL_R || ball.x > right + BALL_R) return false;
    const offset = clamp((ball.x - state.paddleCx) / half, -1, 1);
    ball.dir = paddleBounceDir(offset);
    ball.y = top - BALL_R - 0.5;
    state.paddleHits += 1;
    state.combo = 0;
    return true;
  }

  function stepBall(ball: Ball, distance: number): void {
    ball.x += ball.dir.x * distance;
    ball.y += ball.dir.y * distance;

    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.dir = enforceVertical({ x: Math.abs(ball.dir.x), y: ball.dir.y });
    } else if (ball.x > FIELD_W - BALL_R) {
      ball.x = FIELD_W - BALL_R;
      ball.dir = enforceVertical({ x: -Math.abs(ball.dir.x), y: ball.dir.y });
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.dir = enforceVertical({ x: ball.dir.x, y: Math.abs(ball.dir.y) });
    }

    for (const brick of state.bricks) {
      const bounds = brickBounds(brick);
      const hit = circleRectHit(ball.x, ball.y, BALL_R, bounds.x, bounds.y, bounds.w, bounds.h);
      if (!hit.hit) continue;
      ball.dir = reflect(ball.dir, hit.nx, hit.ny);
      if (hit.nx !== 0) ball.x += hit.nx * 0.5;
      if (hit.ny !== 0) ball.y += hit.ny * 0.5;
      damageBrick(brick);
      break;
    }

    bounceOffPaddle(ball);
  }

  function advanceBalls(dt: number): void {
    const speed = currentBallSpeed();
    const maxStep = BALL_R;
    for (const ball of state.balls) {
      const distance = speed * dt;
      const steps = Math.max(1, Math.min(24, Math.ceil(distance / maxStep)));
      const sub = distance / steps;
      for (let i = 0; i < steps; i += 1) stepBall(ball, sub);
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > BALL_TRAIL_LENGTH) ball.trail.shift();
    }
    state.balls = state.balls.filter((ball) => ball.y - BALL_R <= FIELD_H);
  }

  function advancePowerups(dt: number): void {
    const half = paddleHalfWidth();
    const left = state.paddleCx - half;
    const right = state.paddleCx + half;
    const kept: Powerup[] = [];
    for (const powerup of state.powerups) {
      powerup.y += POWERUP_FALL_SPEED * dt;
      const caught =
        powerup.y + POWERUP_H / 2 >= PADDLE_Y &&
        powerup.y - POWERUP_H / 2 <= PADDLE_Y + PADDLE_H &&
        powerup.x >= left - POWERUP_W / 2 &&
        powerup.x <= right + POWERUP_W / 2;
      if (caught) {
        applyPowerup(powerup.type);
        continue;
      }
      if (powerup.y - POWERUP_H / 2 <= FIELD_H) kept.push(powerup);
    }
    state.powerups = kept;
  }

  function loseLife(): void {
    state.lives -= 1;
    state.combo = 0;
    state.powerups = [];
    if (state.lives <= 0) {
      state.lives = 0;
      state.status = "gameover";
      submitScore();
      return;
    }
    state.status = "serve";
    setMessage("Ball lost");
    resetBallToPaddle();
  }

  function advanceLevel(): void {
    if (state.levelIndex + 1 >= TOTAL_LEVELS) {
      state.status = "victory";
      submitScore();
      return;
    }
    state.levelIndex += 1;
    loadLevel(state.levelIndex);
  }

  function tickTimers(dt: number): void {
    if (state.wideTimer > 0) state.wideTimer = Math.max(0, state.wideTimer - dt);
    if (state.slowTimer > 0) state.slowTimer = Math.max(0, state.slowTimer - dt);
    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      if (state.messageTimer === 0) state.message = null;
    }
  }

  function tick(dt: number): void {
    if (dt <= 0) {
      emit();
      return;
    }
    if (state.paused || state.status === "gameover" || state.status === "victory") {
      emit();
      return;
    }
    const step = Math.min(dt, 0.05);
    tickTimers(step);
    updatePaddle(step);

    if (state.status === "serve") {
      const ball = state.balls[0];
      if (ball !== undefined) {
        ball.x = state.paddleCx;
        ball.y = PADDLE_Y - BALL_R - 1;
        ball.trail = [];
      }
      emit();
      return;
    }

    advanceBalls(step);
    advancePowerups(step);

    if (breakableLeft() === 0) {
      advanceLevel();
    } else if (state.balls.length === 0) {
      loseLife();
    }
    emit();
  }

  function preview(): void {
    reset("preview");
    state.levelIndex = 2;
    loadLevel(2);
    state.status = "playing";
    state.score = 3260;
    state.lives = 2;
    state.paddleHits = 24;
    state.combo = 4;
    state.maxCombo = 6;
    state.wideTimer = 14.4;
    state.slowTimer = 6.1;
    state.paddleCx = FIELD_W * 0.56;
    // clear a few bricks to show progress
    state.bricks = state.bricks.filter((_, i) => i % 5 !== 0);
    state.balls = [
      {
        x: FIELD_W * 0.44,
        y: FIELD_H * 0.52,
        dir: normalize(0.5, -0.86),
        trail: [
          { x: FIELD_W * 0.36, y: FIELD_H * 0.62 },
          { x: FIELD_W * 0.38, y: FIELD_H * 0.59 },
          { x: FIELD_W * 0.4, y: FIELD_H * 0.57 },
          { x: FIELD_W * 0.42, y: FIELD_H * 0.545 },
        ],
      },
      { x: FIELD_W * 0.62, y: FIELD_H * 0.4, dir: normalize(-0.4, -0.92), trail: [] },
    ];
    state.powerups = [{ x: FIELD_W * 0.5, y: FIELD_H * 0.66, type: "wide" }];
    state.bannerTimer = 0;
    state.message = "Combo x4";
    state.messageTimer = MESSAGE_SECONDS;
    emit();
  }

  function buildSnapshot(): BrickBreakerSnapshot {
    const half = paddleHalfWidth();
    return {
      status: state.status,
      paused: state.paused,
      bricks: state.bricks.map((brick) => {
        const bounds = brickBounds(brick);
        return {
          id: brick.id,
          x: bounds.x,
          y: bounds.y,
          w: bounds.w,
          h: bounds.h,
          kind: brick.kind,
          hp: brick.hp,
          maxHp: brick.maxHp,
        };
      }),
      balls: state.balls.map((ball) => ({ x: ball.x, y: ball.y, r: BALL_R, trail: ball.trail.slice() })),
      powerups: state.powerups.map((p) => ({ x: p.x, y: p.y, w: POWERUP_W, h: POWERUP_H, type: p.type })),
      paddle: { cx: state.paddleCx, y: PADDLE_Y, w: half * 2, h: PADDLE_H, wide: state.wideTimer > 0 },
      score: state.score,
      best: Math.max(state.best, state.score),
      lives: state.lives,
      level: state.levelIndex + 1,
      levelName: LEVELS[state.levelIndex]!.name,
      totalLevels: TOTAL_LEVELS,
      bricksLeft: breakableLeft(),
      combo: state.combo,
      maxCombo: state.maxCombo,
      wideMs: state.wideTimer,
      slowMs: state.slowTimer,
      ballSpeed: baseBallSpeed(),
      bannerText: state.bannerTimer > 0 ? state.bannerText : null,
      bannerMs: state.bannerTimer,
      message: state.messageTimer > 0 ? state.message : null,
      newBest: state.newBest,
    };
  }

  function emit(): void {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  loadLevel(0);
  snapshot = buildSnapshot();

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset,
    setMoveInput,
    setPointerX,
    launch,
    togglePause,
    tick,
    preview,
  };
}

export const brickBreakerStore = createBrickBreakerStore();
