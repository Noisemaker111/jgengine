import { describe, expect, test } from "bun:test";

import { FIELD_W, START_LIVES } from "./constants";
import { TOTAL_LEVELS } from "./levels";
import { createBrickBreakerStore, type BrickBreakerStore } from "./store";

const DT = 1 / 120;

function lowestBall(store: BrickBreakerStore): { x: number; y: number } | undefined {
  const balls = store.getState().balls;
  if (balls.length === 0) return undefined;
  return balls.reduce((low, ball) => (ball.y > low.y ? ball : low));
}

/** Aim each return at the nearest remaining brick so the ball drills through, and relaunch after a loss. */
function autoplay(store: BrickBreakerStore, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    const state = store.getState();
    if (state.status === "serve") store.launch();
    const ball = lowestBall(store);
    if (ball !== undefined) {
      const half = state.paddle.w / 2;
      let offset = ball.x < FIELD_W / 2 ? 0.5 : -0.5;
      if (state.bricks.length > 0) {
        const target = state.bricks.reduce((best, b) =>
          Math.abs(b.x + b.w / 2 - ball.x) < Math.abs(best.x + best.w / 2 - ball.x) ? b : best,
        );
        const targetX = target.x + target.w / 2;
        offset = Math.max(-0.85, Math.min(0.85, (targetX - ball.x) / 110));
      }
      store.setPointerX(ball.x - offset * half);
    }
    store.tick(DT);
  }
}

/** Keep the paddle on the opposite side of the ball so every serve is eventually lost. */
function dodge(store: BrickBreakerStore, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    const state = store.getState();
    if (state.status === "serve") store.launch();
    const ball = lowestBall(store);
    if (ball !== undefined) store.setPointerX(ball.x > FIELD_W / 2 ? 0 : FIELD_W);
    store.tick(DT);
  }
}

describe("initial state", () => {
  test("begins on level 1 in serve with one ball and three lives", () => {
    const store = createBrickBreakerStore("init");
    const state = store.getState();
    expect(state.status).toBe("serve");
    expect(state.balls.length).toBe(1);
    expect(state.level).toBe(1);
    expect(state.lives).toBe(START_LIVES);
    expect(state.bricksLeft).toBeGreaterThan(0);
    expect(state.totalLevels).toBe(TOTAL_LEVELS);
  });

  test("launch sends the ball upward into play", () => {
    const store = createBrickBreakerStore("launch");
    const startY = store.getState().balls[0]!.y;
    store.launch();
    expect(store.getState().status).toBe("playing");
    for (let i = 0; i < 12; i += 1) store.tick(DT);
    expect(store.getState().balls[0]!.y).toBeLessThan(startY);
  });
});

describe("brick collision and scoring", () => {
  test("rallying destroys bricks and scores points", () => {
    const store = createBrickBreakerStore("rally");
    const initial = store.getState().bricksLeft;
    autoplay(store, 8);
    const state = store.getState();
    expect(state.bricksLeft).toBeLessThan(initial);
    expect(state.score).toBeGreaterThan(0);
    expect(state.maxCombo).toBeGreaterThanOrEqual(1);
  });

  test("sustained rally clears a level and advances", () => {
    const store = createBrickBreakerStore("advance");
    autoplay(store, 160);
    expect(store.getState().level).toBeGreaterThanOrEqual(2);
  });
});

describe("losing", () => {
  test("missing the ball costs a life", () => {
    const store = createBrickBreakerStore("dodge");
    dodge(store, 8);
    expect(store.getState().lives).toBeLessThan(START_LIVES);
  });

  test("running out of lives ends the game", () => {
    const store = createBrickBreakerStore("gameover");
    dodge(store, 40);
    const state = store.getState();
    expect(state.status).toBe("gameover");
    expect(state.lives).toBe(0);
  });
});

describe("determinism", () => {
  test("identical seed and inputs produce identical runs", () => {
    const a = createBrickBreakerStore("same-seed");
    const b = createBrickBreakerStore("same-seed");
    autoplay(a, 10);
    autoplay(b, 10);
    const sa = a.getState();
    const sb = b.getState();
    expect(sa.score).toBe(sb.score);
    expect(sa.bricksLeft).toBe(sb.bricksLeft);
    expect(sa.level).toBe(sb.level);
    expect(sa.lives).toBe(sb.lives);
  });
});
