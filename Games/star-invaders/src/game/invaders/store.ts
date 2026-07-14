import { createRecordBook } from "@jgengine/core/game/recordBook";
import { seededRng } from "@jgengine/core/random/rng";

import {
  BOMB_BASE_INTERVAL,
  BOMB_BASE_SPEED,
  BOMB_H,
  BOMB_INTERVAL_FLOOR,
  BOMB_INTERVAL_PER_WAVE,
  BOMB_MAX_BASE,
  BOMB_MAX_CAP,
  BOMB_SPEED_PER_WAVE,
  BOMB_W,
  CANNON_H,
  CANNON_MAX_X,
  CANNON_MIN_X,
  CANNON_SPEED,
  CANNON_W,
  CANNON_Y,
  CELL_H,
  CELL_SLOT_W,
  CELL_W,
  CLEAR_BANNER_SECONDS,
  COLS,
  EXTRA_LIFE_AT,
  FIELD_H,
  FIELD_W,
  FORMATION_X,
  FORMATION_Y,
  INVASION_Y,
  MAX_LIVES,
  MESSAGE_SECONDS,
  RECORD_KEY,
  RESPAWN_SECONDS,
  ROWS,
  SAUCER_FIRST_DELAY,
  SAUCER_H,
  SAUCER_PERIOD,
  SAUCER_SPEED,
  SAUCER_W,
  SAUCER_Y,
  SHOT_H,
  SHOT_SPEED,
  SHOT_W,
  START_LIVES,
  TIER_SCORE,
  WAVE_DROP,
  WAVE_DROP_MAX,
} from "./constants";
import {
  BLAST_BOMB,
  BLAST_SHOT,
  bunkerLeftX,
  cellRect,
  createBunkerCells,
  erodeBunker,
  type BunkerCells,
} from "./bunkers";
import { aabbOverlap, clamp, type Rect } from "./geometry";
import { aliveColumnRange, countAlive, marchInterval, stepFormation } from "./march";
import { saucerScore } from "./saucer";
import { spriteHeight, spriteWidth, TIER_SPRITES } from "./sprites";

export type GameStatus = "start" | "playing" | "gameover";

export interface AlienView {
  readonly x: number;
  readonly y: number;
  readonly row: number;
}

export interface BunkerView {
  readonly x: number;
  readonly cells: BunkerCells;
}

export interface ExplosionView {
  readonly x: number;
  readonly y: number;
}

export interface StarInvadersSnapshot {
  readonly status: GameStatus;
  readonly paused: boolean;
  readonly frame: 0 | 1;
  readonly aliens: readonly AlienView[];
  readonly aliensLeft: number;
  readonly cannonX: number;
  readonly cannonVisible: boolean;
  readonly shot: { readonly x: number; readonly y: number } | null;
  readonly bombs: readonly { readonly x: number; readonly y: number }[];
  readonly saucer: { readonly x: number } | null;
  readonly bunkers: readonly BunkerView[];
  readonly explosions: readonly ExplosionView[];
  readonly score: number;
  readonly best: number;
  readonly lives: number;
  readonly wave: number;
  readonly bannerText: string | null;
  readonly message: string | null;
  readonly newBest: boolean;
}

interface Explosion {
  x: number;
  y: number;
  timer: number;
}

interface MutableState {
  status: GameStatus;
  paused: boolean;
  alive: boolean[][];
  originX: number;
  originY: number;
  dir: 1 | -1;
  frame: 0 | 1;
  marchTimer: number;
  cannonX: number;
  moveLeft: boolean;
  moveRight: boolean;
  pointerX: number | null;
  usePointer: boolean;
  shot: { x: number; y: number } | null;
  bombs: { x: number; y: number }[];
  bombTimer: number;
  saucer: { x: number; dir: 1 | -1 } | null;
  saucerTimer: number;
  explosions: Explosion[];
  bunkers: BunkerCells[];
  score: number;
  best: number;
  lives: number;
  wave: number;
  shotsFired: number;
  awardedExtra: boolean;
  respawnTimer: number;
  bannerText: string | null;
  bannerTimer: number;
  message: string | null;
  messageTimer: number;
  newBest: boolean;
  rng: () => number;
  runSeed: number;
}

