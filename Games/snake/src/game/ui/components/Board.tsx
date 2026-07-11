import { useEffect, useRef } from "react";

import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";

import { GRID_H, GRID_W, type Cell } from "../../logic";
import { snakeStore, type SnakeSnapshot } from "../../store";

interface Effects {
  deathAt: number;
  grewTick: number;
  growAt: number;
  growCell: Cell | null;
}

const BG_TOP = "#0b1c14";
const BG_BOTTOM = "#050f0a";
const GRID_LINE = "rgba(120, 240, 160, 0.045)";
const WALL = "#7dffb0";
const FOOD = "#ffcf5c";
const FOOD_CORE = "#fff4d2";
const DEATH = "#ff5b5b";
const WIN = "#7dffb0";
const SWIPE_THRESHOLD = 22;

function roundRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + w, y, x + w, y + h, radius);
  g.arcTo(x + w, y + h, x, y + h, radius);
  g.arcTo(x, y + h, x, y, radius);
  g.arcTo(x, y, x + w, y, radius);
  g.closePath();
}

function drawBackground(g: CanvasRenderingContext2D, size: number): void {
  const bg = g.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);

  const glow = g.createRadialGradient(size / 2, size * 0.42, size * 0.05, size / 2, size / 2, size * 0.72);
  glow.addColorStop(0, "rgba(80, 220, 130, 0.10)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
}

function drawGrid(g: CanvasRenderingContext2D, size: number, cell: number): void {
  g.strokeStyle = GRID_LINE;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < GRID_W; i += 1) {
    const x = Math.round(i * cell) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, size);
  }
  for (let i = 1; i < GRID_H; i += 1) {
    const y = Math.round(i * cell) + 0.5;
    g.moveTo(0, y);
    g.lineTo(size, y);
  }
  g.stroke();
}

function drawWalls(g: CanvasRenderingContext2D, snap: SnakeSnapshot, size: number, cell: number): void {
  const inset = cell * 0.18;
  g.save();
  if (snap.mode === "walled") {
    g.strokeStyle = WALL;
    g.lineWidth = cell * 0.14;
    g.shadowColor = WALL;
    g.shadowBlur = cell * 0.9;
    roundRectPath(g, inset, inset, size - inset * 2, size - inset * 2, cell * 0.4);
    g.stroke();
  } else {
    g.strokeStyle = "rgba(125, 255, 176, 0.28)";
    g.lineWidth = cell * 0.1;
    g.setLineDash([cell * 0.5, cell * 0.4]);
    roundRectPath(g, inset, inset, size - inset * 2, size - inset * 2, cell * 0.4);
    g.stroke();
  }
  g.restore();
}

