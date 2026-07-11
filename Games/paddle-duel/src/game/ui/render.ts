import {
  BALL_HALF,
  BALL_SIZE,
  COURT_H,
  COURT_W,
  EDGE_PULSE_TIME,
  HIT_FLASH_TIME,
  LEFT_X,
  PADDLE_HALF,
  PADDLE_W,
  RIGHT_X,
  TRAIL_LENGTH,
} from "../rules";
import type { MatchState } from "../match/state";
import { COURT_BG, FONT, glow, PHOSPHOR, PHOSPHOR_BRIGHT } from "./theme";

type Ctx2D = CanvasRenderingContext2D;

function roundRect(g: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + radius, y);
  g.arcTo(x + w, y, x + w, y + h, radius);
  g.arcTo(x + w, y + h, x, y + h, radius);
  g.arcTo(x, y + h, x, y, radius);
  g.arcTo(x, y, x + w, y, radius);
  g.closePath();
}

function drawCenterLine(g: Ctx2D): void {
  g.save();
  g.strokeStyle = "rgba(122, 235, 160, 0.5)";
  g.lineWidth = 1.3;
  g.setLineDash([4, 5.5]);
  g.shadowBlur = 6;
  g.shadowColor = glow(0.5);
  g.beginPath();
  g.moveTo(COURT_W / 2, 4);
  g.lineTo(COURT_W / 2, COURT_H - 4);
  g.stroke();
  g.restore();
}

function drawScore(g: Ctx2D, value: number, cx: number, matchPoint: boolean, now: number): void {
  const pulse = matchPoint ? 0.55 + 0.45 * Math.abs(Math.sin(now / 170)) : 0.82;
  g.save();
  g.font = `bold 22px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "top";
  g.shadowBlur = matchPoint ? 16 : 9;
  g.shadowColor = glow(matchPoint ? 0.95 : 0.7);
  g.globalAlpha = pulse;
  g.fillStyle = matchPoint ? PHOSPHOR_BRIGHT : PHOSPHOR;
  g.fillText(String(value), cx, 7);
  g.restore();
}

function drawPaddle(g: Ctx2D, x: number, y: number, flash: number): void {
  const heat = flash / HIT_FLASH_TIME;
  g.save();
  g.shadowBlur = 8 + heat * 20;
  g.shadowColor = glow(0.85);
  g.fillStyle = flash > 0 ? "#ffffff" : PHOSPHOR_BRIGHT;
  roundRect(g, x - PADDLE_W / 2, y - PADDLE_HALF, PADDLE_W, PADDLE_HALF * 2, 1.3);
  g.fill();
  g.restore();
}

function drawTrail(g: Ctx2D, m: MatchState): void {
  const len = m.trail.length;
  if (len === 0) return;
  g.save();
  g.fillStyle = PHOSPHOR;
  for (let i = 0; i < len; i += 1) {
    const t = (i + 1) / TRAIL_LENGTH;
    const p = m.trail[i]!;
    const size = BALL_SIZE * (0.35 + 0.5 * t);
    g.globalAlpha = 0.5 * t;
    g.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  g.restore();
}

function drawBall(g: Ctx2D, m: MatchState): void {
  g.save();
  g.shadowBlur = 14;
  g.shadowColor = glow(0.95);
  g.fillStyle = "#ffffff";
  g.fillRect(m.ball.x - BALL_HALF, m.ball.y - BALL_HALF, BALL_SIZE, BALL_SIZE);
  g.restore();
}

function drawEdgePulse(g: Ctx2D, amount: number, x: number): void {
  if (amount <= 0) return;
  const a = amount / EDGE_PULSE_TIME;
  g.save();
  g.globalAlpha = a * 0.6;
  g.shadowBlur = 22;
  g.shadowColor = glow(a);
  g.fillStyle = "#ffffff";
  g.fillRect(x, 0, 3, COURT_H);
  g.restore();
}

function drawServe(g: Ctx2D, m: MatchState): void {
  const count = Math.max(1, Math.ceil(m.serveCountdown));
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffffff";
  g.shadowColor = glow(0.9);
  g.shadowBlur = 16;
  g.globalAlpha = 0.92;
  g.font = `bold 26px ${FONT}`;
  g.fillText(String(count), COURT_W / 2, COURT_H / 2 - 9);
  g.font = `bold 6px ${FONT}`;
  g.globalAlpha = 0.72;
  g.shadowBlur = 8;
  g.fillStyle = PHOSPHOR;
  g.fillText(m.server === "L" ? "◂ LEFT SERVE" : "RIGHT SERVE ▸", COURT_W / 2, COURT_H / 2 + 13);
  g.restore();
}

export function render(g: Ctx2D, canvas: HTMLCanvasElement, m: MatchState): void {
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const bh = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  g.setTransform(bw / COURT_W, 0, 0, bh / COURT_H, 0, 0);

  g.globalAlpha = 1;
  g.fillStyle = COURT_BG;
  g.fillRect(0, 0, COURT_W, COURT_H);

  drawCenterLine(g);
  const now = performance.now();
  drawScore(g, m.scoreL, COURT_W / 2 - 22, m.matchPointL, now);
  drawScore(g, m.scoreR, COURT_W / 2 + 22, m.matchPointR, now);
  drawEdgePulse(g, m.edgePulseL, 0);
  drawEdgePulse(g, m.edgePulseR, COURT_W - 3);
  drawTrail(g, m);
  drawBall(g, m);
  drawPaddle(g, LEFT_X, m.left.y, m.hitFlashL);
  drawPaddle(g, RIGHT_X, m.right.y, m.hitFlashR);
  if (m.phase === "serve") drawServe(g, m);

  g.shadowBlur = 0;
  g.globalAlpha = 1;
}
