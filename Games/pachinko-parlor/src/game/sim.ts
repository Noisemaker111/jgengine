import { seededRng } from "@jgengine/core/random/rng";
import {
  AUTO_FIRE_INTERVAL,
  BALL_RADIUS,
  BANK_HISTORY_LIMIT,
  BOUNCE_JITTER,
  CATCH_Y,
  CEIL,
  DEFAULT_SEED,
  FEVER_DURATION,
  FEVER_GATE_TARGET,
  GATE_FEVER_PAYOUT,
  GATE_PAYOUT,
  GRAVITY,
  LAUNCH_ANGLE,
  LAUNCH_COST,
  LAUNCH_SPEED_MAX,
  LAUNCH_SPEED_MIN,
  LAUNCH_X,
  LAUNCH_Y,
  MAX_BALLS,
  MAX_SPEED,
  POWER_CYCLE_RATE,
  RESTITUTION,
  START_BANK,
  BOARD,
  WALL,
  WALL_RESTITUTION,
  WINS_FEED_LIMIT,
} from "./config";
import { buildCatchers, buildPegField, slotAt } from "./geometry";
import type { Ball, Catcher, FloatText, Peg, Sparkle, WinEntry } from "./types";

export function reflect(
  vx: number,
  vy: number,
  nx: number,
  ny: number,
  restitution: number,
  jitter: number,
): { vx: number; vy: number } {
  const vn = vx * nx + vy * ny;
  let rvx = vx - (1 + restitution) * vn * nx;
  let rvy = vy - (1 + restitution) * vn * ny;
  rvx += -ny * jitter;
  rvy += nx * jitter;
  return { vx: rvx, vy: rvy };
}

export function payoutFor(catcher: Catcher, feverActive: boolean): number {
  if (catcher.kind === "gate") return feverActive ? GATE_FEVER_PAYOUT : GATE_PAYOUT;
  return feverActive ? catcher.payout * 2 : catcher.payout;
}

function triangle(phase: number): number {
  const c = ((phase % 1) + 1) % 1;
  return 1 - Math.abs(1 - 2 * c);
}

function clampSpeed(ball: Ball): void {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_SPEED) {
    const k = MAX_SPEED / speed;
    ball.vx *= k;
    ball.vy *= k;
  }
}

export type SimOptions = { seed?: string | number; startBank?: number };

export class PachinkoSim {
  readonly pegs: Peg[] = buildPegField();
  readonly catchers: Catcher[] = buildCatchers();
  readonly balls: Ball[] = [];
  readonly sparkles: Sparkle[] = [];
  readonly floats: FloatText[] = [];
  readonly wins: WinEntry[] = [];
  readonly bankHistory: number[] = [];

  bank: number;
  launched = 0;
  power = 0;
  charging = false;
  autoFire = false;
  feverActive = false;
  feverTimer = 0;
  gateHits = 0;
  feverCount = 0;
  broke = false;

  private rng: () => number;
  private powerPhase = 0;
  private autoTimer = AUTO_FIRE_INTERVAL;
  private nextId = 1;
  private winSeq = 0;

  constructor(opts: SimOptions = {}) {
    this.bank = opts.startBank ?? START_BANK;
    this.rng = seededRng(opts.seed ?? DEFAULT_SEED);
    this.bankHistory.push(this.bank);
  }

  liveBalls(): number {
    let n = 0;
    for (const b of this.balls) if (b.live) n += 1;
    return n;
  }

  launch(power: number): boolean {
    if (this.bank < LAUNCH_COST) return false;
    if (this.liveBalls() >= MAX_BALLS) return false;
    const p = Math.max(0, Math.min(1, power));
    const speed = LAUNCH_SPEED_MIN + (LAUNCH_SPEED_MAX - LAUNCH_SPEED_MIN) * p;
    this.bank -= LAUNCH_COST;
    this.launched += 1;
    this.balls.push({
      id: this.nextId++,
      x: LAUNCH_X,
      y: LAUNCH_Y,
      vx: -Math.sin(LAUNCH_ANGLE) * speed,
      vy: -Math.cos(LAUNCH_ANGLE) * speed,
      r: BALL_RADIUS,
      live: true,
      hitFlash: 0,
      age: 0,
    });
    return true;
  }

  setAutoFire(on: boolean): void {
    this.autoFire = on;
    if (on) this.autoTimer = AUTO_FIRE_INTERVAL;
  }

  toggleAutoFire(): void {
    this.setAutoFire(!this.autoFire);
  }

  rebuy(amount: number = START_BANK): void {
    this.bank += amount;
    this.broke = false;
    this.bankHistory.push(this.bank);
    this.trimHistory();
  }