function drawFood(g: CanvasRenderingContext2D, snap: SnakeSnapshot, cell: number, now: number): void {
  const food = snap.food;
  if (food === null) return;
  const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * 5);
  const cx = (food.x + 0.5) * cell;
  const cy = (food.y + 0.5) * cell;
  const r = cell * 0.3 * (0.82 + 0.18 * pulse);
  g.save();
  g.shadowColor = FOOD;
  g.shadowBlur = cell * (0.6 + 0.5 * pulse);
  g.fillStyle = FOOD;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = FOOD_CORE;
  g.beginPath();
  g.arc(cx - r * 0.2, cy - r * 0.2, r * 0.42, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawSnake(g: CanvasRenderingContext2D, snap: SnakeSnapshot, cell: number, now: number): void {
  const snake = snap.snake;
  const last = Math.max(1, snake.length - 1);
  const inset = cell * 0.12;
  const seg = cell - inset * 2;
  const radius = seg * 0.32;
  const dead = snap.phase === "gameover" && !snap.won;

  for (let i = snake.length - 1; i >= 0; i -= 1) {
    const c = snake[i]!;
    const t = i / last;
    const lightness = 70 - t * 30;
    g.save();
    if (i === 0) {
      g.shadowColor = dead ? DEATH : "rgba(120, 255, 160, 0.9)";
      g.shadowBlur = cell * 0.9;
    } else {
      g.shadowColor = "rgba(80, 220, 130, 0.35)";
      g.shadowBlur = cell * 0.28;
    }
    g.fillStyle = dead && i === 0 ? DEATH : `hsl(135, 88%, ${lightness}%)`;
    roundRectPath(g, c.x * cell + inset, c.y * cell + inset, seg, seg, radius);
    g.fill();
    g.restore();
  }

  const head = snake[0]!;
  const dir = snap.dir;
  const cx = (head.x + 0.5) * cell;
  const cy = (head.y + 0.5) * cell;
  const px = -dir.y;
  const py = dir.x;
  const fwd = cell * 0.15;
  const side = cell * 0.2;
  const er = cell * 0.085;
  g.fillStyle = dead ? "#3a0d0d" : "#05231a";
  for (const s of [1, -1]) {
    const ex = cx + dir.x * fwd + px * side * s;
    const ey = cy + dir.y * fwd + py * side * s;
    g.beginPath();
    g.arc(ex, ey, er, 0, Math.PI * 2);
    g.fill();
  }
}

function drawEffects(
  g: CanvasRenderingContext2D,
  snap: SnakeSnapshot,
  size: number,
  cell: number,
  now: number,
  effects: Effects,
): void {
  if (effects.growCell !== null) {
    const e = (now - effects.growAt) / 450;
    if (e >= 0 && e < 1) {
      const cx = (effects.growCell.x + 0.5) * cell;
      const cy = (effects.growCell.y + 0.5) * cell;
      g.save();
      g.strokeStyle = `rgba(140, 255, 180, ${(1 - e) * 0.8})`;
      g.lineWidth = cell * 0.12;
      g.beginPath();
      g.arc(cx, cy, cell * (0.3 + e), 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }

  if (snap.phase === "gameover" && effects.deathAt > 0) {
    const e = (now - effects.deathAt) / 600;
    if (e >= 0 && e < 1) {
      g.fillStyle = snap.won
        ? `rgba(125, 255, 176, ${(1 - e) * 0.4})`
        : `rgba(255, 91, 91, ${(1 - e) * 0.45})`;
      g.fillRect(0, 0, size, size);
    }
  }
}

function drawScanlines(g: CanvasRenderingContext2D, size: number): void {
  g.fillStyle = "rgba(0, 0, 0, 0.16)";
  for (let y = 0; y < size; y += 3) g.fillRect(0, y, size, 1);
  const vig = g.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.72);
  vig.addColorStop(0, "rgba(0, 0, 0, 0)");
  vig.addColorStop(1, "rgba(0, 0, 0, 0.42)");
  g.fillStyle = vig;
  g.fillRect(0, 0, size, size);
}

export function Board() {
  const snapshot = useEngineState(snakeStore);
  const { commands } = useGame();

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapRef = useRef<SnakeSnapshot>(snapshot);
  const sizeRef = useRef(0);
  const dprRef = useRef(1);
  const effectsRef = useRef<Effects>({ deathAt: 0, grewTick: -100, growAt: 0, growCell: null });
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);

  snapRef.current = snapshot;

  useEffect(() => {
    const effects = effectsRef.current;
    if (snapshot.phase === "gameover" && effects.deathAt === 0) {
      effects.deathAt = performance.now();
    } else if (snapshot.phase !== "gameover") {
      effects.deathAt = 0;
    }
    if (snapshot.grewAtTick !== effects.grewTick && snapshot.grewAtTick > 0) {
      effects.grewTick = snapshot.grewAtTick;
      effects.growAt = performance.now();
      effects.growCell = snapshot.snake[0] ?? null;
    }
  }, [snapshot]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (wrapper === null || canvas === null) return;
    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const size = Math.max(0, Math.floor(Math.min(rect.width, rect.height) * 0.96));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      sizeRef.current = size;
      dprRef.current = dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      const size = sizeRef.current;
      if (canvas === null || size <= 0) return;
      const g = canvas.getContext("2d");
      if (g === null) return;
      const dpr = dprRef.current;
      const cell = size / GRID_W;
      const snap = snapRef.current;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackground(g, size);
      drawGrid(g, size, cell);
      drawFood(g, snap, cell, now);
      drawSnake(g, snap, cell, now);
      drawWalls(g, snap, size, cell);
      drawEffects(g, snap, size, cell, now, effectsRef.current);
      drawScanlines(g, size);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    swipeRef.current = { x: event.clientX, y: event.clientY, t: performance.now() };
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (start === null) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
      commands.run("confirm", {});
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) commands.run(dx > 0 ? "steerRight" : "steerLeft", {});
    else commands.run(dy > 0 ? "steerDown" : "steerUp", {});
  };

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-auto absolute inset-0 flex items-center justify-center touch-none"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <canvas
        ref={canvasRef}
        className="rounded-2xl"
        style={{ boxShadow: "0 0 60px rgba(60, 200, 120, 0.18), inset 0 0 40px rgba(0,0,0,0.6)" }}
      />
    </div>
  );
}
