import { useEffect, useRef } from "react";

import { useEngineState } from "@jgengine/react/engineStore";

import { FIELD_H, FIELD_W } from "../../blaster/constants";
import { blasterStore, type BlasterSnapshot } from "../../blaster/store";
import type { Rock, Saucer, Ship } from "../../blaster/logic";

const STROKE = "#f4f8ff";
const GLOW = "rgba(150, 210, 255, 0.85)";

function eachWrap(x: number, y: number, r: number, fn: (px: number, py: number) => void): void {
  const dxs = [0];
  if (x < r) dxs.push(FIELD_W);
  if (x > FIELD_W - r) dxs.push(-FIELD_W);
  const dys = [0];
  if (y < r) dys.push(FIELD_H);
  if (y > FIELD_H - r) dys.push(-FIELD_H);
  for (const dx of dxs) for (const dy of dys) fn(x + dx, y + dy);
}

function drawStars(g: CanvasRenderingContext2D, snap: BlasterSnapshot): void {
  for (const s of snap.stars) {
    g.globalAlpha = s.a;
    g.fillStyle = "#cfe4ff";
    g.beginPath();
    g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawRock(g: CanvasRenderingContext2D, rock: Rock): void {
  eachWrap(rock.x, rock.y, rock.radius, (px, py) => {
    g.save();
    g.translate(px, py);
    g.rotate(rock.angle);
    g.beginPath();
    const n = rock.verts.length;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const rr = rock.radius * rock.verts[i]!;
      const vx = Math.cos(a) * rr;
      const vy = Math.sin(a) * rr;
      if (i === 0) g.moveTo(vx, vy);
      else g.lineTo(vx, vy);
    }
    g.closePath();
    g.stroke();
    g.restore();
  });
}

function drawShip(g: CanvasRenderingContext2D, ship: Ship, now: number): void {
  if (ship.invuln > 0 && Math.floor(now / 90) % 2 === 0) return;
  eachWrap(ship.x, ship.y, 20, (px, py) => {
    g.save();
    g.translate(px, py);
    g.rotate(ship.angle);
    g.beginPath();
    g.moveTo(0, -16);
    g.lineTo(11, 12);
    g.lineTo(5, 7);
    g.lineTo(-5, 7);
    g.lineTo(-11, 12);
    g.closePath();
    g.stroke();
    if (ship.thrusting && Math.floor(now / 55) % 2 === 0) {
      const flame = 8 + Math.random() * 10;
      g.beginPath();
      g.moveTo(-4, 8);
      g.lineTo(0, 8 + flame);
      g.lineTo(4, 8);
      g.strokeStyle = "#ffcf6a";
      g.stroke();
      g.strokeStyle = STROKE;
    }
    g.restore();
  });
}

function drawSaucer(g: CanvasRenderingContext2D, s: Saucer): void {
  const w = s.radius;
  eachWrap(s.x, s.y, w, (px, py) => {
    g.save();
    g.translate(px, py);
    g.beginPath();
    g.moveTo(-w, 0);
    g.lineTo(-w * 0.45, -w * 0.5);
    g.lineTo(w * 0.45, -w * 0.5);
    g.lineTo(w, 0);
    g.lineTo(w * 0.45, w * 0.45);
    g.lineTo(-w * 0.45, w * 0.45);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(-w, 0);
    g.lineTo(w, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(-w * 0.45, -w * 0.5);
    g.lineTo(-w * 0.2, -w);
    g.lineTo(w * 0.2, -w);
    g.lineTo(w * 0.45, -w * 0.5);
    g.stroke();
    g.restore();
  });
}

function drawBullets(g: CanvasRenderingContext2D, snap: BlasterSnapshot): void {
  for (const b of snap.bullets) {
    g.fillStyle = b.friendly ? STROKE : "#ff8f6a";
    eachWrap(b.x, b.y, 3, (px, py) => {
      g.beginPath();
      g.arc(px, py, b.friendly ? 2.4 : 2.8, 0, Math.PI * 2);
      g.fill();
    });
  }
}

function drawParticles(g: CanvasRenderingContext2D, snap: BlasterSnapshot): void {
  for (const p of snap.particles) {
    g.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    g.fillStyle = "#dfeaff";
    g.beginPath();
    g.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawMessage(g: CanvasRenderingContext2D, snap: BlasterSnapshot): void {
  if (snap.message === null || snap.phase !== "playing") return;
  g.save();
  g.globalAlpha = 0.9;
  g.fillStyle = STROKE;
  g.font = "700 26px ui-monospace, 'Courier New', monospace";
  g.textAlign = "center";
  g.shadowBlur = 0;
  g.fillText(snap.message, FIELD_W / 2, FIELD_H * 0.28);
  g.restore();
}

function render(
  g: CanvasRenderingContext2D,
  snap: BlasterSnapshot,
  cssW: number,
  cssH: number,
  dpr: number,
  now: number,
): void {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#000000";
  g.fillRect(0, 0, cssW, cssH);
  const scale = Math.min(cssW / FIELD_W, cssH / FIELD_H);
  const ox = (cssW - FIELD_W * scale) / 2;
  const oy = (cssH - FIELD_H * scale) / 2;
  const sx = snap.shake > 0 ? (Math.random() - 0.5) * snap.shake : 0;
  const sy = snap.shake > 0 ? (Math.random() - 0.5) * snap.shake : 0;
  g.save();
  g.translate(ox + sx, oy + sy);
  g.scale(scale, scale);
  g.beginPath();
  g.rect(0, 0, FIELD_W, FIELD_H);
  g.clip();
  g.fillStyle = "#000000";
  g.fillRect(0, 0, FIELD_W, FIELD_H);

  drawStars(g, snap);

  g.lineWidth = 1.7;
  g.strokeStyle = STROKE;
  g.lineJoin = "round";
  g.shadowColor = GLOW;
  g.shadowBlur = 6;

  for (const rock of snap.rocks) drawRock(g, rock);
  for (const s of snap.saucers) drawSaucer(g, s);
  if (snap.ship !== null) drawShip(g, snap.ship, now);
  drawBullets(g, snap);
  g.shadowBlur = 0;
  drawParticles(g, snap);
  drawMessage(g, snap);

  g.strokeStyle = "rgba(120, 170, 255, 0.22)";
  g.lineWidth = 2;
  g.shadowBlur = 0;
  g.strokeRect(1, 1, FIELD_W - 2, FIELD_H - 2);
  g.restore();
}

export function Playfield() {
  const snapshot = useEngineState(blasterStore);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapRef = useRef<BlasterSnapshot>(snapshot);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  snapRef.current = snapshot;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (wrapper === null || canvas === null) return;
    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      sizeRef.current = { w, h, dpr };
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (canvas === null) return;
      const g = canvas.getContext("2d");
      if (g === null) return;
      const { w, h, dpr } = sizeRef.current;
      if (w <= 0 || h <= 0) return;
      render(g, snapRef.current, w, h, dpr, now);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
