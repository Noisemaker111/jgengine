import { seededRng } from "@jgengine/core/random/rng";

import {
  BALLS_PER_GAME,
  BALL_R,
  BARRIER_E,
  BONUS_PER_EVENT,
  BUMPER_SCORE,
  DRAIN_Y,
  DROP_SCORE,
  EXTRA_BALL_ON_COMPLETION,
  FLIPPER_E,
  FLIPPER_RATE,
  FLIPPER_RETURN_RATE,
  GRAVITY,
  LANE_REST_Y,
  LANE_X,
  LAUNCH_DRIFT,
  LAUNCH_MAX,
  LAUNCH_MIN,
  MAX_SPEED,
  MAX_SUBSTEPS,
  MESSAGE_SECONDS,
  MICRO_LEN,
  MIN_SUBSTEPS,
  MULTIPLIERS,
  NUDGE_VX,
  NUDGE_VY,
  PLUNGER_CHARGE_RATE,
  ROLLOVER_COMPLETE_SCORE,
  ROLLOVER_SCORE,
  SAVER_SECONDS,
  SCORE_FEED_LIMIT,
  SLING_SCORE,
  SPOT_BONUS,
  TILT_LIMIT,
  TILT_WINDOW,
} from "./config";
import {
  advanceFlipper,
  clamp,
  clampSpeed,
  collideBarrierObj,
  collideBumper,
  collideDropTarget,
  collideFlipper,
  collideWall,
} from "./physics";
import { buildTable, type Table } from "./table";
import type { Ball, Phase, ScoreEvent } from "./types";

export interface StepInput {
  left: boolean;
  right: boolean;
  plunger: boolean;
}

export class PinballSim {
  seed: string | number;
  private rng: () => number;
  table: Table;
  ball: Ball;
  phase: Phase = "ready";

  score = 0;
  ballStartScore = 0;
  ballScore = 0;
  lastBallScore = 0;
  ballIndex = 1;
  ballsRemaining = BALLS_PER_GAME;

  plungerCharge = 0;
  charging = false;

  multiplierIndex = 0;
  rolloverLit: boolean[] = [false, false, false];
  dropCompletions = 0;
  spotBonusLit = false;
  extraBallLit = false;

  accBonus = 0;
  lastEndBonus = 0;

  ballTimer = 0;
  saverUsed = false;

  tiltCount = 0;
  tiltTimer = 0;
  tilted = false;

  events: ScoreEvent[] = [];
  private seq = 0;
  message = "SHOOT AGAIN";
  messageKind: ScoreEvent["kind"] | "tilt" | "save" = "special";
  messageTimer = 0;

  private leftPrev = false;
  private rightPrev = false;

  constructor(opts: { seed: string | number }) {
    this.seed = opts.seed;
    this.rng = seededRng(opts.seed);
    this.table = buildTable();
    this.ball = { x: LANE_X, y: LANE_REST_Y, vx: 0, vy: 0, r: BALL_R };
    this.resetGame();
  }

  multiplier(): number {
    return MULTIPLIERS[this.multiplierIndex] ?? 1;
  }

  onPlunger(): boolean {
    return this.phase === "ready";
  }

  saverActive(): boolean {
    return this.phase === "play" && !this.saverUsed && this.ballTimer < SAVER_SECONDS;
  }

  resetGame(): void {
    this.score = 0;
    this.ballIndex = 1;
    this.ballsRemaining = BALLS_PER_GAME;
    this.multiplierIndex = 0;
    this.dropCompletions = 0;
    this.spotBonusLit = false;
    this.extraBallLit = false;
    for (const d of this.table.dropTargets) {
      d.up = true;
      d.flash = 0;
    }
    this.events = [];
    this.seq = 0;
    this.serveBall();
    this.message = "PLUNGE TO PLAY";
    this.messageKind = "special";
    this.messageTimer = 0;
  }

  private serveBall(): void {
    this.phase = "ready";
    this.ball.x = LANE_X;
    this.ball.y = LANE_REST_Y;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.plungerCharge = 0;
    this.charging = false;
    this.ballTimer = 0;
    this.saverUsed = false;
    this.accBonus = 0;
    this.ballStartScore = this.score;
    this.ballScore = 0;
    this.tiltCount = 0;
    this.tiltTimer = 0;
    this.tilted = false;
    this.rolloverLit = [false, false, false];
    for (const f of this.table.flippers) {
      f.up = false;
      f.angle = f.rest;
      f.omega = 0;
      f.glow = 0;
    }
  }

  private reserveBall(): void {
    this.phase = "ready";
    this.ball.x = LANE_X;
    this.ball.y = LANE_REST_Y;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.plungerCharge = 0;
    this.charging = false;
    this.ballTimer = 0;
    this.setMessage("BALL SAVED", "save");
  }

