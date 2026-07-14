import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createDashState, type DashState } from "@jgengine/core/movement/dash";
import { seededStreams } from "@jgengine/core/random/rng";
import { defineStore } from "@jgengine/core/store/defineStore";
import {
  CENTER_CIRCLE_RADIUS,
  clampToPitch,
  distance2,
  opponentGoalX,
  ownGoalX,
  scoringTeamFor,
  type Team,
} from "../arena/geometry";
import { pickAnnouncerLine } from "../announcer/lines";
import { decideAiAction, type AiConfig, type AiDecision } from "../ai/bomberAi";
import {
  bounceOffWall,
  createRestingBall,
  stepBall,
  type BallState,
} from "../physics/ballKinematics";
import { computeBlastImpulse } from "../physics/blast";
import { addCraterRecord, createCraterFieldState, type CraterFieldState } from "../craters/craterField";
import {
  MAX_ARMED_CHARGES,
  armCharge,
  armedCount,
  createChargeBank,
  detonateAll,
  detonateSlot,
  fuseProgress,
  readyToAutoDetonate,
  type ChargeBank,
  type ChargeSlot,
} from "../charges/chargeState";
import { AI_ENTITY_ID, BALL_ENTITY_ID, BALL_Y } from "../world/setup";
import { DEFAULT_DIFFICULTY, difficultyById, type DifficultyId, type DifficultyPreset } from "./difficulty";
import {
  createInitialMatchState,
  recordCraterCreated,
  recordGoal,
  tickMatch,
  winningTeam,
  type MatchState,
} from "./matchState";
import { craterStore, difficultyStore, matchStore } from "./snapshot";
import type { ChargeSlotView, MatchSnapshot } from "./snapshot";

const BLAST_RADIUS = 6.5;
const BALL_BLAST_POWER = 15;
const PLAYER_SHOVE_POWER = 3.3;
const THROW_MAX_RANGE = 13;
const THROW_FACING_DISTANCE = 6;
const PLAYER_MARGIN = 0.6;
const AI_MARGIN = 0.6;
const AI_BASE_SPEED = 6.6;

const DASH_CONFIG = {
  distance: 4.2,
  durationMs: 220,
  iframes: { fromMs: 0, toMs: 220 },
  staminaCost: 1,
  staminaMax: 1,
  staminaRegenPerSecond: 1.15,
  cooldownMs: 150,
};

function facingVector(rotationY: number): readonly [number, number] {
  return [Math.sin(rotationY), Math.cos(rotationY)];
}

function toChargeSlotView(slot: ChargeSlot | null, now: number): ChargeSlotView {
  return slot === null ? { armed: false, fuseFraction: 0 } : { armed: true, fuseFraction: fuseProgress(slot, now) };
}

function bankView(bank: ChargeBank, now: number): readonly [ChargeSlotView, ChargeSlotView] {
  const [a, b] = bank.slots;
  return [toChargeSlotView(a ?? null, now), toChargeSlotView(b ?? null, now)];
}

interface AnnouncerState {
  line: string;
  id: number;
  counters: Record<string, number>;
}

export class MatchSimulation {
  private started = false;
  private difficulty: DifficultyPreset = difficultyById(DEFAULT_DIFFICULTY);
  private match: MatchState = createInitialMatchState();
  private craters: CraterFieldState = createCraterFieldState();
  private ball: BallState = createRestingBall(0, 0);
  private cyanBank: ChargeBank = createChargeBank();
  private magentaBank: ChargeBank = createChargeBank();
  private aiPos = { x: 0, z: 0 };
  private aiTarget = { x: 0, z: 0 };
  private aiNextDecisionAt = 0;
  private aiNextThrowAt = 0;
  private lastAiDecision: AiDecision | null = null;
  private lastBlastOrigin: { x: number; z: number } | null = null;
  private dash: DashState = createDashState(DASH_CONFIG);
  private dashOrigin = { x: 0, z: 0 };
  private kickoffRng: () => number = seededStreams("craterball-match")("kickoff");
  private aiAimRng: () => number = seededStreams("craterball-match")("ai-aim");
  private announcer: AnnouncerState = { line: "", id: 0, counters: {} };
  private craterEventGate = 0;

  isStarted(): boolean {
    return this.started;
  }

