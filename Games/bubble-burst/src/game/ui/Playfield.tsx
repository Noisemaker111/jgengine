import { memo, useEffect, useRef } from "react";

import { colorDef, type GlyphKind } from "../bubble/colors";
import { FIELD_H, FIELD_W, R, ROW_H, SHOOTER_X, SHOOTER_Y } from "../bubble/constants";
import { bubbleStore, type BubbleSnapshot } from "../bubble/store";

type Ctx = CanvasRenderingContext2D;

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

function starPath(c: Ctx, x: number, y: number, outer: number, inner: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rr = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

function drawGlyph(c: Ctx, x: number, y: number, s: number, kind: GlyphKind): void {
  c.save();
  c.fillStyle = "rgba(255,255,255,0.92)";
  c.strokeStyle = "rgba(8,20,18,0.4)";
  c.lineWidth = 0.9;
  c.lineJoin = "round";
  if (kind === "triangle") {
    c.beginPath();
    c.moveTo(x, y - s * 0.95);
    c.lineTo(x + s * 0.92, y + s * 0.7);
    c.lineTo(x - s * 0.92, y + s * 0.7);
    c.closePath();
    c.fill();
    c.stroke();
  } else if (kind === "diamond") {
    c.beginPath();
    c.moveTo(x, y - s);
    c.lineTo(x + s, y);
    c.lineTo(x, y + s);
    c.lineTo(x - s, y);
    c.closePath();
    c.fill();
    c.stroke();
  } else if (kind === "circle") {
    c.beginPath();
    c.arc(x, y, s * 0.72, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  } else if (kind === "ring") {
    c.beginPath();
    c.lineWidth = s * 0.44;
    c.strokeStyle = "rgba(255,255,255,0.92)";
    c.arc(x, y, s * 0.68, 0, Math.PI * 2);
    c.stroke();
  } else if (kind === "square") {
    roundRect(c, x - s * 0.72, y - s * 0.72, s * 1.44, s * 1.44, s * 0.28);
    c.fill();
    c.stroke();
  } else {
    starPath(c, x, y, s * 0.98, s * 0.42);
    c.fill();
    c.stroke();
  }
  c.restore();
}

function drawBubble(c: Ctx, x: number, y: number, r: number, colorId: number, alpha = 1, squash = 0): void {
  const col = colorDef(colorId);
  const ry = r * (1 - squash);
  c.save();
  c.globalAlpha = alpha;
  const grad = c.createRadialGradient(x - r * 0.34, y - ry * 0.4, r * 0.14, x, y, r);
  grad.addColorStop(0, col.light);
  grad.addColorStop(0.55, col.base);
  grad.addColorStop(1, col.dark);
  c.beginPath();
  c.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
  c.fillStyle = grad;
  c.fill();
  c.lineWidth = 1.3;
  c.strokeStyle = col.dark;
  c.stroke();
  c.beginPath();
  c.ellipse(x - r * 0.3, y - ry * 0.36, r * 0.34, ry * 0.2, -0.5, 0, Math.PI * 2);
  c.fillStyle = "rgba(255,255,255,0.55)";
  c.fill();
  drawGlyph(c, x, y + r * 0.03, r * 0.5, col.glyph);
  c.restore();
}

function drawDeadline(c: Ctx, snap: BubbleSnapshot): void {
  const pulse = snap.danger ? 0.55 + 0.35 * Math.sin(Date.now() / 150) : 0.32;
  c.save();
  c.setLineDash([8, 7]);
  c.lineWidth = 2;
  c.strokeStyle = snap.danger ? `rgba(255,86,86,${pulse})` : "rgba(255,180,120,0.32)";
  if (snap.danger) {
    c.shadowColor = "rgba(255,80,80,0.8)";
    c.shadowBlur = 10;
  }
  c.beginPath();
  c.moveTo(0, snap.deadlineY);
  c.lineTo(FIELD_W, snap.deadlineY);
  c.stroke();
  c.restore();
}

function drawShooter(c: Ctx, snap: BubbleSnapshot): void {
  c.save();
  c.translate(SHOOTER_X, SHOOTER_Y);
  c.rotate(snap.aimAngle);
  const barrel = c.createLinearGradient(-6, -38, 6, 2);
  barrel.addColorStop(0, "#f6dc8c");
  barrel.addColorStop(0.5, "#b8860b");
  barrel.addColorStop(1, "#6d4c08");
  roundRect(c, -6, -40, 12, 42, 4);
  c.fillStyle = barrel;
  c.fill();
  c.strokeStyle = "#432f05";
  c.lineWidth = 1.2;
  c.stroke();
  c.restore();

  c.beginPath();
  c.arc(SHOOTER_X, SHOOTER_Y, 22, 0, Math.PI * 2);
  const base = c.createRadialGradient(SHOOTER_X - 8, SHOOTER_Y - 8, 4, SHOOTER_X, SHOOTER_Y, 23);
  base.addColorStop(0, "#ffe9a8");
  base.addColorStop(0.6, "#c8931a");
  base.addColorStop(1, "#6d4c08");
  c.fillStyle = base;
  c.fill();
  c.strokeStyle = "#432f05";
  c.lineWidth = 2;
  c.stroke();

  drawBubble(c, SHOOTER_X, SHOOTER_Y, R * 0.94, snap.current);
}

function render(canvas: HTMLCanvasElement, snap: BubbleSnapshot): void {
  const c = canvas.getContext("2d");
  if (c === null) return;
  c.setTransform(canvas.width / FIELD_W, 0, 0, canvas.height / FIELD_H, 0, 0);
  c.clearRect(0, 0, FIELD_W, FIELD_H);

  const bg = c.createLinearGradient(0, 0, 0, FIELD_H);
  bg.addColorStop(0, "#0c463d");
  bg.addColorStop(0.62, "#062a25");
  bg.addColorStop(1, "#03201d");
  c.fillStyle = bg;
  c.fillRect(0, 0, FIELD_W, FIELD_H);

  c.save();
  c.globalAlpha = 0.5;
  c.strokeStyle = "#1a5b50";
  c.lineWidth = 1;
  c.strokeRect(1, 1, FIELD_W - 2, FIELD_H - 2);
  c.restore();

  const ceilY = snap.descent * ROW_H;
  const ceil = c.createLinearGradient(0, ceilY - 7, 0, ceilY);
  ceil.addColorStop(0, "#d8a63a");
  ceil.addColorStop(1, "#7a560d");
  c.fillStyle = ceil;
  c.fillRect(0, Math.max(0, ceilY - 7), FIELD_W, 7);

  drawDeadline(c, snap);

  if (snap.trajectory.length > 0) {
    for (let i = 0; i < snap.trajectory.length; i += 3) {
      const p = snap.trajectory[i]!;
      const fade = 1 - i / snap.trajectory.length;
      c.beginPath();
      c.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      c.fillStyle = `rgba(255,240,200,${0.16 + fade * 0.5})`;
      c.fill();
    }
    const tip = snap.trajectory[snap.trajectory.length - 1]!;
    c.beginPath();
    c.arc(tip.x, tip.y, R * 0.7, 0, Math.PI * 2);
    c.strokeStyle = `rgba(255,240,200,0.45)`;
    c.lineWidth = 1.4;
    c.stroke();
  }

  for (const b of snap.bubbles) drawBubble(c, b.x, b.y, R, b.color);
  for (const f of snap.falls) drawBubble(c, f.x, f.y, R, f.color, 0.9, f.squash);

  for (const p of snap.particles) {
    const col = colorDef(p.color);
    c.beginPath();
    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    c.fillStyle = col.light;
    c.globalAlpha = p.alpha;
    c.fill();
    c.globalAlpha = 1;
  }

  if (snap.projectile !== null) drawBubble(c, snap.projectile.x, snap.projectile.y, R, snap.projectile.color);

  drawShooter(c, snap);

  if (snap.compressFlash > 0) {
    c.save();
    c.globalAlpha = Math.min(0.5, snap.compressFlash);
    const flash = c.createLinearGradient(0, 0, 0, FIELD_H);
    flash.addColorStop(0, "rgba(255,70,70,0.5)");
    flash.addColorStop(0.3, "rgba(255,70,70,0)");
    c.fillStyle = flash;
    c.fillRect(0, 0, FIELD_W, FIELD_H);
    c.restore();
  }
}

function PlayfieldImpl() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (canvas === null || wrap === null) return;

    const draw = () => render(canvas, bubbleStore.getState());

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
    const unsubscribe = bubbleStore.subscribe(draw);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);

  const toField = (clientX: number, clientY: number): { fx: number; fy: number } => {
    const canvas = canvasRef.current;
    if (canvas === null) return { fx: SHOOTER_X, fy: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { fx: SHOOTER_X, fy: 0 };
    return {
      fx: ((clientX - rect.left) / rect.width) * FIELD_W,
      fy: ((clientY - rect.top) / rect.height) * FIELD_H,
    };
  };

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center">
      <canvas
        ref={canvasRef}
        className="pointer-events-auto touch-none rounded-xl"
        style={{ boxShadow: "0 0 46px rgba(10,70,60,0.55), inset 0 0 0 1px rgba(233,196,106,0.12)", cursor: "crosshair" }}
        onPointerMove={(event) => {
          const { fx, fy } = toField(event.clientX, event.clientY);
          bubbleStore.setAimFromField(fx, fy);
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const { fx, fy } = toField(event.clientX, event.clientY);
          bubbleStore.setAimFromField(fx, fy);
          bubbleStore.fire();
        }}
      />
    </div>
  );
}

export const Playfield = memo(PlayfieldImpl);