  launch(charge: number): void {
    if (this.phase !== "ready") return;
    const c = clamp(charge, 0, 1);
    this.ball.vy = -(LAUNCH_MIN + c * (LAUNCH_MAX - LAUNCH_MIN));
    this.ball.vx = -LAUNCH_DRIFT * (0.5 + 0.5 * c) + (this.rng() - 0.5) * 12;
    this.phase = "play";
    this.ballTimer = 0;
    this.plungerCharge = 0;
    this.charging = false;
  }

  nudge(): void {
    if (this.phase !== "play" || this.tilted) return;
    const dir = this.rng() < 0.5 ? -1 : 1;
    this.ball.vx += NUDGE_VX * dir;
    this.ball.vy -= NUDGE_VY;
    this.tiltCount += 1;
    this.tiltTimer = TILT_WINDOW;
    if (this.tiltCount >= TILT_LIMIT) {
      this.tilted = true;
      this.setMessage("TILT", "tilt");
    } else {
      this.setMessage(`TILT WARNING ${this.tiltCount}`, "tilt");
    }
  }

  startNewGame(): void {
    this.rng = seededRng(this.seed);
    this.resetGame();
  }

  step(dt: number, input: StepInput): void {
    const d = Math.min(dt, 0.05);
    if (d <= 0) return;
    this.decay(d);
    this.applyFlipperInput(input.left, input.right);

    if (this.phase === "ready") {
      if (input.plunger) {
        this.charging = true;
        this.plungerCharge = Math.min(1, this.plungerCharge + PLUNGER_CHARGE_RATE * d);
      } else if (this.charging) {
        this.launch(this.plungerCharge);
      }
      this.animateFlippers(d);
      return;
    }
    if (this.phase === "gameover") {
      this.animateFlippers(d);
      return;
    }

    this.ballTimer += d;
    const s = Math.hypot(this.ball.vx, this.ball.vy);
    const steps = clamp(Math.ceil((s * d) / MICRO_LEN), MIN_SUBSTEPS, MAX_SUBSTEPS);
    const h = d / steps;
    for (let i = 0; i < steps; i += 1) {
      this.advanceFlippers(h);
      this.ball.vy += GRAVITY * h;
      this.ball.x += this.ball.vx * h;
      this.ball.y += this.ball.vy * h;
      this.resolveCollisions();
      clampSpeed(this.ball, MAX_SPEED);
    }
    this.checkRollovers();
    this.checkDrain();
  }

  private applyFlipperInput(left: boolean, right: boolean): void {
    if (left && !this.leftPrev && !this.tilted) this.cycleRollovers(-1);
    if (right && !this.rightPrev && !this.tilted) this.cycleRollovers(1);
    this.leftPrev = left;
    this.rightPrev = right;
    const [lf, rf] = this.table.flippers;
    lf.up = left;
    rf.up = right;
    if (left && !this.tilted) lf.glow = 1;
    if (right && !this.tilted) rf.glow = 1;
  }

  private cycleRollovers(dir: number): void {
    const l = this.rolloverLit;
    this.rolloverLit = dir > 0 ? [l[2] ?? false, l[0] ?? false, l[1] ?? false] : [l[1] ?? false, l[2] ?? false, l[0] ?? false];
  }

  private advanceFlippers(h: number): void {
    for (const f of this.table.flippers) advanceFlipper(f, h, FLIPPER_RATE, FLIPPER_RETURN_RATE, this.tilted);
  }

  private animateFlippers(h: number): void {
    for (const f of this.table.flippers) advanceFlipper(f, h, FLIPPER_RATE, FLIPPER_RETURN_RATE, this.tilted);
  }

  private resolveCollisions(): void {
    for (const w of this.table.walls) {
      if (collideWall(this.ball, w) && w.slingId !== undefined) this.onSling(w.slingId);
    }
    for (const bar of this.table.barriers) collideBarrierObj(this.ball, bar);
    for (const d of this.table.dropTargets) {
      if (d.up && collideDropTarget(this.ball, d, BARRIER_E)) this.onDrop(d);
    }
    for (const bm of this.table.bumpers) {
      if (collideBumper(this.ball, bm)) this.onBumper(bm);
    }
    for (const f of this.table.flippers) collideFlipper(this.ball, f, FLIPPER_E);
  }

  private jitter(mag: number): void {
    const a = (this.rng() - 0.5) * 2 * mag;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const vx = this.ball.vx;
    const vy = this.ball.vy;
    this.ball.vx = vx * c - vy * s;
    this.ball.vy = vx * s + vy * c;
  }

