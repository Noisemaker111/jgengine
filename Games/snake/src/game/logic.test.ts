import { describe, expect, test } from "bun:test";

import { seededRng } from "@jgengine/core/random/rng";

import {
  DIR_DOWN,
  DIR_LEFT,
  DIR_RIGHT,
  DIR_UP,
  GRID_H,
  GRID_W,
  MIN_INTERVAL_MS,
  SPEEDUP_MS,
  START_INTERVAL_MS,
  START_LENGTH,
  bufferTurn,
  createInitialState,
  freeCells,
  intervalForScore,
  spawnFood,
  step,
  type Cell,
  type Dir,
  type SnakeState,
} from "./logic";

const constant = (value: number) => () => value;

function makeState(over: Partial<SnakeState> & { snake: readonly Cell[]; dir: Dir }): SnakeState {
  const snake = over.snake;
  return {
    mode: over.mode ?? "walled",
    phase: over.phase ?? "playing",
    snake,
    dir: over.dir,
    pendingDir: over.pendingDir ?? null,
    food: over.food ?? null,
    score: over.score ?? snake.length - START_LENGTH,
    length: snake.length,
    intervalMs: over.intervalMs ?? intervalForScore(0),
    ticks: over.ticks ?? 0,
    lastAteTick: over.lastAteTick ?? 0,
    streak: over.streak ?? 0,
    grewAtTick: over.grewAtTick ?? -100,
    deathCause: over.deathCause ?? null,
    won: over.won ?? false,
  };
}

const occupies = (snake: readonly Cell[], c: Cell) => snake.some((p) => p.x === c.x && p.y === c.y);

const HORIZONTAL: Cell[] = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
];

describe("movement", () => {
  test("advances the head one cell and drags the tail when not eating", () => {
    const state = makeState({ snake: HORIZONTAL, dir: DIR_RIGHT, food: { x: 0, y: 0 } });
    const next = step(state, constant(0));
    expect(next.snake[0]).toEqual({ x: 11, y: 10 });
    expect(next.snake).toHaveLength(4);
    expect(next.snake).not.toContainEqual({ x: 7, y: 10 });
    expect(next.score).toBe(0);
    expect(next.food).toEqual({ x: 0, y: 0 });
  });

  test("a buffered turn is applied on the next step", () => {
    const state = bufferTurn(makeState({ snake: HORIZONTAL, dir: DIR_RIGHT, food: { x: 0, y: 0 } }), DIR_DOWN);
    const next = step(state, constant(0));
    expect(next.dir).toEqual(DIR_DOWN);
    expect(next.snake[0]).toEqual({ x: 10, y: 11 });
  });

  test("wrap mode teleports across the edge instead of dying", () => {
    const snake: Cell[] = [
      { x: GRID_W - 1, y: 10 },
      { x: GRID_W - 2, y: 10 },
      { x: GRID_W - 3, y: 10 },
      { x: GRID_W - 4, y: 10 },
    ];
    const next = step(makeState({ snake, dir: DIR_RIGHT, mode: "wrap", food: { x: 0, y: 5 } }), constant(0));
    expect(next.phase).toBe("playing");
    expect(next.snake[0]).toEqual({ x: 0, y: 10 });
  });
});

describe("growth", () => {
  test("eating food grows by one, scores, respawns food off-snake, and speeds up", () => {
    const state = makeState({ snake: HORIZONTAL, dir: DIR_RIGHT, food: { x: 11, y: 10 } });
    const next = step(state, constant(0));
    expect(next.snake).toHaveLength(5);
    expect(next.score).toBe(1);
    expect(next.snake).toContainEqual({ x: 7, y: 10 });
    expect(next.food).not.toBeNull();
    expect(occupies(next.snake, next.food!)).toBe(false);
    expect(next.intervalMs).toBe(START_INTERVAL_MS - SPEEDUP_MS);
    expect(next.intervalMs).toBeLessThan(state.intervalMs);
  });
});