  step(dt: number, opts: { charging?: boolean } = {}): void {
    const prevCharging = this.charging;
    this.charging = opts.charging === true;
    if (this.charging && !prevCharging) {
      this.powerPhase = 0;
      this.power = 0;
    }
    if (this.charging || this.autoFire) {
      this.powerPhase += POWER_CYCLE_RATE * dt;
      this.power = triangle(this.powerPhase);
    }
    if (prevCharging && !this.charging) this.launch(this.power);

    if (this.autoFire) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.launch(this.power);
        this.autoTimer += AUTO_FIRE_INTERVAL;
        if (this.autoTimer <= 0) this.autoTimer = AUTO_FIRE_INTERVAL;
      }
    }

    if (this.feverActive) {
      this.feverTimer -= dt;
      if (this.feverTimer <= 0) {
        this.feverActive = false;
        this.feverTimer = 0;
      }
    }

    for (const ball of this.balls) {
      if (!ball.live) continue;
      this.stepBall(ball, dt);
    }
    for (let i = this.balls.length - 1; i >= 0; i -= 1) if (!this.balls[i]!.live) this.balls.splice(i, 1);

    this.decayVfx(dt);
    this.broke = this.bank < LAUNCH_COST && this.liveBalls() === 0;
  }

  private stepBall(ball: Ball, dt: number): void {
    ball.age += dt;
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.hitFlash > 0) ball.hitFlash = Math.max(0, ball.hitFlash - dt * 4);

    if (ball.x - ball.r < WALL) {
      ball.x = WALL + ball.r;
      ball.vx = Math.abs(ball.vx) * WALL_RESTITUTION;
    } else if (ball.x + ball.r > BOARD.width - WALL) {
      ball.x = BOARD.width - WALL - ball.r;
      ball.vx = -Math.abs(ball.vx) * WALL_RESTITUTION;
    }
    if (ball.y - ball.r < CEIL) {
      ball.y = CEIL + ball.r;
      ball.vy = Math.abs(ball.vy) * WALL_RESTITUTION;
    }

    for (const peg of this.pegs) {
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      const rr = ball.r + peg.r;
      const distSq = dx * dx + dy * dy;
      if (distSq >= rr * rr) continue;
      const dist = Math.sqrt(distSq) || 0.0001;
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = peg.x + nx * rr;
      ball.y = peg.y + ny * rr;
      const speed = Math.hypot(ball.vx, ball.vy);
      const jitter = (this.rng() * 2 - 1) * BOUNCE_JITTER * speed;
      const next = reflect(ball.vx, ball.vy, nx, ny, RESTITUTION, jitter);
      ball.vx = next.vx;
      ball.vy = next.vy;
      ball.hitFlash = 1;
      peg.glow = 1;
      this.spawnSparkle(peg.x, peg.y);
    }
    clampSpeed(ball);

    if ((ball.y >= CATCH_Y && ball.vy > 0) || ball.age > 16) {
      ball.live = false;
      this.award(ball.x);
    }
  }

  private award(x: number): void {
    const idx = slotAt(this.catchers, x);
    const catcher = this.catchers[idx]!;
    const pay = payoutFor(catcher, this.feverActive);
    this.bank += pay;
    catcher.flash = 1;
    const mid = (catcher.x0 + catcher.x1) / 2;
    this.winSeq += 1;
    this.wins.unshift({ amount: pay, kind: catcher.kind, fever: this.feverActive, seq: this.winSeq });
    if (this.wins.length > WINS_FEED_LIMIT) this.wins.length = WINS_FEED_LIMIT;
    this.floats.push({
      x: mid,
      y: CATCH_Y - 6,
      text: pay > 0 ? `+${pay}` : "0",
      life: 1,
      ttl: 1.1,
      kind: catcher.kind === "gate" ? "gate" : "win",
    });
    this.bankHistory.push(this.bank);
    this.trimHistory();

    if (catcher.kind === "gate" && !this.feverActive) {
      this.gateHits += 1;
      if (this.gateHits >= FEVER_GATE_TARGET) this.startFever();
    }
  }

  private startFever(): void {
    this.feverActive = true;
    this.feverTimer = FEVER_DURATION;
    this.gateHits = 0;
    this.feverCount += 1;
    this.floats.push({ x: BOARD.width / 2, y: 150, text: "FEVER!", life: 1, ttl: 1.6, kind: "fever" });
  }

  private spawnSparkle(x: number, y: number): void {
    const a = this.rng() * Math.PI * 2;
    const s = 18 + this.rng() * 26;
    this.sparkles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, ttl: 0.45 });
    if (this.sparkles.length > 220) this.sparkles.splice(0, this.sparkles.length - 220);
  }

  private decayVfx(dt: number): void {
    for (let i = this.sparkles.length - 1; i >= 0; i -= 1) {
      const s = this.sparkles[i]!;
      s.life -= dt / s.ttl;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0) this.sparkles.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i -= 1) {
      const f = this.floats[i]!;
      f.life -= dt / f.ttl;
      f.y -= dt * 16;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    for (const c of this.catchers) if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 2.4);
    for (const p of this.pegs) if (p.glow > 0) p.glow = Math.max(0, p.glow - dt * 3.2);
  }

  private trimHistory(): void {
    if (this.bankHistory.length > BANK_HISTORY_LIMIT) {
      this.bankHistory.splice(0, this.bankHistory.length - BANK_HISTORY_LIMIT);
    }
  }
}
