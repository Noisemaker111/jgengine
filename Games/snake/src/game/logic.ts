export type Mode = "walled" | "wrap";
export type Phase = "start" | "playing" | "paused" | "gameover";
export type DeathCause = "wall" | "self";

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Dir {
  readonly x: number;
  readonly y: number;
}

export const GRID_W = 21;
export const GRID_H = 21;
export const START_LENGTH = 4;

export const START_INTERVAL_MS = 150;
export const MIN_INTERVAL_MS = 60;
export const SPEEDUP_MS = 5;
export const FAST_PICKUP_TICKS = 12;

export const DIR_UP: Dir = { x: 0, y: -1 };
export const DIR_DOWN: Dir = { x: 0, y: 1 };
export const DIR_LEFT: Dir = { x: -1, y: 0 };
export const DIR_RIGHT: Dir = { x: 1, y: 0 };

export interface SnakeState {
  readonly mode: Mode;
  readonly phase: Phase;
  readonly snake: readonly Cell[];
  readonly dir: Dir;
  readonly pendingDir: Dir | null;
  readonly food: Cell | null;
  readonly score: number;
  readonly length: number;
  readonly intervalMs: number;
  readonly ticks: number;
  readonly lastAteTick: number;
  readonly streak: number;
  readonly grewAtTick: number;
  readonly deathCause: DeathCause | null;
  readonly won: boolean;
}

/** Tick interval shrinks one `SPEEDUP_MS` step per food eaten, floored at `MIN_INTERVAL_MS`. */
export function intervalForScore(score: number): number {
  return Math.max(MIN_INTERVAL_MS, START_INTERVAL_MS - score * SPEEDUP_MS);
}

export function isReverse(a: Dir, b: Dir): boolean {
  return a.x === -b.x && a.y === -b.y;
}

export function sameDir(a: Dir, b: Dir): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Every board cell not currently occupied by the snake, in row-major order. */
export function freeCells(snake: readonly Cell[]): Cell[] {
  const taken = new Set<number>();
  for (const c of snake) taken.add(c.y * GRID_W + c.x);
  const out: Cell[] = [];
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      if (!taken.has(y * GRID_W + x)) out.push({ x, y });
    }
  }
  return out;
}

/** A food cell drawn from the free cells with the supplied RNG. Never lands on the snake. `null` when the board is full (a win). */
export function spawnFood(snake: readonly Cell[], rng: () => number): Cell | null {
  const free = freeCells(snake);
  if (free.length === 0) return null;
  const index = Math.min(free.length - 1, Math.floor(rng() * free.length));
  return free[index] ?? null;
}

export function createInitialState(mode: Mode, rng: () => number, phase: Phase = "start"): SnakeState {
  const midY = Math.floor(GRID_H / 2);
  const headX = Math.floor(GRID_W / 2);
  const snake: Cell[] = [];
  for (let i = 0; i < START_LENGTH; i += 1) snake.push({ x: headX - i, y: midY });
  return {
    mode,
    phase,
    snake,
    dir: DIR_RIGHT,
    pendingDir: null,
    food: spawnFood(snake, rng),
    score: 0,
    length: snake.length,
    intervalMs: intervalForScore(0),
    ticks: 0,
    lastAteTick: 0,
    streak: 0,
    grewAtTick: -100,
    deathCause: null,
    won: false,
  };
}

/**
 * Buffers at most one turn per tick. Rejects a 180° reversal and a no-op
 * repeat. The reversal check is against the live heading (`state.dir`), so any
 * accepted turn is at most 90° from the current heading — a later buffered turn
 * can never chain into a reversal of the direction the snake is actually moving.
 */
export function bufferTurn(state: SnakeState, dir: Dir): SnakeState {
  if (state.phase !== "playing") return state;
  if (isReverse(state.dir, dir)) return state;
  if (sameDir(state.dir, dir)) return state;
  if (state.pendingDir !== null && sameDir(state.pendingDir, dir)) return state;
  return { ...state, pendingDir: dir };
}

/** Advances the snake one grid step. Only acts while `phase === "playing"`. */
export function step(state: SnakeState, rng: () => number): SnakeState {
  if (state.phase !== "playing") return state;

  const dir = state.pendingDir ?? state.dir;
  const head = state.snake[0]!;
  const ticks = state.ticks + 1;

  let nx = head.x + dir.x;
  let ny = head.y + dir.y;

  if (state.mode === "wrap") {
    nx = (nx + GRID_W) % GRID_W;
    ny = (ny + GRID_H) % GRID_H;
  } else if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) {
    return { ...state, phase: "gameover", dir, pendingDir: null, deathCause: "wall", ticks };
  }

  const willGrow = state.food !== null && nx === state.food.x && ny === state.food.y;

  // The tail cell vacates this step unless the snake grows, so it is not an obstacle.
  const bodyCount = willGrow ? state.snake.length : state.snake.length - 1;
  for (let i = 0; i < bodyCount; i += 1) {
    const c = state.snake[i]!;
    if (c.x === nx && c.y === ny) {
      return { ...state, phase: "gameover", dir, pendingDir: null, deathCause: "self", ticks };
    }
  }

  const newHead: Cell = { x: nx, y: ny };
  const newSnake: Cell[] = [newHead, ...state.snake];
  if (!willGrow) {
    newSnake.pop();
    return { ...state, snake: newSnake, dir, pendingDir: null, length: newSnake.length, ticks };
  }

  const score = state.score + 1;
  const fastPickup = state.score > 0 && ticks - state.lastAteTick <= FAST_PICKUP_TICKS;
  const food = spawnFood(newSnake, rng);
  const won = food === null;
  return {
    ...state,
    snake: newSnake,
    dir,
    pendingDir: null,
    food,
    score,
    length: newSnake.length,
    intervalMs: intervalForScore(score),
    ticks,
    lastAteTick: ticks,
    streak: fastPickup ? state.streak + 1 : 0,
    grewAtTick: ticks,
    phase: won ? "gameover" : "playing",
    won,
  };
}