describe("collision", () => {
  test("running into a wall ends the game in walled mode", () => {
    const snake: Cell[] = [
      { x: GRID_W - 1, y: 10 },
      { x: GRID_W - 2, y: 10 },
      { x: GRID_W - 3, y: 10 },
      { x: GRID_W - 4, y: 10 },
    ];
    const next = step(makeState({ snake, dir: DIR_RIGHT, mode: "walled", food: { x: 0, y: 0 } }), constant(0));
    expect(next.phase).toBe("gameover");
    expect(next.deathCause).toBe("wall");
  });

  test("running into the body ends the game", () => {
    const snake: Cell[] = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 5 },
    ];
    const next = step(makeState({ snake, dir: DIR_UP, food: { x: 0, y: 0 } }), constant(0));
    expect(next.phase).toBe("gameover");
    expect(next.deathCause).toBe("self");
  });

  test("moving into the vacating tail cell is allowed", () => {
    const snake: Cell[] = [
      { x: 5, y: 5 },
      { x: 5, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 5 },
    ];
    const next = step(makeState({ snake, dir: DIR_LEFT, food: { x: 0, y: 0 } }), constant(0));
    expect(next.phase).toBe("playing");
    expect(next.snake[0]).toEqual({ x: 4, y: 5 });
  });
});

describe("food spawn", () => {
  test("never lands on the snake, across many seeds", () => {
    const snake: Cell[] = [];
    for (let i = 0; i < 430; i += 1) snake.push({ x: i % GRID_W, y: Math.floor(i / GRID_W) });
    for (let s = 0; s < 50; s += 1) {
      const food = spawnFood(snake, seededRng(`seed-${s}`));
      expect(food).not.toBeNull();
      expect(occupies(snake, food!)).toBe(false);
      expect(food!.x).toBeGreaterThanOrEqual(0);
      expect(food!.x).toBeLessThan(GRID_W);
    }
  });

  test("returns null only when the board is full", () => {
    const full: Cell[] = [];
    for (let y = 0; y < GRID_H; y += 1) for (let x = 0; x < GRID_W; x += 1) full.push({ x, y });
    expect(freeCells(full)).toHaveLength(0);
    expect(spawnFood(full, constant(0))).toBeNull();
  });

  test("is deterministic for a given seed", () => {
    const snake: Cell[] = [{ x: 10, y: 10 }];
    expect(spawnFood(snake, seededRng("abc"))).toEqual(spawnFood(snake, seededRng("abc")));
  });
});

describe("input buffering", () => {
  test("rejects a 180-degree reversal", () => {
    const state = makeState({ snake: HORIZONTAL, dir: DIR_RIGHT });
    expect(bufferTurn(state, DIR_LEFT)).toBe(state);
  });

  test("rejects a no-op same-direction press", () => {
    const state = makeState({ snake: HORIZONTAL, dir: DIR_RIGHT });
    expect(bufferTurn(state, DIR_RIGHT)).toBe(state);
  });

  test("ignores turns while not playing", () => {
    const state = makeState({ snake: HORIZONTAL, dir: DIR_RIGHT, phase: "start" });
    expect(bufferTurn(state, DIR_UP)).toBe(state);
  });

  test("a second buffered turn never chains into a reversal of the live heading", () => {
    let state = makeState({ snake: HORIZONTAL, dir: DIR_RIGHT, food: { x: 0, y: 0 } });
    state = bufferTurn(state, DIR_UP);
    state = bufferTurn(state, DIR_DOWN);
    const next = step(state, constant(0));
    expect(next.dir).toEqual(DIR_DOWN);
    expect(next.dir).not.toEqual(DIR_LEFT);
  });
});

describe("tick interval", () => {
  test("shrinks per food and floors at the minimum", () => {
    expect(intervalForScore(0)).toBe(START_INTERVAL_MS);
    expect(intervalForScore(1)).toBe(START_INTERVAL_MS - SPEEDUP_MS);
    expect(intervalForScore(10_000)).toBe(MIN_INTERVAL_MS);
  });
});

describe("initial state", () => {
  test("starts centered, food off-snake, moving right", () => {
    const state = createInitialState("walled", seededRng("init"), "playing");
    expect(state.snake).toHaveLength(START_LENGTH);
    expect(state.dir).toEqual(DIR_RIGHT);
    expect(state.food).not.toBeNull();
    expect(occupies(state.snake, state.food!)).toBe(false);
  });
});
