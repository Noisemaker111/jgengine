import { seededRng } from "@jgengine/core/random/rng";

import { browserStorage, createRecords, type BubbleRecords } from "../records";
import {
  BANNER_SECONDS,
  BUBBLE_SPEED,
  COMPRESS_FLASH,
  D,
  DEADLINE_Y,
  FIELD_H,
  GRAVITY,
  LEVEL_CLEAR_BASE,
  MIN_MATCH,
  POP_SCORE,
  R,
  ROW_H,
  SHOOTER_X,
  SHOOTER_Y,
  SHOT_BONUS,
  WARN_ROWS,
} from "./constants";
import { colorDef } from "./colors";
import { aimToDir, clampAim, aimFromPoint, type Vec2 } from "./geometry";
import { cellX, cellY, nearestCell, nearestEmptyCell } from "./hex";
import { LEVELS, parseLevel, TOTAL_LEVELS } from "./levels";
import { findFloating, floodMatch, type Grid } from "./match";
import { dropScore, shotsUntilCompress, willCompress } from "./rules";

export type Status = "playing" | "gameover" | "victory";

export interface BubbleView {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly color: number;
}

export interface ParticleView {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: number;
  readonly alpha: number;
}

export interface FallView {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly squash: number;
}

export interface BubbleSnapshot {
  readonly status: Status;
  readonly level: number;
  readonly levelName: string;
  readonly totalLevels: number;
  readonly score: number;
  readonly best: number;
  readonly bestLevel: number;
  readonly bubbles: readonly BubbleView[];
  readonly bubblesLeft: number;
  readonly projectile: { readonly x: number; readonly y: number; readonly color: number } | null;
  readonly trajectory: readonly Vec2[];
  readonly particles: readonly ParticleView[];
  readonly falls: readonly FallView[];
  readonly aimAngle: number;
  readonly current: number;
  readonly next: number;
  readonly shotsUntilDrop: number;
  readonly shotsIntoCycle: number;
  readonly cycleLength: number;
  readonly descent: number;
  readonly deadlineY: number;
  readonly danger: boolean;
  readonly compressFlash: number;
  readonly bannerText: string | null;
  readonly bannerMs: number;
  readonly newBest: boolean;
}

interface Projectile {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
}

interface Fall {
  x: number;
  y: number;
  vy: number;
  drift: number;
  color: number;
}

interface State {
  status: Status;
  grid: Grid;
  levelIndex: number;
  score: number;
  best: number;
  bestLevel: number;
  furthest: number;
  shots: number;
  descent: number;
  aimAngle: number;
  current: number;
  next: number;
  projectile: Projectile | null;
  particles: Particle[];
  falls: Fall[];
  compressFlash: number;
  bannerText: string | null;
  bannerMs: number;
  newBest: boolean;
  rng: () => number;
  runSeed: number;
}

export interface BubbleStore {
  getState(): BubbleSnapshot;
  subscribe(listener: (snapshot: BubbleSnapshot) => void): () => void;
  reset(seed?: string | number): void;
  tick(dt: number): void;
  fire(): void;
  swap(): void;
  nudgeAim(delta: number): void;
  setAimFromField(fx: number, fy: number): void;
  preview(): void;
}

const COLLIDE_SQ = D * D;