  start(ctx: GameContext, difficulty: DifficultyId): void {
    this.started = true;
    this.difficulty = difficultyById(difficulty);
    this.match = createInitialMatchState();
    this.craters = createCraterFieldState();
    this.cyanBank = createChargeBank();
    this.magentaBank = createChargeBank();
    const streams = seededStreams("craterball-match");
    this.kickoffRng = streams("kickoff");
    this.aiAimRng = streams("ai-aim");
    this.dash = createDashState(DASH_CONFIG);
    this.lastBlastOrigin = null;
    this.announceEvent(ctx, "kickoff");
    this.placeKickoff(ctx);
    this.aiPos = { x: opponentGoalX("cyan") * 0.5, z: 0 };
    this.aiTarget = { ...this.aiPos };
    this.aiNextDecisionAt = 0;
    this.aiNextThrowAt = 0;
    const local = ctx.scene.entity.get(ctx.player.userId);
    if (local !== null) ctx.scene.entity.setPose(ctx.player.userId, { position: [-8, 0, 0] });
    ctx.scene.entity.setPose(AI_ENTITY_ID, { position: [this.aiPos.x, 0, this.aiPos.z] });
    this.pushSnapshot(ctx);
  }

  restart(ctx: GameContext): void {
    if (!this.started) return;
    this.start(ctx, this.difficulty.id);
  }

  private placeKickoff(ctx: GameContext): void {
    const angle = this.kickoffRng() * Math.PI * 2;
    const radius = this.kickoffRng() * CENTER_CIRCLE_RADIUS * 0.4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    this.ball = createRestingBall(x, z);
    ctx.scene.entity.setPose(BALL_ENTITY_ID, { position: [x, BALL_Y, z] });
  }

  private announceEvent(ctx: GameContext, event: Parameters<typeof pickAnnouncerLine>[0]): void {
    const index = this.announcer.counters[event] ?? 0;
    this.announcer.counters[event] = index + 1;
    this.announcer.line = pickAnnouncerLine(event, index);
    this.announcer.id += 1;
    void ctx;
  }

  private aiConfig(): AiConfig {
    return {
      defendRadius: this.difficulty.defendRadius,
      aimErrorRadius: this.difficulty.aimErrorRadius,
      standOffset: 4.5,
      throwRange: 9,
      detonateRange: 7.5,
      maxArmedCharges: MAX_ARMED_CHARGES,
    };
  }

  private resolveDetonation(ctx: GameContext, chargeX: number, chargeZ: number, team: Team): void {
    const source = { x: chargeX, z: chargeZ };
    const blastConfig = { radius: BLAST_RADIUS, power: BALL_BLAST_POWER };
    const impulse = computeBlastImpulse(source, this.ball, blastConfig);
    if (impulse !== null) {
      this.ball = { ...this.ball, vx: this.ball.vx + impulse.vx, vz: this.ball.vz + impulse.vz };
      this.lastBlastOrigin = source;
    }

    const shoveConfig = { radius: BLAST_RADIUS, power: PLAYER_SHOVE_POWER };
    const cyan = ctx.scene.entity.get(ctx.player.userId);
    if (cyan !== null && !this.dash.isInvulnerable(ctx.time.now() * 1000)) {
      const shove = computeBlastImpulse(source, { x: cyan.position[0], z: cyan.position[2] }, shoveConfig);
      if (shove !== null) {
        const [nx, nz] = clampToPitch([cyan.position[0] + shove.vx, cyan.position[2] + shove.vz], PLAYER_MARGIN);
        ctx.scene.entity.setPose(ctx.player.userId, { position: [nx, 0, nz] });
      }
    }
    const magenta = ctx.scene.entity.get(AI_ENTITY_ID);
    if (magenta !== null) {
      const shove = computeBlastImpulse(source, { x: magenta.position[0], z: magenta.position[2] }, shoveConfig);
      if (shove !== null) {
        const [nx, nz] = clampToPitch([magenta.position[0] + shove.vx, magenta.position[2] + shove.vz], AI_MARGIN);
        this.aiPos = { x: nx, z: nz };
        ctx.scene.entity.setPose(AI_ENTITY_ID, { position: [nx, 0, nz] });
      }
    }

    this.craters = addCraterRecord(this.craters, chargeX, chargeZ, ctx.time.now());
    this.match = recordCraterCreated(this.match);
    this.craterEventGate += 1;
    if (this.craterEventGate % 2 === 0) this.announceEvent(ctx, "crater");
    void team;
  }

