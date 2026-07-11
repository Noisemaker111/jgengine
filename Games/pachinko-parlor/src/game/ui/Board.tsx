import { useEffect, useRef } from "react";
import { BOARD, CATCH_Y, CEIL, FIELD_TOP, WALL } from "../config";
import { PALETTE } from "../palette";
import type { PachinkoSim } from "../sim";
import { pachinkoStore } from "../store";
import type { Catcher } from "../types";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackboard(ctx: CanvasRenderingContext2D, t: number, fever: boolean): void {
  const grad = ctx.createLinearGradient(0, 0, 0, BOARD.height);
  grad.addColorStop(0, PALETTE.backboard);
  grad.addColorStop(1, PALETTE.backboardShade);
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, BOARD.width, BOARD.height, 8);
  ctx.fill();

  ctx.save();
  roundRect(ctx, 0, 0, BOARD.width, BOARD.height, 8);
  ctx.clip();
  const cx = BOARD.width / 2;
  ctx.globalAlpha = fever ? 0.16 : 0.08;
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2 + t * 0.05;
    ctx.fillStyle = i % 2 === 0 ? PALETTE.bulb : PALETTE.frameLight;
    ctx.beginPath();
    ctx.moveTo(cx, -10);
    ctx.lineTo(cx + Math.cos(a) * 320, -10 + Math.sin(a) * 320);
    ctx.lineTo(cx + Math.cos(a + 0.13) * 320, -10 + Math.sin(a + 0.13) * 320);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFrameRails(ctx: CanvasRenderingContext2D): void {
  const rail = ctx.createLinearGradient(0, 0, WALL, 0);
  rail.addColorStop(0, PALETTE.brassDark);
  rail.addColorStop(0.5, PALETTE.brassLight);
  rail.addColorStop(1, PALETTE.brass);
  ctx.fillStyle = rail;
  ctx.fillRect(0, 0, WALL, BOARD.height);
  const rail2 = ctx.createLinearGradient(BOARD.width - WALL, 0, BOARD.width, 0);
  rail2.addColorStop(0, PALETTE.brass);
  rail2.addColorStop(0.5, PALETTE.brassLight);
  rail2.addColorStop(1, PALETTE.brassDark);
  ctx.fillStyle = rail2;
  ctx.fillRect(BOARD.width - WALL, 0, WALL, BOARD.height);
  ctx.fillStyle = PALETTE.brass;
  ctx.fillRect(0, 0, BOARD.width, CEIL);

  ctx.strokeStyle = "rgba(255,220,150,0.5)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(BOARD.width - WALL - 1, CEIL);
  ctx.lineTo(BOARD.width - WALL - 1, CATCH_Y);
  ctx.stroke();
}

function drawPeg(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, glow: number): void {
  if (glow > 0) {
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
    halo.addColorStop(0, `rgba(255,215,140,${0.55 * glow})`);
    halo.addColorStop(1, "rgba(255,215,140,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.brassDark;
  ctx.beginPath();
  ctx.arc(x, y + 0.4, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = glow > 0 ? PALETTE.brassLight : PALETTE.brass;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,248,220,0.85)";
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.34, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

function pocketColor(c: Catcher): string {
  if (c.kind === "gutter") return PALETTE.gutter;
  if (c.payout >= 5) return PALETTE.pocket5;
  if (c.payout >= 3) return PALETTE.pocket3;
  return PALETTE.pocket2;
}

function drawCatchers(ctx: CanvasRenderingContext2D, catchers: readonly Catcher[], t: number): void {
  const top = CATCH_Y;
  const h = BOARD.height - CATCH_Y;
  for (const c of catchers) {
    const w = c.x1 - c.x0;
    const mid = (c.x0 + c.x1) / 2;
    if (c.kind === "gate") {
      const pulse = 0.6 + 0.4 * Math.sin(t * 4);
      const glow = ctx.createRadialGradient(mid, top + 2, 1, mid, top + 2, w * 1.4);
      glow.addColorStop(0, `rgba(255,180,60,${0.55 + 0.35 * pulse})`);
      glow.addColorStop(1, "rgba(255,180,60,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(c.x0 - w, top - 12, w * 3, h + 12);
      ctx.fillStyle = PALETTE.gate;
      roundRect(ctx, c.x0, top, w, h, 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.gateGlow;
      ctx.fillRect(c.x0, top, w, 2.4);
    } else {
      ctx.fillStyle = pocketColor(c);
      roundRect(ctx, c.x0 + 0.4, top, w - 0.8, h, 2);
      ctx.fill();
    }
    if (c.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * c.flash})`;
      roundRect(ctx, c.x0 + 0.4, top, w - 0.8, h, 2);
      ctx.fill();
    }
    ctx.fillStyle = c.kind === "gutter" ? "rgba(240,225,200,0.55)" : PALETTE.ink;
    ctx.font = `bold ${c.kind === "gate" ? 9 : 6.4}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.kind === "gutter" ? "0" : String(c.payout), mid, top + h * 0.54);
  }
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, flash: number): void {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, PALETTE.steelLight);
  g.addColorStop(0.5, PALETTE.steel);
  g.addColorStop(1, PALETTE.steelDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (flash > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${flash})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r + 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawScene(ctx: CanvasRenderingContext2D, sim: PachinkoSim, t: number): void {
  drawBackboard(ctx, t, sim.feverActive);
  drawFrameRails(ctx);

  ctx.fillStyle = "rgba(58,36,22,0.25)";
  ctx.font = "italic 7px ui-serif, Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("パチンコ", BOARD.width / 2, FIELD_TOP - 22);

  for (const p of sim.pegs) drawPeg(ctx, p.x, p.y, p.r, p.glow);
  drawCatchers(ctx, sim.catchers, t);

  for (const s of sim.sparkles) {
    ctx.globalAlpha = Math.max(0, s.life);
    ctx.fillStyle = PALETTE.bulb;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const b of sim.balls) drawBall(ctx, b.x, b.y, b.r, b.hitFlash);

  for (const f of sim.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4));
    if (f.kind === "fever") {
      ctx.fillStyle = PALETTE.feverA;
      ctx.font = "bold 18px ui-sans-serif, system-ui";
    } else if (f.kind === "gate") {
      ctx.fillStyle = PALETTE.gateGlow;
      ctx.font = "bold 11px ui-sans-serif, system-ui";
    } else {
      ctx.fillStyle = PALETTE.ink;
      ctx.font = "bold 8px ui-sans-serif, system-ui";
    }
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

export function Board() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, bw, bh);
      const scale = Math.min(bw / BOARD.width, bh / BOARD.height);
      ctx.setTransform(scale, 0, 0, scale, (bw - BOARD.width * scale) / 2, (bh - BOARD.height * scale) / 2);
      drawScene(ctx, pachinkoStore.sim, performance.now() / 1000);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="block h-full w-full" />;
}
