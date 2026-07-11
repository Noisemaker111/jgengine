import { memo, useEffect, useRef } from "react";

import {
  COLS,
  FIELD_H,
  FIELD_W,
  HOME_ROW,
  MEDIAN_ROW,
  ROWS,
  START_ROW,
  TILE,
} from "../../hopper/constants";
import { roadHopperStore } from "../../hopper/store";
import type { HopperSnapshot, HopperView, LaneView } from "../../hopper/store";
import { PALETTE } from "../theme";

function rowTop(row: number): number {
  return (ROWS - 1 - row) * TILE;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

function drawBands(c: CanvasRenderingContext2D, snapshot: HopperSnapshot): void {
  // start + median grass strips
  for (const row of [START_ROW, MEDIAN_ROW]) {
    const y = rowTop(row);
    const g = c.createLinearGradient(0, y, 0, y + TILE);
    g.addColorStop(0, PALETTE.grassEdge);
    g.addColorStop(0.15, PALETTE.grass);
    g.addColorStop(1, PALETTE.grassDark);
    c.fillStyle = g;
    c.fillRect(0, y, FIELD_W, TILE);
  }

  // road lanes 1..5
  for (let row = 1; row <= 5; row += 1) {
    const y = rowTop(row);
    c.fillStyle = row % 2 === 0 ? PALETTE.asphalt : PALETTE.asphaltAlt;
    c.fillRect(0, y, FIELD_W, TILE);
    c.strokeStyle = "rgba(201,180,88,0.55)";
    c.lineWidth = 2;
    c.setLineDash([TILE * 0.4, TILE * 0.4]);
    c.beginPath();
    c.moveTo(0, y + TILE / 2);
    c.lineTo(FIELD_W, y + TILE / 2);
    c.stroke();
    c.setLineDash([]);
  }

  // river lanes 7..11 with parallax shimmer
  for (let row = 7; row <= 11; row += 1) {
    const y = rowTop(row);
    const g = c.createLinearGradient(0, y, 0, y + TILE);
    g.addColorStop(0, PALETTE.riverAlt);
    g.addColorStop(0.5, PALETTE.river);
    g.addColorStop(1, PALETTE.riverDeep);
    c.fillStyle = g;
    c.fillRect(0, y, FIELD_W, TILE);
    c.save();
    c.globalAlpha = 0.14;
    c.strokeStyle = PALETTE.bankLight;
    c.lineWidth = 2;
    const shift = (snapshot.parallax * TILE * (row % 2 === 0 ? 1 : -1)) % (TILE * 1.5);
    for (let x = -TILE * 1.5; x < FIELD_W + TILE * 1.5; x += TILE * 1.5) {
      c.beginPath();
      c.moveTo(x + shift, y + TILE * 0.7);
      c.lineTo(x + shift + TILE * 0.6, y + TILE * 0.45);
      c.stroke();
    }
    c.restore();
  }

  // banks framing the river (parallax texture edges on median + home)
  c.fillStyle = "rgba(58,74,160,0.35)";
  c.fillRect(0, rowTop(7) + TILE - 3, FIELD_W, 3);
  c.fillRect(0, rowTop(HOME_ROW) + TILE - 3, FIELD_W, 3);
}

function drawHomes(c: CanvasRenderingContext2D, snapshot: HopperSnapshot): void {
  const y = rowTop(HOME_ROW);
  // hedge backdrop
  c.fillStyle = PALETTE.hedge;
  c.fillRect(0, y, FIELD_W, TILE);
  c.fillStyle = "rgba(20,83,45,0.5)";
  for (let x = 0; x < FIELD_W; x += 8) c.fillRect(x, y + 4, 4, TILE - 8);

  for (const bay of snapshot.homes) {
    const bx = bay.col * TILE + TILE * 0.08;
    const bw = TILE * 0.84;
    roundRect(c, bx, y + 5, bw, TILE - 10, 6);
    c.fillStyle = bay.filled ? PALETTE.home : PALETTE.homeEmpty;
    c.fill();
    c.strokeStyle = "rgba(120,220,160,0.35)";
    c.lineWidth = 1.5;
    c.stroke();

    const cx = bay.col * TILE + TILE / 2;
    const cy = y + TILE / 2;
    if (bay.filled) {
      c.fillStyle = PALETTE.homeFrog;
      c.beginPath();
      c.arc(cx, cy, TILE * 0.22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = PALETTE.hopperEye;
      c.beginPath();
      c.arc(cx - 4, cy - 3, 2, 0, Math.PI * 2);
      c.arc(cx + 4, cy - 3, 2, 0, Math.PI * 2);
      c.fill();
    } else if (bay.fly) {
      c.save();
      c.shadowColor = PALETTE.fly;
      c.shadowBlur = 12;
      c.fillStyle = PALETTE.fly;
      c.beginPath();
      c.arc(cx, cy, TILE * 0.14, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.strokeStyle = "rgba(255,224,102,0.7)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(cx - 5, cy - 4, 5, 3, -0.6, 0, Math.PI * 2);
      c.ellipse(cx + 5, cy - 4, 5, 3, 0.6, 0, Math.PI * 2);
      c.stroke();
    }
  }
}

function drawLane(c: CanvasRenderingContext2D, lane: LaneView): void {
  const y = rowTop(lane.row);
  for (const body of lane.bodies) {
    const x = body.x * TILE;
    const w = body.len * TILE;
    if (x + w < -TILE || x > FIELD_W + TILE) continue;

    if (lane.kind === "road") {
      const isTruck = lane.variant === "truck";
      const grad = c.createLinearGradient(0, y + 6, 0, y + TILE - 6);
      const top = isTruck ? PALETTE.truck : lane.dir === 1 ? PALETTE.carAlt : PALETTE.car;
      grad.addColorStop(0, top);
      grad.addColorStop(1, "rgba(0,0,0,0.4)");
      roundRect(c, x + 3, y + 6, w - 6, TILE - 12, 6);
      c.fillStyle = grad;
      c.fill();
      // windows
      c.fillStyle = "rgba(190,230,255,0.55)";
      roundRect(c, x + w * 0.34, y + 10, w * 0.32, TILE * 0.3, 3);
      c.fill();
      // neon headlights in travel direction
      c.save();
      c.shadowColor = PALETTE.headlight;
      c.shadowBlur = 14;
      c.fillStyle = PALETTE.headlight;
      const hx = lane.dir === 1 ? x + w - 6 : x + 6;
      c.beginPath();
      c.arc(hx, y + TILE * 0.42, 2.4, 0, Math.PI * 2);
      c.arc(hx, y + TILE * 0.62, 2.4, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else if (lane.variant === "log") {
      const grad = c.createLinearGradient(0, y + 6, 0, y + TILE - 6);
      grad.addColorStop(0, PALETTE.logTop);
      grad.addColorStop(0.5, PALETTE.log);
      grad.addColorStop(1, PALETTE.logDark);
      roundRect(c, x + 1, y + 7, w - 2, TILE - 14, TILE * 0.28);
      c.fillStyle = grad;
      c.fill();
      c.strokeStyle = "rgba(60,32,12,0.6)";
      c.lineWidth = 1.5;
      for (let k = 1; k < body.len; k += 1) {
        c.beginPath();
        c.moveTo(x + k * TILE, y + 8);
        c.lineTo(x + k * TILE, y + TILE - 8);
        c.stroke();
      }
      // end grain
      c.fillStyle = PALETTE.logDark;
      c.beginPath();
      c.ellipse(x + 5, y + TILE / 2, 3.5, TILE * 0.24, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      // turtle cluster
      const n = body.len;
      for (let k = 0; k < n; k += 1) {
        const tx = x + k * TILE + TILE / 2;
        const ty = y + TILE / 2;
        if (lane.submerged) {
          c.strokeStyle = PALETTE.turtleDive;
          c.lineWidth = 2;
          c.beginPath();
          c.arc(tx, ty, TILE * 0.2, 0.2, Math.PI - 0.2);
          c.stroke();
          continue;
        }
        const blink = lane.blinking;
        c.save();
        if (blink) c.globalAlpha = 0.55;
        c.fillStyle = PALETTE.turtleShell;
        c.beginPath();
        c.arc(tx, ty, TILE * 0.28, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = PALETTE.turtle;
        c.beginPath();
        c.arc(tx, ty, TILE * 0.2, 0, Math.PI * 2);
        c.fill();
        // shell segments
        c.strokeStyle = "rgba(20,70,40,0.7)";
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(tx - TILE * 0.18, ty);
        c.lineTo(tx + TILE * 0.18, ty);
        c.moveTo(tx, ty - TILE * 0.18);
        c.lineTo(tx, ty + TILE * 0.18);
        c.stroke();
        // head in travel direction
        c.fillStyle = PALETTE.turtle;
        c.beginPath();
        c.arc(tx + lane.dir * TILE * 0.28, ty, TILE * 0.08, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
  }
}

function drawHopper(c: CanvasRenderingContext2D, hopper: HopperView, snapshot: HopperSnapshot): void {
  const cx = (hopper.col + 0.5) * TILE;
  const baseY = rowTop(hopper.row) + TILE / 2;
  const dying = snapshot.deathKind !== null;
  const dp = snapshot.deathProgress;

  if (dying && snapshot.deathKind === "splash") {
    c.save();
    c.strokeStyle = PALETTE.splash;
    c.globalAlpha = 1 - dp;
    for (let i = 0; i < 3; i += 1) {
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, baseY, TILE * (0.15 + dp * 0.5) + i * 5, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = Math.max(0, 1 - dp * 1.4);
    c.fillStyle = PALETTE.hopper;
    c.beginPath();
    c.arc(cx, baseY + dp * 8, TILE * 0.24 * (1 - dp * 0.6), 0, Math.PI * 2);
    c.fill();
    c.restore();
    return;
  }

  c.save();
  c.translate(cx, baseY);

  const facing = hopper.facing;
  const angle = facing === "up" ? 0 : facing === "down" ? Math.PI : facing === "left" ? -Math.PI / 2 : Math.PI / 2;
  c.rotate(angle);

  let scaleX = 1;
  let scaleY = 1;
  let lift = 0;
  if (!dying) {
    const p = hopper.hop;
    lift = -Math.sin(p * Math.PI) * 7;
    // squash on take-off and landing, stretch mid-hop
    scaleY = 1 + Math.sin(p * Math.PI) * 0.22 - (p < 0.2 ? (0.2 - p) : 0);
    scaleX = 1 - Math.sin(p * Math.PI) * 0.12;
  }
  if (dying && snapshot.deathKind === "squish") {
    scaleY = Math.max(0.18, 1 - dp);
    scaleX = 1 + dp * 0.7;
  }
  if (dying && snapshot.deathKind === "timeout") {
    c.globalAlpha = Math.max(0, 1 - dp);
  }

  c.translate(0, lift);
  c.scale(scaleX, scaleY);

  const r = TILE * 0.3;
  // legs
  c.fillStyle = PALETTE.hopperDark;
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(sx * r * 0.72, r * 0.55, r * 0.28, r * 0.5, sx * 0.5, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(sx * r * 0.7, -r * 0.6, r * 0.24, r * 0.42, sx * -0.4, 0, Math.PI * 2);
    c.fill();
  }
  // body
  c.fillStyle = PALETTE.hopper;
  roundRect(c, -r, -r, r * 2, r * 2, r * 0.55);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(c, -r + 3, -r + 3, r * 2 - 6, r, r * 0.5);
  c.fill();
  // eyes (toward facing = -y after rotation)
  c.fillStyle = PALETTE.hopper;
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.arc(sx * r * 0.45, -r * 0.7, r * 0.32, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = PALETTE.hopperEye;
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.arc(sx * r * 0.45, -r * 0.78, r * 0.15, 0, Math.PI * 2);
    c.fill();
  }
  if (dying && snapshot.deathKind === "timeout") {
    c.rotate(-angle);
    c.fillStyle = PALETTE.danger;
    c.font = `bold ${TILE * 0.4}px ${"system-ui"}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("!", 0, -TILE * 0.5);
  }
  c.restore();
}

function render(canvas: HTMLCanvasElement, snapshot: HopperSnapshot): void {
  const c = canvas.getContext("2d");
  if (c === null) return;
  c.setTransform(canvas.width / FIELD_W, 0, 0, canvas.height / FIELD_H, 0, 0);
  c.clearRect(0, 0, FIELD_W, FIELD_H);

  const sky = c.createLinearGradient(0, 0, 0, FIELD_H);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(0.5, PALETTE.skyMid);
  sky.addColorStop(1, PALETTE.skyBottom);
  c.fillStyle = sky;
  c.fillRect(0, 0, FIELD_W, FIELD_H);

  drawBands(c, snapshot);
  drawHomes(c, snapshot);
  for (const lane of snapshot.lanes) drawLane(c, lane);

  if (snapshot.phase !== "ready" && snapshot.phase !== "gameover") {
    drawHopper(c, snapshot.hopper, snapshot);
  }

  // subtle vignette for dusk mood
  const vg = c.createRadialGradient(FIELD_W / 2, FIELD_H / 2, FIELD_H * 0.3, FIELD_W / 2, FIELD_H / 2, FIELD_H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.35)");
  c.fillStyle = vg;
  c.fillRect(0, 0, FIELD_W, FIELD_H);

  // grid frame
  c.strokeStyle = "rgba(95,208,255,0.25)";
  c.lineWidth = 2;
  c.strokeRect(1, 1, FIELD_W - 2, FIELD_H - 2);
}

function fieldColFromClient(canvas: HTMLCanvasElement, clientX: number): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return 0;
  return ((clientX - rect.left) / rect.width) * COLS;
}

const SWIPE_THRESHOLD = 18;

function PlayfieldImpl({ onSwipe }: { onSwipe: (dir: "up" | "down" | "left" | "right") => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (canvas === null || wrap === null) return;

    const draw = () => render(canvas, roadHopperStore.getState());
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
    const unsubscribe = roadHopperStore.subscribe(draw);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center">
      <canvas
        ref={canvasRef}
        className="pointer-events-auto touch-none rounded-xl shadow-[0_0_50px_rgba(38,30,90,0.7)]"
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (start === null) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
            const canvas = canvasRef.current;
            if (canvas === null) return;
            const col = fieldColFromClient(canvas, event.clientX);
            onSwipe(col < COLS / 2 - 1 ? "left" : col > COLS / 2 + 1 ? "right" : "up");
            return;
          }
          if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "right" : "left");
          else onSwipe(dy > 0 ? "down" : "up");
        }}
      />
    </div>
  );
}

export const Playfield = memo(PlayfieldImpl);