  throwChargeAt(ctx: GameContext, x: number, z: number): void {
    if (this.match.phase !== "play" && this.match.phase !== "overtime") return;
    if (armedCount(this.cyanBank) >= MAX_ARMED_CHARGES) return;
    const local = ctx.scene.entity.get(ctx.player.userId);
    if (local === null) return;
    const px = local.position[0];
    const pz = local.position[2];
    const dist = distance2(px, pz, x, z);
    const clamped =
      dist > THROW_MAX_RANGE && dist > 1e-4
        ? { x: px + ((x - px) / dist) * THROW_MAX_RANGE, z: pz + ((z - pz) / dist) * THROW_MAX_RANGE }
        : { x, z };
    const armed = armCharge(this.cyanBank, clamped.x, clamped.z, ctx.time.now());
    if (armed === null) return;
    this.cyanBank = armed.bank;
    ctx.scene.entity.telegraph({
      from: ctx.player.userId,
      shape: { kind: "circle", radius: BLAST_RADIUS },
      at: [clamped.x, 0, clamped.z],
      windupMs: 1400,
      kind: "blast",
    });
  }

  throwFacing(ctx: GameContext): void {
    const local = ctx.scene.entity.get(ctx.player.userId);
    if (local === null) return;
    const [fx, fz] = facingVector(local.rotationY);
    this.throwChargeAt(ctx, local.position[0] + fx * THROW_FACING_DISTANCE, local.position[2] + fz * THROW_FACING_DISTANCE);
  }

  detonateLocalCharges(ctx: GameContext): void {
    if (this.match.phase !== "play" && this.match.phase !== "overtime") return;
    const result = detonateAll(this.cyanBank);
    this.cyanBank = result.bank;
    for (const slot of result.detonated) this.resolveDetonation(ctx, slot.x, slot.z, "cyan");
  }

  dodgeRoll(ctx: GameContext): void {
    const local = ctx.scene.entity.get(ctx.player.userId);
    if (local === null) return;
    const speed = Math.hypot(local.velocity[0], local.velocity[2]);
    const [dirX, dirZ] =
      speed > 0.2 ? [local.velocity[0] / speed, local.velocity[2] / speed] : facingVector(local.rotationY);
    const nowMs = ctx.time.now() * 1000;
    const burst = this.dash.tryDash({ x: dirX, z: dirZ }, nowMs);
    if ("reason" in burst) return;
    this.dashOrigin = { x: local.position[0], z: local.position[2] };
  }

  private tickAi(ctx: GameContext, dt: number): void {
    const now = ctx.time.now();
    const config = this.aiConfig();
    if (now >= this.aiNextDecisionAt) {
      this.lastAiDecision = decideAiAction(
        this.aiPos,
        { x: this.ball.x, z: this.ball.z },
        ownGoalX("magenta"),
        opponentGoalX("magenta"),
        armedCount(this.magentaBank),
        config,
        this.aiAimRng,
      );
      this.aiTarget = this.lastAiDecision.moveTarget;
      this.aiNextDecisionAt = now + this.difficulty.decisionIntervalSeconds;
    }
    const decision = this.lastAiDecision;
    if (decision === null) return;

    const speed = AI_BASE_SPEED * this.difficulty.moveSpeedMultiplier;
    const dx = this.aiTarget.x - this.aiPos.x;
    const dz = this.aiTarget.z - this.aiPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.1) {
      const step = Math.min(dist, speed * dt);
      const [nx, nz] = clampToPitch([this.aiPos.x + (dx / dist) * step, this.aiPos.z + (dz / dist) * step], AI_MARGIN);
      this.aiPos = { x: nx, z: nz };
      const rotationY = Math.atan2(dx, dz);
      ctx.scene.entity.setPose(AI_ENTITY_ID, { position: [nx, 0, nz], rotationY, dt });
    }

