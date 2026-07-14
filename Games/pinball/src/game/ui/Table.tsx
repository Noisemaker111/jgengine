import { useEffect, useRef } from "react";
import { useGameContext } from "@jgengine/react";
import { CX, LANE_X, TABLE } from "../config";
import { flipperTip } from "../physics";
import { PALETTE } from "../palette";
import type { PinballSim } from "../sim";
import { pinballHandle } from "../store";
import type { Bumper, DropTarget, Flipper, RolloverLane, Slingshot } from "../types";

const { width: W, height: H } = TABLE;
const LABELS = ["A", "L", "L"];

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function drawField(c: CanvasRenderingContext2D): void {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, PALETTE.field);
  g.addColorStop(1, PALETTE.fieldShade);
  c.fillStyle = g;
  roundRect(c, 4, 32, W - 8, H - 36, 10);
  c.fill();

  c.save();
  roundRect(c, 4, 32, W - 8, H - 36, 10);
  c.clip();
  c.strokeStyle = "rgba(47,156,156,0.30)";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(CX, 250, 96, Math.PI, Math.PI * 2);
  c.stroke();
  c.strokeStyle = "rgba(230,119,43,0.28)";
  c.lineWidth = 2.4;
  c.beginPath();
  c.arc(CX, 250, 70, Math.PI, Math.PI * 2);
  c.stroke();
  c.strokeStyle = "rgba(58,42,28,0.14)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(30, 300);
  c.lineTo(54, 268);
  c.moveTo(W - 30, 300);
  c.lineTo(W - 54, 268);
  c.stroke();
  c.restore();
}

function drawFrame(c: CanvasRenderingContext2D): void {
  const rail = c.createLinearGradient(0, 0, 0, H);
  rail.addColorStop(0, PALETTE.brassLight);
  rail.addColorStop(0.5, PALETTE.brass);
  rail.addColorStop(1, PALETTE.brassDark);
  c.lineWidth = 6;
  c.strokeStyle = rail;
  roundRect(c, 4, 32, W - 8, H - 36, 10);
  c.stroke();
}

function drawRollovers(c: CanvasRenderingContext2D, lanes: readonly RolloverLane[], lit: readonly boolean[]): void {
  for (let i = 0; i < lanes.length; i += 1) {
    const l = lanes[i];
    if (!l) continue;
    const on = lit[i] ?? false;
    const w = l.x1 - l.x0;
    const h = l.y1 - l.y0;
    const mx = (l.x0 + l.x1) / 2;
    if (on) {
      const halo = c.createRadialGradient(mx, l.y0 + h / 2, 2, mx, l.y0 + h / 2, w);
      halo.addColorStop(0, "rgba(255,209,90,0.75)");
      halo.addColorStop(1, "rgba(255,209,90,0)");
      c.fillStyle = halo;
      c.fillRect(l.x0 - 6, l.y0 - 6, w + 12, h + 12);
    }
    roundRect(c, l.x0, l.y0, w, h, 7);
    c.fillStyle = on ? PALETTE.lampOn : "rgba(58,42,28,0.14)";
    c.fill();
    c.lineWidth = 1.4;
    c.strokeStyle = on ? PALETTE.orangeLight : PALETTE.brassDark;
    c.stroke();
    c.fillStyle = on ? "#3a1c08" : PALETTE.fieldInk;
    c.font = "bold 13px ui-sans-serif, system-ui";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(LABELS[i] ?? "", mx, l.y0 + h / 2 + 0.5);
  }
}

function drawDrops(c: CanvasRenderingContext2D, drops: readonly DropTarget[]): void {
  for (const d of drops) {
    const w = d.bx - d.ax;
    const x = d.ax;
    const y = d.ay - 8;
    if (d.up) {
      roundRect(c, x, y, w, 14, 3);
      const g = c.createLinearGradient(0, y, 0, y + 14);
      g.addColorStop(0, PALETTE.tealLight);
      g.addColorStop(1, PALETTE.tealDark);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = PALETTE.cream;
      c.lineWidth = 1;
      c.stroke();
      if (d.flash > 0) {
        c.fillStyle = `rgba(255,255,255,${0.7 * d.flash})`;
        roundRect(c, x, y, w, 14, 3);
        c.fill();
      }
    } else {
      roundRect(c, x + 1, d.ay - 1, w - 2, 4, 2);
      c.fillStyle = "rgba(28,20,14,0.5)";
      c.fill();
    }
  }
}

function drawSlings(c: CanvasRenderingContext2D, slings: readonly Slingshot[]): void {
  for (const s of slings) {
    const baseX = s.ax < CX ? 10 : W - 10;
    c.beginPath();
    c.moveTo(s.ax, s.ay);
    c.lineTo(s.bx, s.by);
    c.lineTo(baseX, s.by + 22);
    c.closePath();
    const g = c.createLinearGradient(s.ax, s.ay, baseX, s.by);
    g.addColorStop(0, PALETTE.orangeLight);
    g.addColorStop(1, PALETTE.orangeDark);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = s.flash > 0 ? PALETTE.bulbHot : PALETTE.cream;
    c.beginPath();
    c.moveTo(s.ax, s.ay);
    c.lineTo(s.bx, s.by);
    c.stroke();
    if (s.flash > 0) {
      c.strokeStyle = `rgba(255,220,150,${s.flash})`;
      c.lineWidth = 5;
      c.stroke();
    }
  }
}

