import { memo, useEffect, useRef } from "react";

import { BALL_R, FIELD_H, FIELD_W, PADDLE_H } from "../../breakout/constants";
import type { BrickBreakerSnapshot, BrickView } from "../../breakout/store";
import { brickBreakerStore } from "../../breakout/store";
import { POWERUPS, type PowerupType } from "../../breakout/powerups";
import type { BrickKind } from "../../breakout/levels";

interface Gradient {
  readonly top: string;
  readonly bottom: string;
  readonly edge: string;
}

const TIER_GRADIENT: Readonly<Record<string, Gradient>> = {
  "1": { top: "#7be9fb", bottom: "#0b8fb0", edge: "#c8f7ff" },
  "2": { top: "#f3b6ff", bottom: "#a01ea8", edge: "#ffd6ff" },
  "3": { top: "#fde28a", bottom: "#c9700a", edge: "#fff2c2" },
  steel: { top: "#dbe4ef", bottom: "#465468", edge: "#f5f9ff" },
};

function roundedRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

function tierKey(kind: BrickKind): string {
  return kind === "steel" ? "steel" : String(kind);
}

function drawBackground(c: CanvasRenderingContext2D): void {
  const bg = c.createLinearGradient(0, 0, 0, FIELD_H);
  bg.addColorStop(0, "#12103a");
  bg.addColorStop(0.5, "#0a0928");
  bg.addColorStop(1, "#050418");
  c.fillStyle = bg;
  c.fillRect(0, 0, FIELD_W, FIELD_H);

  c.save();
  c.globalAlpha = 0.35;
  c.strokeStyle = "#3a2f6b";
  c.lineWidth = 1;
  for (let x = 40; x < FIELD_W; x += 40) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, FIELD_H);
    c.stroke();
  }
  for (let y = 40; y < FIELD_H; y += 40) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(FIELD_W, y);
    c.stroke();
  }
  c.restore();

  c.strokeStyle = "#5b4bd6";
  c.lineWidth = 2;
  c.strokeRect(1, 1, FIELD_W - 2, FIELD_H - 2);
}

function drawBrick(c: CanvasRenderingContext2D, brick: BrickView): void {
  const inset = 1.6;
  const x = brick.x + inset;
  const y = brick.y + inset;
  const w = brick.w - inset * 2;
  const h = brick.h - inset * 2;
  const grad = TIER_GRADIENT[tierKey(brick.kind)]!;

  const fill = c.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, grad.top);
  fill.addColorStop(1, grad.bottom);
  roundedRect(c, x, y, w, h, 3);
  c.fillStyle = fill;
  c.fill();

  // top-left highlight bevel
  c.strokeStyle = grad.edge;
  c.lineWidth = 1.4;
  c.globalAlpha = 0.85;
  c.beginPath();
  c.moveTo(x + 2, y + h - 2);
  c.lineTo(x + 2, y + 2);
  c.lineTo(x + w - 2, y + 2);
  c.stroke();
  c.globalAlpha = 1;

  // bottom-right shadow bevel
  c.strokeStyle = "rgba(0,0,0,0.4)";
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(x + w - 2, y + 2);
  c.lineTo(x + w - 2, y + h - 2);
  c.lineTo(x + 2, y + h - 2);
  c.stroke();

  if (brick.kind === "steel") {
    c.strokeStyle = "rgba(255,255,255,0.5)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + 3, y + h - 3);
    c.lineTo(x + w - 3, y + 3);
    c.stroke();
  }

  // damage darkening for multi-hit bricks
  if (Number.isFinite(brick.maxHp) && brick.hp < brick.maxHp) {
    const damage = 1 - brick.hp / brick.maxHp;
    roundedRect(c, x, y, w, h, 3);
    c.fillStyle = `rgba(0,0,0,${0.42 * damage})`;
    c.fill();
    c.strokeStyle = `rgba(10,10,20,${0.5 * damage})`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + w * 0.35, y + 2);
    c.lineTo(x + w * 0.5, y + h - 2);
    c.moveTo(x + w * 0.7, y + 2);
    c.lineTo(x + w * 0.55, y + h - 2);
    c.stroke();
  }
}