    if (decision.shouldThrow && now >= this.aiNextThrowAt && armedCount(this.magentaBank) < config.maxArmedCharges) {
      const armed = armCharge(this.magentaBank, decision.throwAt.x, decision.throwAt.z, now);
      if (armed !== null) {
        this.magentaBank = armed.bank;
        this.aiNextThrowAt = now + this.difficulty.throwCooldownSeconds;
        ctx.scene.entity.telegraph({
          from: AI_ENTITY_ID,
          shape: { kind: "circle", radius: BLAST_RADIUS },
          at: [decision.throwAt.x, 0, decision.throwAt.z],
          windupMs: 1400,
          kind: "blast",
        });
      }
    }
    if (decision.shouldDetonate && armedCount(this.magentaBank) > 0) {
      const result = detonateAll(this.magentaBank);
      this.magentaBank = result.bank;
      for (const slot of result.detonated) this.resolveDetonation(ctx, slot.x, slot.z, "magenta");
    }
  }

  private autoDetonate(ctx: GameContext, team: Team): void {
    const bank = team === "cyan" ? this.cyanBank : this.magentaBank;
    const ready = readyToAutoDetonate(bank, ctx.time.now());
    for (const slot of ready) {
      const currentBank = team === "cyan" ? this.cyanBank : this.magentaBank;
      const result = detonateSlot(currentBank, slot.id);
      if (team === "cyan") this.cyanBank = result.bank;
      else this.magentaBank = result.bank;
      if (result.detonated.length > 0) this.resolveDetonation(ctx, slot.x, slot.z, team);
    }
  }

  tick(ctx: GameContext, dt: number): void {
    if (!this.started || dt <= 0) return;
    const now = ctx.time.now();
    this.dash.tick(dt, now * 1000);

    const local = ctx.scene.entity.get(ctx.player.userId);
    if (local !== null && this.dash.isDashing(now * 1000)) {
      const [ox, , oz] = this.dash.offset(now * 1000);
      const [nx, nz] = clampToPitch([this.dashOrigin.x + ox, this.dashOrigin.z + oz], PLAYER_MARGIN);
      ctx.scene.entity.setPose(ctx.player.userId, { position: [nx, 0, nz] });
    }

    this.autoDetonate(ctx, "cyan");
    this.autoDetonate(ctx, "magenta");

    const wasPhase = this.match.phase;
    if (this.match.phase === "play" || this.match.phase === "overtime") {
      this.tickAi(ctx, dt);
      const craterInfluence = this.craters.records;
      let next = stepBall(this.ball, dt, craterInfluence);
      const scoring = scoringTeamFor(next.x, next.z);
      if (scoring !== null) {
        const origin = this.lastBlastOrigin ?? { x: next.x, z: next.z };
        const blastDistance = distance2(origin.x, origin.z, next.x, next.z);
        this.match = recordGoal(this.match, scoring, blastDistance, now);
        this.announceEvent(ctx, scoring === "cyan" ? "goalCyan" : "goalMagenta");
        if (this.match.phase === "fulltime") {
          this.announceEvent(ctx, winningTeam(this.match) === "cyan" ? "matchWin" : "matchLoss");
        }
        this.ball = createRestingBall(0, 0);
      } else {
        next = bounceOffWall(next);
        this.ball = next;
      }
      ctx.scene.entity.setPose(BALL_ENTITY_ID, { position: [this.ball.x, BALL_Y, this.ball.z], dt });
    }

    this.match = tickMatch(this.match, dt);
    if (wasPhase !== "kickoff" && this.match.phase === "kickoff") {
      this.placeKickoff(ctx);
      this.announceEvent(ctx, "kickoff");
    }
    if (wasPhase !== "overtime" && this.match.phase === "overtime") {
      this.announceEvent(ctx, "overtime");
    }
    if (wasPhase !== "fulltime" && this.match.phase === "fulltime" && this.announcer.counters.matchWin === undefined && this.announcer.counters.matchLoss === undefined) {
      this.announceEvent(ctx, winningTeam(this.match) === "cyan" ? "matchWin" : "matchLoss");
    }

    this.pushSnapshot(ctx);
  }

  private pushSnapshot(ctx: GameContext): void {
    const now = ctx.time.now();
    const snapshot: MatchSnapshot = {
      started: this.started,
      phase: this.match.phase,
      scoreCyan: this.match.scoreCyan,
      scoreMagenta: this.match.scoreMagenta,
      clockSeconds: this.match.clockSeconds,
      kickoffTimer: this.match.kickoffTimer,
      kickoffCount: this.match.kickoffCount,
      overtimeSeconds: this.match.overtimeSeconds,
      craterCount: this.craters.records.length,
      craterScars: this.match.craterScars,
      longestGoalBlastDistance: this.match.longestGoalBlastDistance,
      lastGoalTeam: this.match.lastGoalTeam,
      difficulty: this.difficulty.id,
      cyanCharges: bankView(this.cyanBank, now),
      magentaCharges: bankView(this.magentaBank, now),
      announcerLine: this.announcer.line,
      announcerId: this.announcer.id,
      dodgeFraction: this.dash.staminaFraction(),
    };
    matchStore.write(ctx, snapshot);
    craterStore.write(ctx, this.craters);
    setGamePhase(ctx, this.match.phase === "fulltime" ? "ended" : "playing");
  }

  setSelectedDifficulty(ctx: GameContext, id: DifficultyId): void {
    difficultyStore.write(ctx, id);
  }
}

export const simStore = defineStore<MatchSimulation | undefined>("sim", undefined);

export function getSimulation(ctx: GameContext): MatchSimulation {
  const existing = simStore.peek(ctx);
  if (existing !== undefined) return existing;
  const created = new MatchSimulation();
  simStore.write(ctx, created);
  return created;
}