export interface StarInvadersStore {
  getState(): StarInvadersSnapshot;
  subscribe(listener: (snapshot: StarInvadersSnapshot) => void): () => void;
  reset(seed?: string | number): void;
  setMoveInput(left: boolean, right: boolean): void;
  setPointerX(x: number | null): void;
  fire(): void;
  togglePause(): void;
  tick(dt: number): void;
  preview(): void;
}

function fullGrid(): boolean[][] {
  const grid: boolean[][] = [];
  for (let r = 0; r < ROWS; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < COLS; c += 1) row.push(true);
    grid.push(row);
  }
  return grid;
}

export function createStarInvadersStore(seed: string | number = "star-invaders"): StarInvadersStore {
  const listeners = new Set<(snapshot: StarInvadersSnapshot) => void>();
  const records = createRecordBook<"score" | "wave">({
    key: RECORD_KEY,
    fields: { score: "higher", wave: "higher" },
  });

  const state: MutableState = {
    status: "start",
    paused: false,
    alive: fullGrid(),
    originX: FORMATION_X,
    originY: FORMATION_Y,
    dir: 1,
    frame: 0,
    marchTimer: 0,
    cannonX: (FIELD_W - CANNON_W) / 2,
    moveLeft: false,
    moveRight: false,
    pointerX: null,
    usePointer: false,
    shot: null,
    bombs: [],
    bombTimer: 0,
    saucer: null,
    saucerTimer: SAUCER_FIRST_DELAY,
    explosions: [],
    bunkers: [],
    score: 0,
    best: records.bestOf("score") ?? 0,
    lives: START_LIVES,
    wave: 1,
    shotsFired: 0,
    awardedExtra: false,
    respawnTimer: 0,
    bannerText: null,
    bannerTimer: 0,
    message: null,
    messageTimer: 0,
    newBest: false,
    rng: seededRng(seed),
    runSeed: 0,
  };

  let snapshot: StarInvadersSnapshot;

  function alienSprite(row: number): readonly string[] {
    return TIER_SPRITES[row]![state.frame];
  }

  function alienRect(row: number, col: number): Rect {
    const sprite = alienSprite(row);
    const w = spriteWidth(sprite);
    const slotX = state.originX + col * CELL_W;
    return {
      x: slotX + (CELL_SLOT_W - w) / 2,
      y: state.originY + row * CELL_H,
      w,
      h: spriteHeight(sprite),
    };
  }

  function cannonRect(): Rect {
    return { x: state.cannonX, y: CANNON_Y, w: CANNON_W, h: CANNON_H };
  }

  function bombSpeed(): number {
    return BOMB_BASE_SPEED + (state.wave - 1) * BOMB_SPEED_PER_WAVE;
  }

  function bombInterval(): number {
    return Math.max(BOMB_INTERVAL_FLOOR, BOMB_BASE_INTERVAL * Math.pow(BOMB_INTERVAL_PER_WAVE, state.wave - 1));
  }

  function maxBombs(): number {
    return Math.min(BOMB_MAX_CAP, BOMB_MAX_BASE + Math.floor(state.wave / 2));
  }

  function setMessage(text: string): void {
    state.message = text;
    state.messageTimer = MESSAGE_SECONDS;
  }

  function addExplosion(x: number, y: number): void {
    state.explosions.push({ x, y, timer: 0.35 });
  }

  function loadWave(nextWave: number, freshBunkers: boolean): void {
    state.wave = nextWave;
    state.alive = fullGrid();
    state.originX = FORMATION_X;
    state.originY = FORMATION_Y + Math.min(WAVE_DROP_MAX, (nextWave - 1) * WAVE_DROP);
    state.dir = 1;
    state.frame = 0;
    state.marchTimer = 0;
    state.shot = null;
    state.bombs = [];
    state.bombTimer = 0;
    state.saucer = null;
    state.saucerTimer = SAUCER_FIRST_DELAY;
    state.respawnTimer = 0;
    if (freshBunkers) state.bunkers = Array.from({ length: 4 }, () => createBunkerCells());
  }

  function reset(nextSeed?: string | number): void {
    state.runSeed += 1;
    state.rng = seededRng(nextSeed ?? `${seed}:${state.runSeed}`);
    state.status = "start";
    state.paused = false;
    state.score = 0;
    state.lives = START_LIVES;
    state.shotsFired = 0;
    state.awardedExtra = false;
    state.newBest = false;
    state.cannonX = (FIELD_W - CANNON_W) / 2;
    state.pointerX = null;
    state.usePointer = false;
    state.explosions = [];
    state.message = null;
    state.messageTimer = 0;
    state.bannerText = null;
    state.bannerTimer = 0;
    state.best = records.bestOf("score") ?? 0;
    loadWave(1, true);
    emit();
  }

  function start(): void {
    if (state.status !== "start") return;
    state.status = "playing";
    emit();
  }

  function fire(): void {
    if (state.status === "start") {
      start();
      return;
    }
    if (state.status !== "playing" || state.paused || state.respawnTimer > 0) return;
    if (state.shot !== null) return;
    state.shot = { x: state.cannonX + CANNON_W / 2 - SHOT_W / 2, y: CANNON_Y - SHOT_H };
    state.shotsFired += 1;
    emit();
  }

  function togglePause(): void {
    if (state.status !== "playing") return;
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

  function updateCannon(dt: number): void {
    let x = state.cannonX;
    const keyDir = (state.moveRight ? 1 : 0) - (state.moveLeft ? 1 : 0);
    if (keyDir !== 0) {
      x += keyDir * CANNON_SPEED * dt;
    } else if (state.usePointer && state.pointerX !== null) {
      x = state.pointerX - CANNON_W / 2;
    }
    state.cannonX = clamp(x, CANNON_MIN_X, CANNON_MAX_X);
  }

  function killAlien(row: number, col: number): void {
    state.alive[row]![col] = false;
    state.score += TIER_SCORE[row]!;
    const rect = alienRect(row, col);
    addExplosion(rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  function bunkerImpact(cells: BunkerCells, leftX: number, rect: Rect, preferBottom: boolean): boolean {
    let bestCol = -1;
    let bestRow = -1;
    for (let r = 0; r < cells.length; r += 1) {
      const cellRow = cells[r]!;
      for (let col = 0; col < cellRow.length; col += 1) {
        if (!cellRow[col]) continue;
        if (!aabbOverlap(rect, cellRect(leftX, col, r))) continue;
        if (bestRow < 0 || (preferBottom ? r > bestRow : r < bestRow)) {
          bestRow = r;
          bestCol = col;
        }
      }
    }
    if (bestRow < 0) return false;
    erodeBunker(cells, bestCol, bestRow, preferBottom ? BLAST_SHOT : BLAST_BOMB);
    return true;
  }

  function resolveShotAt(): boolean {
    const shot = state.shot;
    if (shot === null) return false;
    const rect: Rect = { x: shot.x, y: shot.y, w: SHOT_W, h: SHOT_H };

    if (state.saucer !== null) {
      const sRect: Rect = { x: state.saucer.x, y: SAUCER_Y, w: SAUCER_W, h: SAUCER_H };
      if (aabbOverlap(rect, sRect)) {
        const points = saucerScore(state.shotsFired);
        state.score += points;
        addExplosion(state.saucer.x + SAUCER_W / 2, SAUCER_Y + SAUCER_H / 2);
        setMessage(`Saucer +${points}`);
        state.saucer = null;
        state.shot = null;
        return true;
      }
    }

    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (!state.alive[r]![c]) continue;
        if (aabbOverlap(rect, alienRect(r, c))) {
          killAlien(r, c);
          state.shot = null;
          return true;
        }
      }
    }

    for (let i = 0; i < state.bunkers.length; i += 1) {
      if (bunkerImpact(state.bunkers[i]!, bunkerLeftX(i), rect, true)) {
        state.shot = null;
        return true;
      }
    }
    return false;
  }

  function advanceShot(step: number): void {
    if (state.shot === null) return;
    const distance = SHOT_SPEED * step;
    const subs = Math.max(1, Math.ceil(distance / 2));
    const sub = distance / subs;
    for (let i = 0; i < subs; i += 1) {
      state.shot.y -= sub;
      if (resolveShotAt()) return;
      if (state.shot.y + SHOT_H < 0) {
        state.shot = null;
        return;
      }
    }
  }

  function resolveBombAt(bomb: { x: number; y: number }): "cannon" | "consumed" | null {
    const rect: Rect = { x: bomb.x, y: bomb.y, w: BOMB_W, h: BOMB_H };
    if (state.shot !== null) {
      const shotRect: Rect = { x: state.shot.x, y: state.shot.y, w: SHOT_W, h: SHOT_H };
      if (aabbOverlap(rect, shotRect)) {
        addExplosion(bomb.x, bomb.y);
        state.shot = null;
        return "consumed";
      }
    }
    if (state.respawnTimer <= 0 && aabbOverlap(rect, cannonRect())) {
      return "cannon";
    }
    for (let i = 0; i < state.bunkers.length; i += 1) {
      if (bunkerImpact(state.bunkers[i]!, bunkerLeftX(i), rect, false)) {
        return "consumed";
      }
    }
    return null;
  }

  function advanceBombs(step: number): void {
    const speed = bombSpeed();
    const survivors: { x: number; y: number }[] = [];
    for (const bomb of state.bombs) {
      const distance = speed * step;
      const subs = Math.max(1, Math.ceil(distance / 2));
      const sub = distance / subs;
      let consumed = false;
      for (let i = 0; i < subs; i += 1) {
        bomb.y += sub;
        const result = resolveBombAt(bomb);
        if (result === "cannon") {
          loseLife();
          consumed = true;
          break;
        }
        if (result === "consumed") {
          consumed = true;
          break;
        }
        if (bomb.y > FIELD_H) {
          consumed = true;
          break;
        }
      }
      if (!consumed) survivors.push(bomb);
    }
    state.bombs = survivors;
  }

  function spawnBomb(): void {
    const columns: number[] = [];
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        if (state.alive[r]![c]) {
          columns.push(c);
          break;
        }
      }
    }
    if (columns.length === 0) return;
    const col = columns[Math.floor(state.rng() * columns.length)]!;
    let bottomRow = -1;
    for (let r = ROWS - 1; r >= 0; r -= 1) {
      if (state.alive[r]![col]) {
        bottomRow = r;
        break;
      }
    }
    if (bottomRow < 0) return;
    const rect = alienRect(bottomRow, col);
    state.bombs.push({ x: rect.x + rect.w / 2 - BOMB_W / 2, y: rect.y + rect.h });
  }

  function erodeBunkersUnderAliens(): void {
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (!state.alive[r]![c]) continue;
        const rect = alienRect(r, c);
        for (let b = 0; b < state.bunkers.length; b += 1) {
          const cells = state.bunkers[b]!;
          const leftX = bunkerLeftX(b);
          for (let cr = 0; cr < cells.length; cr += 1) {
            const cellRow = cells[cr]!;
            for (let cc = 0; cc < cellRow.length; cc += 1) {
              if (cellRow[cc] && aabbOverlap(rect, cellRect(leftX, cc, cr))) cellRow[cc] = false;
            }
          }
        }
      }
    }
  }

  function invasionReached(): boolean {
    for (let r = ROWS - 1; r >= 0; r -= 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (state.alive[r]![c] && state.originY + r * CELL_H + 8 >= INVASION_Y) return true;
      }
    }
    return false;
  }

  function advanceMarch(step: number): void {
    const range = aliveColumnRange(state.alive);
    if (range === null) return;
    const total = ROWS * COLS;
    const interval = marchInterval(countAlive(state.alive), total, state.wave);
    state.marchTimer += step;
    let descended = false;
    while (state.marchTimer >= interval) {
      state.marchTimer -= interval;
      const stepResult = stepFormation({ originX: state.originX, dir: state.dir }, range);
      state.originX = stepResult.originX;
      state.dir = stepResult.dir;
      state.originY += stepResult.dropY;
      state.frame = state.frame === 0 ? 1 : 0;
      if (stepResult.descended) descended = true;
    }
    if (descended) {
      erodeBunkersUnderAliens();
      if (invasionReached()) endGame();
    }
  }

  function advanceSaucer(step: number): void {
    if (state.saucer !== null) {
      state.saucer.x += state.saucer.dir * SAUCER_SPEED * step;
      if (state.saucer.x < -SAUCER_W - 4 || state.saucer.x > FIELD_W + 4) state.saucer = null;
      return;
    }
    state.saucerTimer -= step;
    if (state.saucerTimer <= 0 && countAlive(state.alive) > 2) {
      const fromLeft = state.rng() < 0.5;
      state.saucer = fromLeft ? { x: -SAUCER_W, dir: 1 } : { x: FIELD_W, dir: -1 };
      state.saucerTimer = SAUCER_PERIOD;
    }
  }

  function advanceExplosions(step: number): void {
    if (state.explosions.length === 0) return;
    const kept: Explosion[] = [];
    for (const explosion of state.explosions) {
      explosion.timer -= step;
      if (explosion.timer > 0) kept.push(explosion);
    }
    state.explosions = kept;
  }

  function checkExtraLife(): void {
    if (!state.awardedExtra && state.score >= EXTRA_LIFE_AT) {
      state.awardedExtra = true;
      if (state.lives < MAX_LIVES) {
        state.lives += 1;
        setMessage("Extra Life");
      }
    }
  }

  function loseLife(): void {
    state.lives -= 1;
    addExplosion(state.cannonX + CANNON_W / 2, CANNON_Y + CANNON_H / 2);
    state.bombs = [];
    state.shot = null;
    if (state.lives <= 0) {
      state.lives = 0;
      endGame();
      return;
    }
    state.respawnTimer = RESPAWN_SECONDS;
    state.cannonX = (FIELD_W - CANNON_W) / 2;
  }

  function endGame(): void {
    state.status = "gameover";
    const result = records.submit({ score: state.score, wave: state.wave });
    state.best = result.best.score ?? state.best;
    state.newBest = result.improved.includes("score") && state.score > 0;
  }

  function nextWave(): void {
    loadWave(state.wave + 1, false);
    state.bannerText = `Wave ${state.wave}`;
    state.bannerTimer = CLEAR_BANNER_SECONDS;
  }

  function tickTimers(step: number): void {
    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - step);
    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - step);
      if (state.messageTimer === 0) state.message = null;
    }
  }

  function tick(dt: number): void {
    if (dt <= 0 || state.status !== "playing" || state.paused) {
      emit();
      return;
    }
    const step = Math.min(dt, 0.05);
    tickTimers(step);
    advanceExplosions(step);

    if (state.respawnTimer > 0) {
      state.respawnTimer = Math.max(0, state.respawnTimer - step);
      emit();
      return;
    }

    updateCannon(step);
    advanceShot(step);
    advanceMarch(step);
    if (state.status !== "playing") {
      emit();
      return;
    }
    advanceSaucer(step);

    state.bombTimer += step;
    if (state.bombTimer >= bombInterval() && state.bombs.length < maxBombs()) {
      state.bombTimer = 0;
      spawnBomb();
    }
    advanceBombs(step);
    if (state.status !== "playing") {
      emit();
      return;
    }
    checkExtraLife();

    if (countAlive(state.alive) === 0) nextWave();

    emit();
  }

  function preview(): void {
    reset("preview");
    state.status = "playing";
    state.wave = 3;
    state.score = 3260;
    state.best = Math.max(state.best, 5400);
    state.lives = 2;
    state.shotsFired = 8;
    state.originY = FORMATION_Y + 2 * WAVE_DROP + 22;
    state.dir = 1;
    state.frame = 1;
    for (let c = 0; c < COLS; c += 1) {
      state.alive[0]![c] = c > 2 && c < 9;
      state.alive[1]![c] = c !== 0 && c !== 10 && c !== 5;
      state.alive[4]![c] = c % 3 !== 0;
    }
    state.alive[3]![1] = false;
    state.alive[3]![9] = false;
    state.cannonX = FIELD_W * 0.42;
    state.shot = { x: FIELD_W * 0.44, y: FIELD_H * 0.5 };
    state.bombs = [
      { x: FIELD_W * 0.3, y: FIELD_H * 0.44 },
      { x: FIELD_W * 0.6, y: FIELD_H * 0.62 },
      { x: FIELD_W * 0.5, y: FIELD_H * 0.34 },
    ];
    state.saucer = { x: FIELD_W * 0.62, dir: 1 };
    erodeBunker(state.bunkers[0]!, 5, 2, BLAST_BOMB);
    erodeBunker(state.bunkers[1]!, 3, 5, BLAST_SHOT);
    erodeBunker(state.bunkers[1]!, 7, 1, BLAST_BOMB);
    erodeBunker(state.bunkers[2]!, 5, 3, BLAST_BOMB);
    erodeBunker(state.bunkers[2]!, 8, 4, BLAST_SHOT);
    erodeBunker(state.bunkers[3]!, 2, 2, BLAST_SHOT);
    state.bannerTimer = 0;
    setMessage("Saucer +150");
    emit();
  }

  function buildSnapshot(): StarInvadersSnapshot {
    const aliens: AlienView[] = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (!state.alive[r]![c]) continue;
        const rect = alienRect(r, c);
        aliens.push({ x: rect.x, y: rect.y, row: r });
      }
    }
    const cannonVisible =
      state.status !== "gameover" && (state.respawnTimer <= 0 || Math.floor(state.respawnTimer * 8) % 2 === 0);
    return {
      status: state.status,
      paused: state.paused,
      frame: state.frame,
      aliens,
      aliensLeft: aliens.length,
      cannonX: state.cannonX,
      cannonVisible,
      shot: state.shot === null ? null : { x: state.shot.x, y: state.shot.y },
      bombs: state.bombs.map((b) => ({ x: b.x, y: b.y })),
      saucer: state.saucer === null ? null : { x: state.saucer.x },
      bunkers: state.bunkers.map((cells, i) => ({ x: bunkerLeftX(i), cells })),
      explosions: state.explosions.map((e) => ({ x: e.x, y: e.y })),
      score: state.score,
      best: Math.max(state.best, state.score),
      lives: state.lives,
      wave: state.wave,
      bannerText: state.bannerTimer > 0 ? state.bannerText : null,
      message: state.messageTimer > 0 ? state.message : null,
      newBest: state.newBest,
    };
  }

  function emit(): void {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  state.bunkers = Array.from({ length: 4 }, () => createBunkerCells());
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
    fire,
    togglePause,
    tick,
    preview,
  };
}

export const starInvadersStore = createStarInvadersStore();