function drawPaddle(c: CanvasRenderingContext2D, snapshot: BrickBreakerSnapshot): void {
  const p = snapshot.paddle;
  const x = p.cx - p.w / 2;
  const y = p.y;
  const grad = c.createLinearGradient(0, y, 0, y + p.h);
  if (p.wide) {
    grad.addColorStop(0, "#86efac");
    grad.addColorStop(1, "#15803d");
  } else {
    grad.addColorStop(0, "#7dd3fc");
    grad.addColorStop(1, "#1d4ed8");
  }
  c.save();
  c.shadowColor = p.wide ? "#4ade80" : "#38bdf8";
  c.shadowBlur = 16;
  roundedRect(c, x, y, p.w, p.h, PADDLE_H / 2);
  c.fillStyle = grad;
  c.fill();
  c.restore();

  c.strokeStyle = "rgba(255,255,255,0.7)";
  c.lineWidth = 1;
  roundedRect(c, x + 1.5, y + 1.5, p.w - 3, p.h * 0.42, PADDLE_H / 3);
  c.stroke();
}

function drawBall(c: CanvasRenderingContext2D, x: number, y: number, r: number, trail: readonly { x: number; y: number }[]): void {
  for (let i = 0; i < trail.length; i += 1) {
    const point = trail[i]!;
    const t = (i + 1) / (trail.length + 1);
    c.beginPath();
    c.arc(point.x, point.y, r * (0.35 + t * 0.55), 0, Math.PI * 2);
    c.fillStyle = `rgba(103,232,249,${0.05 + t * 0.28})`;
    c.fill();
  }
  c.save();
  c.shadowColor = "#a5f3fc";
  c.shadowBlur = 18;
  const core = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(1, "#22d3ee");
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = core;
  c.fill();
  c.restore();
}

function drawPowerup(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, type: PowerupType): void {
  const def = POWERUPS[type];
  const left = x - w / 2;
  const top = y - h / 2;
  c.save();
  c.shadowColor = def.color;
  c.shadowBlur = 14;
  const grad = c.createLinearGradient(0, top, 0, top + h);
  grad.addColorStop(0, def.color);
  grad.addColorStop(1, "rgba(0,0,0,0.35)");
  roundedRect(c, left, top, w, h, h / 2);
  c.fillStyle = grad;
  c.fill();
  c.restore();

  roundedRect(c, left, top, w, h, h / 2);
  c.strokeStyle = "rgba(255,255,255,0.75)";
  c.lineWidth = 1;
  c.stroke();

  c.fillStyle = "#0b0920";
  c.font = `bold ${h - 3}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(def.glyph, x, y + 0.5);
}

function render(canvas: HTMLCanvasElement, snapshot: BrickBreakerSnapshot): void {
  const c = canvas.getContext("2d");
  if (c === null) return;
  c.setTransform(canvas.width / FIELD_W, 0, 0, canvas.height / FIELD_H, 0, 0);
  c.clearRect(0, 0, FIELD_W, FIELD_H);
  drawBackground(c);
  for (const brick of snapshot.bricks) drawBrick(c, brick);
  drawPaddle(c, snapshot);
  for (const powerup of snapshot.powerups) drawPowerup(c, powerup.x, powerup.y, powerup.w, powerup.h, powerup.type);
  for (const ball of snapshot.balls) drawBall(c, ball.x, ball.y, ball.r, ball.trail);
  if (snapshot.status === "serve") {
    drawBall(c, snapshot.paddle.cx, snapshot.paddle.y - BALL_R - 1, BALL_R, []);
  }
}

function PlayfieldImpl() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (canvas === null || wrap === null) return;

    const draw = () => render(canvas, brickBreakerStore.getState());

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = wrap.getBoundingClientRect();
      const scale = Math.min(rect.width / FIELD_W, rect.height / FIELD_H);
      const cssW = Math.max(1, FIELD_W * scale);
      const cssH = Math.max(1, FIELD_H * scale);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      draw();
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);
    const unsubscribe = brickBreakerStore.subscribe(draw);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);

  const pointerToField = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (canvas === null) return FIELD_W / 2;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return FIELD_W / 2;
    return ((clientX - rect.left) / rect.width) * FIELD_W;
  };

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center">
      <canvas
        ref={canvasRef}
        className="pointer-events-auto touch-none rounded-lg shadow-[0_0_40px_rgba(91,75,214,0.35)]"
        onPointerMove={(event) => brickBreakerStore.setPointerX(pointerToField(event.clientX))}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          brickBreakerStore.setPointerX(pointerToField(event.clientX));
          brickBreakerStore.launch();
        }}
      />
    </div>
  );
}

export const Playfield = memo(PlayfieldImpl);