  private onBumper(bm: { flash: number }): void {
    bm.flash = 1;
    this.jitter(0.12);
    this.award(BUMPER_SCORE, BONUS_PER_EVENT);
    this.pushEvent("BUMPER", BUMPER_SCORE, "bumper", false);
  }

  private onSling(id: number): void {
    const s = this.table.slingshots[id];
    if (s) s.flash = 1;
    this.jitter(0.1);
    this.award(SLING_SCORE, BONUS_PER_EVENT);
    this.pushEvent("SLING", SLING_SCORE, "sling", false);
  }

  private onDrop(d: { up: boolean; flash: number }): void {
    d.up = false;
    d.flash = 1;
    this.award(DROP_SCORE, BONUS_PER_EVENT);
    this.pushEvent("DROP", DROP_SCORE, "drop", true);
    if (this.table.dropTargets.every((t) => !t.up)) this.completeDropBank();
  }

  private completeDropBank(): void {
    this.dropCompletions += 1;
    this.spotBonusLit = true;
    this.score += SPOT_BONUS;
    this.pushEvent("SPOT BONUS", SPOT_BONUS, "special", true);
    for (const t of this.table.dropTargets) {
      t.up = true;
      t.flash = 1;
    }
    if (this.dropCompletions >= EXTRA_BALL_ON_COMPLETION && !this.extraBallLit) {
      this.extraBallLit = true;
      this.ballsRemaining += 1;
      this.pushEvent("EXTRA BALL", 0, "special", true);
    }
  }

  private checkRollovers(): void {
    const lanes = this.table.rollovers;
    for (let i = 0; i < lanes.length; i += 1) {
      const l = lanes[i];
      if (!l || this.rolloverLit[i]) continue;
      if (this.ball.x >= l.x0 && this.ball.x <= l.x1 && this.ball.y >= l.y0 && this.ball.y <= l.y1) {
        this.rolloverLit[i] = true;
        this.award(ROLLOVER_SCORE, BONUS_PER_EVENT);
        this.pushEvent("ROLLOVER", ROLLOVER_SCORE, "rollover", false);
      }
    }
    if (this.rolloverLit.every((v) => v)) this.completeRollovers();
  }

  private completeRollovers(): void {
    this.multiplierIndex = Math.min(MULTIPLIERS.length - 1, this.multiplierIndex + 1);
    this.score += ROLLOVER_COMPLETE_SCORE;
    this.accBonus += 2;
    this.rolloverLit = [false, false, false];
    this.pushEvent(`BONUS ${this.multiplier()}X`, ROLLOVER_COMPLETE_SCORE, "special", true);
  }

  private checkDrain(): void {
    if (this.ball.y <= DRAIN_Y) return;
    if (this.saverActive()) {
      this.saverUsed = true;
      this.reserveBall();
      return;
    }
    this.endBall();
  }

  private endBall(): void {
    const bonus = this.multiplier() * this.accBonus;
    this.score += bonus;
    this.lastEndBonus = bonus;
    this.ballScore = this.score - this.ballStartScore;
    this.lastBallScore = this.ballScore;
    this.ballsRemaining -= 1;
    if (this.ballsRemaining > 0) {
      this.ballIndex += 1;
      this.serveBall();
      this.setMessage("SHOOT AGAIN", "special");
    } else {
      this.phase = "gameover";
      this.setMessage("GAME OVER", "special");
    }
  }

  private award(score: number, bonus: number): void {
    this.score += score;
    this.accBonus += bonus;
  }

  private setMessage(label: string, kind: ScoreEvent["kind"] | "tilt" | "save"): void {
    this.message = label;
    this.messageKind = kind;
    this.messageTimer = MESSAGE_SECONDS;
  }

  private pushEvent(label: string, amount: number, kind: ScoreEvent["kind"], banner: boolean): void {
    this.seq += 1;
    this.events.unshift({ seq: this.seq, label, amount, kind });
    if (this.events.length > SCORE_FEED_LIMIT) this.events.pop();
    if (banner) this.setMessage(label, kind);
  }

  private decay(dt: number): void {
    const k = dt * 4;
    for (const bm of this.table.bumpers) bm.flash = Math.max(0, bm.flash - k);
    for (const s of this.table.slingshots) s.flash = Math.max(0, s.flash - k);
    for (const d of this.table.dropTargets) d.flash = Math.max(0, d.flash - k);
    for (const f of this.table.flippers) f.glow = Math.max(0, f.glow - dt * 6);
    if (this.messageTimer > 0) this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.tiltCount > 0 && !this.tilted) {
      this.tiltTimer -= dt;
      if (this.tiltTimer <= 0) {
        this.tiltCount = Math.max(0, this.tiltCount - 1);
        this.tiltTimer = this.tiltCount > 0 ? TILT_WINDOW : 0;
      }
    }
  }
}