function drawBumpers(c: CanvasRenderingContext2D, bumpers: readonly Bumper[]): void {
  for (const b of bumpers) {
    const glow = b.flash;
    const halo = c.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * (2.6 + glow));
    halo.addColorStop(0, `rgba(255,157,60,${0.35 + 0.5 * glow})`);
    halo.addColorStop(1, "rgba(255,157,60,0)");
    c.fillStyle = halo;
    c.beginPath();
    c.arc(b.x, b.y, b.r * (2.6 + glow), 0, Math.PI * 2);
    c.fill();

    c.fillStyle = PALETTE.tealDark;
    c.beginPath();
    c.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
    c.fill();
    const cap = c.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r);
    cap.addColorStop(0, glow > 0.1 ? PALETTE.bulbHot : PALETTE.cream);
    cap.addColorStop(1, glow > 0.1 ? PALETTE.orange : PALETTE.tealLight);
    c.fillStyle = cap;
    c.beginPath();
    c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = PALETTE.fieldInk;
    c.font = "bold 7px ui-sans-serif, system-ui";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("100", b.x, b.y + 0.5);
  }
}

function drawPlungerLane(c: CanvasRenderingContext2D, sim: PinballSim): void {
  c.fillStyle = "rgba(58,42,28,0.14)";
  roundRect(c, 190, 86, 16, H - 96, 4);
  c.fill();
  const charge = sim.plungerCharge;
  if (sim.phase === "ready") {
    const laneBottom = H - 16;
    const barH = (laneBottom - 120) * charge;
    const g = c.createLinearGradient(0, laneBottom - barH, 0, laneBottom);
    g.addColorStop(0, PALETTE.red);
    g.addColorStop(1, PALETTE.orange);
    c.fillStyle = g;
    roundRect(c, 193, laneBottom - barH, 10, barH, 3);
    c.fill();
  }
}

function drawFlipper(c: CanvasRenderingContext2D, f: Flipper): void {
  const { tx, ty } = flipperTip(f);
  c.lineCap = "round";
  c.lineWidth = f.capR * 2 + 3;
  c.strokeStyle = PALETTE.cabinetDark;
  c.beginPath();
  c.moveTo(f.px, f.py);
  c.lineTo(tx, ty);
  c.stroke();
  c.lineWidth = f.capR * 2;
  const g = c.createLinearGradient(f.px, f.py, tx, ty);
  g.addColorStop(0, PALETTE.orangeLight);
  g.addColorStop(1, f.glow > 0.1 ? PALETTE.yellow : PALETTE.orange);
  c.strokeStyle = g;
  c.beginPath();
  c.moveTo(f.px, f.py);
  c.lineTo(tx, ty);
  c.stroke();
  c.fillStyle = PALETTE.brass;
  c.beginPath();
  c.arc(f.px, f.py, 3, 0, Math.PI * 2);
  c.fill();
}

function drawBall(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const sh = c.createRadialGradient(x, y + r * 0.6, 0.5, x, y + r * 0.6, r * 1.6);
  sh.addColorStop(0, "rgba(0,0,0,0.30)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = sh;
  c.beginPath();
  c.arc(x, y + r * 0.7, r * 1.3, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, PALETTE.steelLight);
  g.addColorStop(0.5, PALETTE.steel);
  g.addColorStop(1, PALETTE.steelDark);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function drawScene(c: CanvasRenderingContext2D, sim: PinballSim): void {
  drawField(c);
  drawRollovers(c, sim.table.rollovers, sim.rolloverLit);
  drawDrops(c, sim.table.dropTargets);
  drawBumpers(c, sim.table.bumpers);
  drawSlings(c, sim.table.slingshots);
  drawPlungerLane(c, sim);
  for (const f of sim.table.flippers) drawFlipper(c, f);
  drawBall(c, sim.ball.x, sim.ball.y, sim.ball.r);
  drawFrame(c);
}

type Zone = "left" | "right" | "plunge";

export function Table() {
  const ctx = useGameContext();
  const ref = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, Zone>());

  const applyPointers = (): void => {
    let l = false;
    let r = false;
    let p = false;
    for (const z of pointers.current.values()) {
      if (z === "left") l = true;
      else if (z === "right") r = true;
      else p = true;
    }
    const store = pinballHandle.read(ctx);
    store.setPointerFlip("left", l);
    store.setPointerFlip("right", r);
    store.setPointerPlunge(p);
  };

  const zoneAt = (clientX: number, clientY: number): Zone => {
    const canvas = ref.current;
    if (canvas === null) return "left";
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const ox = (rect.width - W * scale) / 2;
    const oy = (rect.height - H * scale) / 2;
    const tx = (clientX - rect.left - ox) / scale;
    const ty = (clientY - rect.top - oy) / scale;
    if (tx > LANE_X - 20 && ty > 250) return "plunge";
    return tx < CX ? "left" : "right";
  };

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const canvasCtx = canvas.getContext("2d");
    if (canvasCtx === null) return;
    let raf = 0;
    const render = (): void => {
      raf = requestAnimationFrame(render);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw === 0 || ch === 0) return;
      const bw = Math.round(cw * dpr);
      const bh = Math.round(ch * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
      canvasCtx.clearRect(0, 0, bw, bh);
      const scale = Math.min(bw / W, bh / H);
      canvasCtx.setTransform(scale, 0, 0, scale, (bw - W * scale) / 2, (bh - H * scale) / 2);
      drawScene(canvasCtx, pinballHandle.read(ctx).sim);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [ctx]);

  return (
    <canvas
      ref={ref}
      className="block h-full w-full touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, zoneAt(e.clientX, e.clientY));
        applyPointers();
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        applyPointers();
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        applyPointers();
      }}
      onPointerLeave={(e) => {
        pointers.current.delete(e.pointerId);
        applyPointers();
      }}
    />
  );
}