export function createBubbleStore(seed: string | number = "bubble-burst"): BubbleStore {
  const listeners = new Set<(snapshot: BubbleSnapshot) => void>();
  const records: BubbleRecords = createRecords(browserStorage());

  const state: State = {
    status: "playing",
    grid: new Map(),
    levelIndex: 0,
    score: 0,
    best: records.bestOf("score") ?? 0,
    bestLevel: records.bestOf("level") ?? 0,
    furthest: 1,
    shots: 0,
    descent: 0,
    aimAngle: 0,
    current: 0,
    next: 0,
    projectile: null,
    particles: [],
    falls: [],
    compressFlash: 0,
    bannerText: null,
    bannerMs: 0,
    newBest: false,
    rng: seededRng(seed),
    runSeed: 0,
  };

  let snapshot: BubbleSnapshot;

  function descentY(): number {
    return state.descent * ROW_H;
  }

  function colorsOnField(): number[] {
    const set = new Set<number>();
    for (const b of state.grid.values()) set.add(b.color);
    return [...set];
  }

  function generateColor(): number {
    const present = colorsOnField();
    if (present.length === 0) return 0;
    return present[Math.floor(state.rng() * present.length) % present.length]!;
  }

  function banner(text: string): void {
    state.bannerText = text;
    state.bannerMs = BANNER_SECONDS;
  }

  function loadLevel(index: number): void {
    state.levelIndex = index;
    state.grid = parseLevel(LEVELS[index]!);
    state.shots = 0;
    state.descent = 0;
    state.projectile = null;
    state.particles = [];
    state.falls = [];
    state.current = generateColor();
    state.next = generateColor();
    banner(`Level ${index + 1} — ${LEVELS[index]!.name}`);
  }

  function reset(nextSeed?: string | number): void {
    state.runSeed += 1;
    state.rng = seededRng(nextSeed ?? `${seed}:${state.runSeed}`);
    state.status = "playing";
    state.score = 0;
    state.furthest = 1;
    state.aimAngle = 0;
    state.best = records.bestOf("score") ?? 0;
    state.bestLevel = records.bestOf("level") ?? 0;
    state.newBest = false;
    state.compressFlash = 0;
    loadLevel(0);
    emit();
  }

  function submit(): void {
    const result = records.submit({ score: state.score, level: state.furthest });
    state.best = result.best.score ?? state.best;
    state.bestLevel = result.best.level ?? state.bestLevel;
    state.newBest = result.improved.includes("score") && state.score > 0;
  }

  function crossesDeadline(): boolean {
    const dy = descentY();
    for (const b of state.grid.values()) {
      if (cellY(b.row) + dy + R >= DEADLINE_Y) return true;
    }
    return false;
  }

  function inDanger(): boolean {
    const dy = descentY();
    const margin = WARN_ROWS * ROW_H;
    for (const b of state.grid.values()) {
      if (cellY(b.row) + dy + R + margin >= DEADLINE_Y) return true;
    }
    return false;
  }

  function spawnPop(x: number, y: number, color: number): void {
    const count = 7;
    for (let i = 0; i < count; i += 1) {
      const angle = state.rng() * Math.PI * 2;
      const speed = 70 + state.rng() * 170;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0.4 + state.rng() * 0.4,
        maxLife: 0.8,
        color,
      });
    }
  }

  function spawnFall(x: number, y: number, color: number): void {
    state.falls.push({
      x,
      y,
      vy: -30 - state.rng() * 70,
      drift: (state.rng() * 2 - 1) * 45,
      color,
    });
  }

  function onLevelClear(): void {
    state.score += LEVEL_CLEAR_BASE + shotsUntilCompress(state.shots) * SHOT_BONUS;
    if (state.levelIndex + 1 >= TOTAL_LEVELS) {
      state.furthest = TOTAL_LEVELS;
      state.status = "victory";
      submit();
      banner("Run Complete!");
      return;
    }
    state.furthest = Math.max(state.furthest, state.levelIndex + 2);
    loadLevel(state.levelIndex + 1);
  }

  function onGameOver(): void {
    state.furthest = Math.max(state.furthest, state.levelIndex + 1);
    state.status = "gameover";
    state.projectile = null;
    submit();
    banner("Game Over");
  }

  function resolveStick(row: number, col: number, color: number): void {
    state.grid.set(`${row},${col}`, { row, col, color });
    const dy = descentY();

    const group = floodMatch(state.grid, row, col);
    if (group.length >= MIN_MATCH) {
      for (const g of group) {
        const b = state.grid.get(`${g.row},${g.col}`);
        state.grid.delete(`${g.row},${g.col}`);
        if (b !== undefined) spawnPop(cellX(g.row, g.col), cellY(g.row) + dy, b.color);
      }
      state.score += group.length * POP_SCORE;

      const floating = findFloating(state.grid);
      if (floating.length > 0) {
        state.score += dropScore(floating.length);
        for (const f of floating) {
          const b = state.grid.get(`${f.row},${f.col}`);
          state.grid.delete(`${f.row},${f.col}`);
          if (b !== undefined) spawnFall(cellX(f.row, f.col), cellY(f.row) + dy, b.color);
        }
      }
    }

    if (state.grid.size === 0) {
      onLevelClear();
      return;
    }
    if (crossesDeadline()) {
      onGameOver();
      return;
    }

    state.shots += 1;
    if (willCompress(state.shots)) {
      state.descent += 1;
      state.compressFlash = COMPRESS_FLASH;
      banner("▼ Compressor");
      if (crossesDeadline()) {
        onGameOver();
        return;
      }
    }

    if (colorsOnField().indexOf(state.current) < 0) state.current = generateColor();
    if (colorsOnField().indexOf(state.next) < 0) state.next = generateColor();
  }

  function stickProjectile(p: Projectile): void {
    const staticY = p.y - descentY();
    const cell = nearestEmptyCell(state.grid, p.x, staticY) ?? nearestCell(p.x, staticY);
    state.projectile = null;
    resolveStick(cell.row, cell.col, p.color);
  }

  function advanceProjectile(step: number): void {
    const p = state.projectile;
    if (p === null) return;
    const dy = descentY();
    const dist = BUBBLE_SPEED * step;
    const subs = Math.max(1, Math.ceil(dist / (R * 0.75)));
    const sub = dist / subs;
    for (let i = 0; i < subs; i += 1) {
      p.x += p.dx * sub;
      p.y += p.dy * sub;
      if (p.x < R) {
        p.x = R;
        p.dx = Math.abs(p.dx);
      } else if (p.x > cellX(0, 0) + 7 * D) {
        p.x = cellX(0, 0) + 7 * D;
        p.dx = -Math.abs(p.dx);
      }
      if (p.y <= R + dy) {
        stickProjectile(p);
        return;
      }
      for (const b of state.grid.values()) {
        const bx = cellX(b.row, b.col);
        const by = cellY(b.row) + dy;
        const ex = p.x - bx;
        const ey = p.y - by;
        if (ex * ex + ey * ey <= COLLIDE_SQ) {
          stickProjectile(p);
          return;
        }
      }
    }
  }

  function updateParticles(step: number): void {
    const kept: Particle[] = [];
    for (const part of state.particles) {
      part.vy += GRAVITY * step;
      part.x += part.vx * step;
      part.y += part.vy * step;
      part.life -= step;
      if (part.life > 0) kept.push(part);
    }
    state.particles = kept;
  }

  function updateFalls(step: number): void {
    const kept: Fall[] = [];
    for (const fall of state.falls) {
      fall.vy += GRAVITY * step;
      fall.y += fall.vy * step;
      fall.x += fall.drift * step;
      if (fall.y - R < FIELD_H + 60) kept.push(fall);
    }
    state.falls = kept;
  }

  function tickTimers(step: number): void {
    if (state.compressFlash > 0) state.compressFlash = Math.max(0, state.compressFlash - step);
    if (state.bannerMs > 0) {
      state.bannerMs = Math.max(0, state.bannerMs - step);
      if (state.bannerMs === 0) state.bannerText = null;
    }
  }

  function fire(): void {
    if (state.status !== "playing" || state.projectile !== null) return;
    const dir = aimToDir(state.aimAngle);
    state.projectile = { x: SHOOTER_X, y: SHOOTER_Y, dx: dir.x, dy: dir.y, color: state.current };
    state.current = state.next;
    state.next = generateColor();
    emit();
  }

  function swap(): void {
    const c = state.current;
    state.current = state.next;
    state.next = c;
    emit();
  }

  function nudgeAim(delta: number): void {
    if (state.status !== "playing") return;
    state.aimAngle = clampAim(state.aimAngle + delta);
    emit();
  }

  function setAimFromField(fx: number, fy: number): void {
    if (state.status !== "playing") return;
    state.aimAngle = aimFromPoint(fx, fy, SHOOTER_X, SHOOTER_Y);
    emit();
  }

  function tick(dt: number): void {
    if (dt > 0 && state.status === "playing") {
      const step = Math.min(dt, 0.03);
      advanceProjectile(step);
      updateParticles(step);
      updateFalls(step);
      tickTimers(step);
    }
    emit();
  }

  function traceTrajectory(): Vec2[] {
    const dy = descentY();
    const dir = aimToDir(state.aimAngle);
    let x = SHOOTER_X;
    let y = SHOOTER_Y;
    let vx = dir.x;
    const stepLen = 6;
    const rightWall = cellX(0, 0) + 7 * D;
    const pts: Vec2[] = [];
    for (let travelled = 0; travelled < 1200; travelled += stepLen) {
      x += vx * stepLen;
      y += dir.y * stepLen;
      if (x < R) {
        x = R;
        vx = Math.abs(vx);
      } else if (x > rightWall) {
        x = rightWall;
        vx = -Math.abs(vx);
      }
      pts.push({ x, y });
      if (y <= R + dy) break;
      let hit = false;
      for (const b of state.grid.values()) {
        const ex = x - cellX(b.row, b.col);
        const ey = y - (cellY(b.row) + dy);
        if (ex * ex + ey * ey <= COLLIDE_SQ) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    return pts;
  }

  function buildSnapshot(): BubbleSnapshot {
    const dy = descentY();
    const bubbles: BubbleView[] = [];
    for (const b of state.grid.values()) {
      bubbles.push({ key: `${b.row},${b.col}`, x: cellX(b.row, b.col), y: cellY(b.row) + dy, color: b.color });
    }
    const particles: ParticleView[] = state.particles.map((p) => ({
      x: p.x,
      y: p.y,
      r: R * (0.28 + 0.5 * (p.life / p.maxLife)),
      color: p.color,
      alpha: Math.max(0, Math.min(1, p.life / p.maxLife)),
    }));
    const falls: FallView[] = state.falls.map((f) => ({
      x: f.x,
      y: f.y,
      color: f.color,
      squash: Math.max(0, Math.min(0.5, (f.vy - 200) / 1600)),
    }));
    return {
      status: state.status,
      level: state.levelIndex + 1,
      levelName: LEVELS[state.levelIndex]!.name,
      totalLevels: TOTAL_LEVELS,
      score: state.score,
      best: Math.max(state.best, state.score),
      bestLevel: Math.max(state.bestLevel, state.furthest),
      bubbles,
      bubblesLeft: state.grid.size,
      projectile: state.projectile === null ? null : { x: state.projectile.x, y: state.projectile.y, color: state.projectile.color },
      trajectory: state.status === "playing" && state.projectile === null ? traceTrajectory() : [],
      particles,
      falls,
      aimAngle: state.aimAngle,
      current: state.current,
      next: state.next,
      shotsUntilDrop: shotsUntilCompress(state.shots),
      shotsIntoCycle: state.shots % 6,
      cycleLength: 6,
      descent: state.descent,
      deadlineY: DEADLINE_Y,
      danger: state.status === "playing" && inDanger(),
      compressFlash: state.compressFlash,
      bannerText: state.bannerMs > 0 ? state.bannerText : null,
      bannerMs: state.bannerMs,
      newBest: state.newBest,
    };
  }

  function emit(): void {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function preview(): void {
    reset("preview");
    loadLevel(4);
    state.bannerMs = 0;
    state.bannerText = null;
    state.score = 8420;
    state.descent = 3;
    state.shots = 4;
    state.aimAngle = -0.34;
    // carve out a fought-through field
    let n = 0;
    for (const key of [...state.grid.keys()]) {
      n += 1;
      if (n % 3 === 0) state.grid.delete(key);
    }
    state.current = generateColor();
    state.next = generateColor();
    state.particles = [
      { x: cellX(3, 3), y: cellY(3) + descentY(), vx: 40, vy: -60, life: 0.5, maxLife: 0.8, color: 0 },
      { x: cellX(2, 4), y: cellY(2) + descentY(), vx: -60, vy: -30, life: 0.6, maxLife: 0.8, color: 3 },
    ];
    state.falls = [{ x: cellX(4, 2), y: cellY(4) + descentY() + 40, vy: 160, drift: 20, color: 2 }];
    emit();
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
    tick,
    fire,
    swap,
    nudgeAim,
    setAimFromField,
    preview,
  };
}

export const bubbleStore = createBubbleStore();

export function bubbleColor(id: number): string {
  return colorDef(id).base;
}
